import type { Action } from "~/game"
import { getActionDetailOf, getAlchemyEssenceDropTable, getAlchemyRareDropTable, getCoinifyTimeCost, getDecomposeTimeCost, getGameDataApi, getTransmuteTimeCost } from "@/common/apis/game"
import { COIN_HRID } from "@/pinia/stores/game"

/** A 类覆盖的动作（不含炼金；冲泡含各类茶/咖啡配方） */
const A_ACTION_LIST: Action[] = ["cheesesmithing", "crafting", "tailoring", "cooking", "brewing"]
/** 三采集动作 */
const GATHER_ACTION_LIST: Action[] = ["milking", "foraging", "woodcutting"]
/** 炼金动作 key（B 类） */
const _ALCHEMY_ACTION_KEYS = ["coinify", "decompose", "transmute"] as const
export type AlchemyActionKey = typeof _ALCHEMY_ACTION_KEYS[number]

/** 消耗某物品的非炼金配方（大类视角：奶酪 → 锻造奶酪剑/奶酪锤…、烹饪…） */
export interface ConsumingRecipe {
  action: Action
  actionHrid: string
  /** 主产物（outputItems[0]，即 A 类定位配方的锚点） */
  productHrid: string
}
export function findConsumingActionsOf(hrid: string): ConsumingRecipe[] {
  const gameData = getGameDataApi()
  const out: ConsumingRecipe[] = []
  for (const actionHrid of Object.keys(gameData.actionDetailMap)) {
    const m = /^\/actions\/(cheesesmithing|crafting|tailoring|cooking|brewing)\//.exec(actionHrid)
    if (!m) continue
    const detail = gameData.actionDetailMap[actionHrid]
    if (!detail.outputItems?.length) continue
    const isInput = detail.upgradeItemHrid === hrid || (detail.inputItems || []).some(i => i.itemHrid === hrid)
    if (!isInput) continue
    out.push({ action: m[1] as Action, actionHrid, productHrid: detail.outputItems[0].itemHrid })
  }
  return out
}

/** 产出该物品的 A 类动作（唯一配方；含冲泡产茶/咖啡配方）。返回 null=无配方 */
export function findProducingActionOf(hrid: string): string | null {
  const gameData = getGameDataApi()
  const hits: string[] = []
  for (const actionHrid of Object.keys(gameData.actionDetailMap)) {
    if (!A_ACTION_LIST.some(a => actionHrid.startsWith(`/actions/${a}/`))) continue
    const detail = gameData.actionDetailMap[actionHrid]
    if (!detail.outputItems?.some(o => o.itemHrid === hrid)) continue
    hits.push(actionHrid)
  }
  return hits.length === 1 ? hits[0] : null
}

/**
 * 该物品可用的三采集动作（挤奶/采摘/伐木）；空数组=只能购买。
 * 注意：采集动作的产物在 dropTable（不是 outputItems），与 GatherCalculator 一致
 */
export function getGatherActionsOf(hrid: string): string[] {
  const gameData = getGameDataApi()
  if (!gameData || !hrid) return []
  return Object.keys(gameData.actionDetailMap)
    .filter(k => GATHER_ACTION_LIST.some(a => k.startsWith(`/actions/${a}/`))
      && (gameData.actionDetailMap[k].outputItems?.some(o => o.itemHrid === hrid)
        || gameData.actionDetailMap[k].dropTable?.some(d => d.itemHrid === hrid)))
}

/** 该物品可用的炼金动作（点金/分解/转化）；依据 AlchemyDetail 判定（与 alchemy.ts 的 available 一致） */
export function getAlchemyActionOptionsOf(hrid: string): { key: AlchemyActionKey, actionHrid: string }[] {
  const item = getGameDataApi().itemDetailMap[hrid]
  if (!item) return []
  const result: { key: AlchemyActionKey, actionHrid: string }[] = []
  if (item.alchemyDetail?.isCoinifiable) result.push({ key: "coinify", actionHrid: "/actions/alchemy/coinify" })
  if (item.alchemyDetail?.decomposeItems != null) result.push({ key: "decompose", actionHrid: "/actions/alchemy/decompose" })
  if (item.alchemyDetail?.transmuteDropTable != null) result.push({ key: "transmute", actionHrid: "/actions/alchemy/transmute" })
  return result
}

/** B 类催化剂：0无 1普通 2至高；普通催化剂按动作区分 hrid，至高统一 prime_catalyst */
export function getCatalystHridOf(actionKey: AlchemyActionKey, rank: 0 | 1 | 2): string | null {
  if (rank === 0) return null
  if (rank === 2) return "/items/prime_catalyst"
  return {
    coinify: "/items/catalyst_of_coinification",
    decompose: "/items/catalyst_of_decomposition",
    transmute: "/items/catalyst_of_transmutation"
  }[actionKey]
}

/** 一次配方解析的输入输出描述 */
export interface ResolvedRecipe {
  /** 输入项：只包含需要连线的物品（金币/茶不在此列） */
  inputs: { hrid: string, auto: boolean }[]
  /** 输出项（每个产物一个绿色节点） */
  outputs: string[]
}

/** 解析 A 类配方：主产物 + 唯一动作 */
export function resolveRecipeA(actionHrid: string): ResolvedRecipe {
  const detail = getActionDetailOf(actionHrid)
  // 茶不参与 pin 展示（不生成输入 pin），配方计算时另行补正
  const inputs = [
    ...(detail.upgradeItemHrid ? [{ hrid: detail.upgradeItemHrid, auto: false }] : []),
    ...(detail.inputItems || []).map(i => ({ hrid: i.itemHrid, auto: false }))
  ]
  const outputs = [
    ...(detail.outputItems || []).map(o => o.itemHrid),
    ...(detail.essenceDropTable || []).map(d => d.itemHrid),
    ...(detail.rareDropTable || []).map(d => d.itemHrid)
  ]
  return { inputs, outputs }
}

/**
 * 平凡产物：本处理方式的精华掉落 + 稀有掉落（大中小工匠匣/宝箱/陨石仓、
 * 专精之线/精通之油/洞察之枝等）。可被「不显示平凡产物」隐藏，利润照常计算。
 */
export function getMundaneProductHridsOf(node: { funcClass?: string, actionHrid?: string, mainItemHrid?: string }): string[] {
  if (!node.actionHrid) return []
  if (node.funcClass === "A") {
    const detail = getActionDetailOf(node.actionHrid)
    return [
      ...(detail.essenceDropTable || []).map(d => d.itemHrid),
      ...(detail.rareDropTable || []).map(d => d.itemHrid)
    ]
  }
  // B 类：稀有掉落与炼金精华按物品等级/耗时动态生成（与 resolveRecipeB 同源）
  const item = getGameDataApi().itemDetailMap[node.mainItemHrid ?? ""]
  if (!item) return []
  const actionKey = node.actionHrid.split("/").pop() as AlchemyActionKey
  const timeCost = actionKey === "transmute"
    ? getTransmuteTimeCost()
    : actionKey === "decompose" ? getDecomposeTimeCost() : getCoinifyTimeCost()
  return [
    ...getAlchemyRareDropTable(item, timeCost).map(d => d.itemHrid),
    ...getAlchemyEssenceDropTable(item, timeCost).map(d => d.itemHrid)
  ]
}

/** 解析 B 类配方：主原料 + 炼金动作 + 催化剂等级 */
export function resolveRecipeB(mainItemHrid: string, actionKey: AlchemyActionKey, catalystRank: 0 | 1 | 2): ResolvedRecipe {
  const item = getGameDataApi().itemDetailMap[mainItemHrid]
  const catalyst = getCatalystHridOf(actionKey, catalystRank)
  // 金币与茶不生成输入 pin（自动消耗、不连线），输入 pin 只保留需要连线的物品
  const inputs = [
    { hrid: mainItemHrid, auto: false },
    ...(catalyst ? [{ hrid: catalyst, auto: false }] : [])
  ]
  // 稀有掉落（工匠匣）与炼金精华不在动作数据里：
  // 与首页计算器同源，按物品等级/耗时动态生成（DecomposeCalculator 的 productList 逻辑）
  const timeCost = actionKey === "transmute"
    ? getTransmuteTimeCost()
    : actionKey === "decompose" ? getDecomposeTimeCost() : getCoinifyTimeCost()
  const outputs = [
    ...(actionKey === "transmute"
      ? (item.alchemyDetail.transmuteDropTable || []).map(d => d.itemHrid)
      : actionKey === "decompose"
        ? (item.alchemyDetail.decomposeItems || []).map(d => d.itemHrid)
        : [COIN_HRID]),
    ...getAlchemyRareDropTable(item, timeCost).map(d => d.itemHrid),
    ...getAlchemyEssenceDropTable(item, timeCost).map(d => d.itemHrid)
  ]
  return { inputs, outputs }
}
