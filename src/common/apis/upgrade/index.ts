import type Calculator from "@/calculator"
import type { ActionConfig, ActionConfigItem, PlayerEquipmentItem } from "@/pinia/stores/player"
import type { Action, Equipment, ItemDetail } from "~/game"
import { CoinifyCalculator, DecomposeCalculator, TransmuteCalculator } from "@/calculator/alchemy"
import { GatherCalculator } from "@/calculator/gather"
import { ManufactureCalculator } from "@/calculator/manufacture"
import { DEFAULT_SEPCIAL_EQUIPMENT_LIST } from "@/common/config"
import { getTrans } from "@/locales"
import { getGameDataApi, getItemDetailOf, getMarketDataApi, getPriceOf } from "../game"
import { getDefaultActionConfigOf, getEquipmentListOf, getPlayerLevelOf, getSpecialEquipmentListOf, runWithPlayerContext } from "../player"

type ActionSlot = "tool" | "body" | "legs" | "back" | "charm"
type SpecialSlot = "off_hand" | "head" | "hands" | "feet" | "neck" | "earrings" | "ring" | "pouch"
export type UpgradeSlot = ActionSlot | SpecialSlot
/** naked=只算0级；sameLevel=与现装同级；all=市场上所有有卖单的强化等级 */
export type EvalMode = "naked" | "sameLevel" | "all"

export interface UpgradeCandidate {
  slot: UpgradeSlot
  hrid: string
  name: string
  itemLevel: number
  /** 评估所用的强化等级 */
  evalLevel: number
  /** 该强化等级的市场买价 */
  cost: number
  /** Δ利润/时（N 个基准项目的平均；护符口径下无意义，恒 0） */
  profitDelta: number
  /** Δ经验/时（N 个基准项目的平均，仅护符口径使用） */
  expDelta: number
  /** true=护符，按经验口径比较 */
  isExpMetric: boolean
  /** 性价比 = 平均提升量 / 成本 */
  valueRate: number
  /** 回本小时 = 成本 / 平均Δ利润（经验口径无意义） */
  paybackHours: number
}

export interface BaselineItem {
  hrid: string
  name: string
  profitPH: number
}

export interface ActionUpgradeResult {
  action: Action
  actionLabel: string
  /** 该专业当前等级下利润最高的 N 个项目（按物品去重） */
  baselines: BaselineItem[]
  /** N 个基准项目的平均利润/时 */
  baselineProfitPH: number
  /** 每部位现装 */
  current: Partial<Record<UpgradeSlot, { hrid: string, name: string, level: number }>>
  /** 每部位性价比最高的建议（无提升则缺） */
  best: Partial<Record<UpgradeSlot, UpgradeCandidate>>
  /** 全部候选，按性价比降序 */
  candidates: UpgradeCandidate[]
}

export interface PresetUpgradeResult {
  presetIndex: number
  presetName: string
  color?: string
  actions: ActionUpgradeResult[]
}

export interface UpgradeCompareParams {
  presets: { index: number, config: ActionConfig }[]
  /** 不传 = 全部专业 */
  action?: Action
  evalMode: EvalMode
  /** 基准项目数（该专业利润最高的前 N 个物品取平均），默认 3 */
  topN?: number
  onProgress?: (label: string, current: number, total: number) => void
}

type CalcKind = "gather" | "manufacture" | "transmute" | "decompose" | "coinify"

interface ActionDef {
  action: Action
  labelKey: string
  kinds: CalcKind[]
}

/** 纳入比较的专业：强化不进利润榜，暂不参与 */
const ACTION_DEFS: ActionDef[] = [
  { action: "milking", labelKey: "挤奶", kinds: ["gather"] },
  { action: "foraging", labelKey: "采摘", kinds: ["gather"] },
  { action: "woodcutting", labelKey: "伐木", kinds: ["gather"] },
  { action: "cheesesmithing", labelKey: "锻造", kinds: ["manufacture"] },
  { action: "crafting", labelKey: "制造", kinds: ["manufacture"] },
  { action: "tailoring", labelKey: "裁缝", kinds: ["manufacture"] },
  { action: "cooking", labelKey: "烹饪", kinds: ["manufacture"] },
  { action: "brewing", labelKey: "冲泡", kinds: ["manufacture"] },
  { action: "alchemy", labelKey: "炼金", kinds: ["transmute", "decompose", "coinify"] }
]

const SLOTS: UpgradeSlot[] = ["tool", "body", "legs", "back", "charm", "off_hand", "head", "hands", "feet", "neck", "earrings", "ring", "pouch"]
export { SLOTS as UPGRADE_SLOTS }

const ACTION_SLOTS: UpgradeSlot[] = ["tool", "body", "legs", "back", "charm"]

function isSpecialSlot(slot: UpgradeSlot): slot is SpecialSlot {
  return !ACTION_SLOTS.includes(slot)
}

export const SLOT_LABEL_KEYS: Record<UpgradeSlot, string> = {
  tool: "工具",
  body: "衣服",
  legs: "裤子",
  back: "披风",
  charm: "护符",
  off_hand: "副手",
  head: "头部",
  hands: "手套",
  feet: "鞋子",
  neck: "项链",
  earrings: "耳环",
  ring: "戒指",
  pouch: "袋子"
}

function projectOf(action: Action): string {
  const map: Record<string, string> = {
    milking: "挤奶",
    foraging: "采摘",
    woodcutting: "伐木",
    cheesesmithing: "锻造",
    crafting: "制造",
    tailoring: "裁缝",
    cooking: "烹饪",
    brewing: "冲泡"
  }
  return getTrans(map[action] || action)
}

function makeCalc(kind: CalcKind, hrid: string, action: Action, catalystRank = 0): Calculator {
  switch (kind) {
    case "gather":
      return new GatherCalculator({ hrid, project: projectOf(action), action, includeRare: true })
    case "manufacture":
      return new ManufactureCalculator({ hrid, project: projectOf(action), action })
    case "transmute":
      return new TransmuteCalculator({ hrid, catalystRank })
    case "decompose":
      return new DecomposeCalculator({ hrid, catalystRank })
    case "coinify":
      return new CoinifyCalculator({ hrid, catalystRank })
  }
}

interface BaselineProject {
  kind: CalcKind
  hrid: string
  catalystRank: number
  profitPH: number
  expPH: number
}

/** 找该专业利润最高的前 N 个项目（按物品去重，同物品取最优做法）。必须在对应预设上下文中调用 */
function findTopProjects(action: Action, topN: number): BaselineProject[] {
  const def = ACTION_DEFS.find(d => d.action === action)!
  const playerLevel = getPlayerLevelOf(action)
  const catalystRanks = action === "alchemy" ? [0, 1, 2] : [0]
  const bestByHrid = new Map<string, BaselineProject>()
  for (const item of Object.values(getGameDataApi().itemDetailMap)) {
    for (const kind of def.kinds) {
      for (const catalystRank of catalystRanks) {
        try {
          const cal = makeCalc(kind, item.hrid, action, catalystRank)
          if (!cal.available) continue
          if (cal.actionLevel > playerLevel) continue
          cal.run()
          const profitPH = cal.result?.profitPH
          if (typeof profitPH !== "number" || profitPH <= 0) continue
          const prev = bestByHrid.get(item.hrid)
          if (!prev || profitPH > prev.profitPH) {
            bestByHrid.set(item.hrid, { kind, hrid: item.hrid, catalystRank, profitPH, expPH: cal.result.expPH })
          }
        } catch {
          // 单条计算失败不影响整体
        }
      }
    }
  }
  return [...bestByHrid.values()].sort((a, b) => b.profitPH - a.profitPH).slice(0, Math.max(1, topN))
}

function runBaselineCalc(kind: CalcKind, hrid: string, action: Action, catalystRank: number): { profitPH: number, expPH: number } | null {
  try {
    const cal = makeCalc(kind, hrid, action, catalystRank)
    if (!cal.available) return null
    cal.run()
    if (!cal.result) return null
    return { profitPH: cal.result.profitPH, expPH: cal.result.expPH }
  } catch {
    return null
  }
}

/** 在传入（已换装）配置下计算 N 个基准项目的平均 Δ利润/时 与 Δ经验/时（一次上下文切换内完成 N 次计算） */
function evaluateOn(config: ActionConfig, action: Action, baselines: BaselineProject[]): { profitDelta: number, expDelta: number } | null {
  return runWithPlayerContext(config, () => {
    let profitSum = 0
    let expSum = 0
    for (const bp of baselines) {
      const r = runBaselineCalc(bp.kind, bp.hrid, action, bp.catalystRank)
      if (!r) return null
      profitSum += r.profitPH - bp.profitPH
      expSum += r.expPH - bp.expPH
    }
    return { profitDelta: profitSum / baselines.length, expDelta: expSum / baselines.length }
  })
}

function withSlotSwapped(config: ActionConfig, action: Action, baseItem: ActionConfigItem, slot: ActionSlot, hrid: string, level: number): ActionConfig {
  const prev = (baseItem[slot] ?? { type: slot === "tool" ? `${action}_tool` : slot }) as PlayerEquipmentItem
  const next: ActionConfigItem = {
    ...baseItem,
    [slot]: { type: prev.type, hrid, enhanceLevel: level }
  }
  const map = new Map(config.actionConfigMap)
  map.set(action, next)
  return { ...config, actionConfigMap: map }
}

/** 特殊装备为全局槽位（影响所有专业），替换 specialEquimentMap */
function withSpecialSwapped(config: ActionConfig, type: SpecialSlot, hrid: string, level: number): ActionConfig {
  const map = new Map(config.specialEquimentMap)
  map.set(type, { type, hrid, enhanceLevel: level })
  return { ...config, specialEquimentMap: map }
}

/** 候选装备要评估的强化等级列表 */
function levelsFor(hrid: string, mode: EvalMode, currentLevel: number): number[] {
  if (mode === "naked") return [0]
  if (mode === "sameLevel") return [currentLevel]
  const levels = new Set<number>([0])
  const marketItem = getMarketDataApi()?.marketData?.[hrid]
  if (marketItem) {
    for (const key of Object.keys(marketItem)) {
      const lv = Number(key)
      if (Number.isInteger(lv) && lv > 0) levels.add(lv)
    }
  }
  return [...levels].sort((a, b) => a - b)
}

function slotEquipmentType(action: Action, slot: UpgradeSlot): Equipment {
  return (slot === "tool" ? `${action}_tool` : slot) as Equipment
}

function itemDisplayName(hrid?: string): string {
  if (!hrid) return ""
  return getTrans(getItemDetailOf(hrid)?.name || hrid)
}

const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0))

export async function getUpgradeCompareApi(params: UpgradeCompareParams): Promise<PresetUpgradeResult[]> {
  if (!getGameDataApi()) return []
  const defs = params.action ? ACTION_DEFS.filter(d => d.action === params.action) : ACTION_DEFS
  const topN = Math.max(1, params.topN ?? 3)
  const results: PresetUpgradeResult[] = []
  const total = params.presets.length * defs.length
  let current = 0

  for (const preset of params.presets) {
    const presetResult: PresetUpgradeResult = {
      presetIndex: preset.index,
      presetName: preset.config.name || `预设${preset.index + 1}`,
      color: preset.config.color,
      actions: []
    }

    for (const def of defs) {
      current++
      params.onProgress?.(`${presetResult.presetName} · ${getTrans(def.labelKey)}`, current, total)

      const baselines = runWithPlayerContext(preset.config, () => findTopProjects(def.action, topN))
      if (!baselines.length) continue

      const baselineProfitPH = baselines.reduce((sum, b) => sum + b.profitPH, 0) / baselines.length
      const item = preset.config.actionConfigMap.get(def.action) ?? getDefaultActionConfigOf(def.action)
      const actionResult: ActionUpgradeResult = {
        action: def.action,
        actionLabel: getTrans(def.labelKey),
        baselines: baselines.map(b => ({ hrid: b.hrid, name: itemDisplayName(b.hrid), profitPH: b.profitPH })),
        baselineProfitPH,
        current: {},
        best: {},
        candidates: []
      }

      for (const slot of SLOTS) {
        let currentEq: PlayerEquipmentItem | undefined
        if (isSpecialSlot(slot)) {
          // buildBuffMap 对缺失条目会回退默认特殊装备（掌上监工+10 等），现装显示保持同口径
          currentEq = preset.config.specialEquimentMap.get(slot) ?? DEFAULT_SEPCIAL_EQUIPMENT_LIST.find(se => se.type === slot)
        } else {
          currentEq = item?.[slot]
        }
        const currentLevel = currentEq?.enhanceLevel ?? 0
        actionResult.current[slot] = currentEq?.hrid
          ? { hrid: currentEq.hrid, name: itemDisplayName(currentEq.hrid), level: currentLevel }
          : undefined

        let candidateList: ItemDetail[] = []
        try {
          candidateList = isSpecialSlot(slot)
            ? getSpecialEquipmentListOf(slot)
            : getEquipmentListOf(def.action, slotEquipmentType(def.action, slot))
        } catch {
          candidateList = []
        }

        for (const cand of candidateList) {
          if (!cand.isTradable) continue
          // 只往上推荐：候选物品档位（物品等级）低于现装的不考虑，
          // 避免高强化低档货（经验口径等）压过高档现装的建议误判
          if (currentEq?.hrid) {
            const currentDetail = getItemDetailOf(currentEq.hrid)
            if (currentDetail && cand.itemLevel < currentDetail.itemLevel) continue
          }
          const sameHrid = cand.hrid === currentEq?.hrid
          for (const level of levelsFor(cand.hrid, params.evalMode, currentLevel)) {
            // 跳过与现装完全相同的（同物品同强化等级）
            if (sameHrid && level === currentLevel) continue
            const cost = getPriceOf(cand.hrid, level).ask
            if (typeof cost !== "number" || cost <= 0) continue

            const swappedConfig = isSpecialSlot(slot)
              ? withSpecialSwapped(preset.config, slot, cand.hrid, level)
              : withSlotSwapped(preset.config, def.action, item, slot, cand.hrid, level)
            const delta = evaluateOn(swappedConfig, def.action, baselines)
            if (!delta) continue

            // 护符恒按经验口径；其他部位利润无提升但经验有提升时回退经验口径（如纯经验向特殊装备）
            const isExpMetric = slot === "charm" || (delta.profitDelta <= 0 && delta.expDelta > 0)
            const metric = isExpMetric ? delta.expDelta : delta.profitDelta
            if (metric <= 0) continue

            actionResult.candidates.push({
              slot,
              hrid: cand.hrid,
              name: getTrans(cand.name),
              itemLevel: cand.itemLevel,
              evalLevel: level,
              cost,
              profitDelta: isExpMetric ? 0 : delta.profitDelta,
              expDelta: delta.expDelta,
              isExpMetric,
              valueRate: metric / cost,
              paybackHours: isExpMetric ? Number.POSITIVE_INFINITY : cost / delta.profitDelta
            })
          }
        }
      }

      // 利润口径行排前，经验口径行排后；同口径按性价比降序
      actionResult.candidates.sort((a, b) => (Number(a.isExpMetric) - Number(b.isExpMetric)) || (b.valueRate - a.valueRate))
      for (const cand of actionResult.candidates) {
        if (!actionResult.best[cand.slot]) {
          actionResult.best[cand.slot] = cand
        }
      }
      if (actionResult.candidates.length > 0) {
        presetResult.actions.push(actionResult)
      }
      await yieldToUI()
    }

    results.push(presetResult)
  }
  return results
}
