import type Calculator from "."
import type { ItemDetail } from "~/game"
import { CoinifyCalculator, DecomposeCalculator, TransmuteCalculator } from "@/calculator/alchemy"
import { getGameDataApi, getItemDetailOf, getPriceOf } from "@/common/apis/game"
import { getUsedPriceOf } from "@/common/apis/price"
import { getTrans } from "@/locales"
import { COIN_HRID } from "@/pinia/stores/game"

export type SuperAction = "sell" | "decompose" | "transmute" | "coinify"

/** 超级炼金模式：smart=每节点取净收益最高处置；longest=只要继续炼不亏就往深走 */
export type SuperAlchemyMode = "smart" | "longest"

/**
 * 单个物品的链条评估结果，所有量都按"每 1 件该物品"归一：
 * 数量线性缩放，决策与数量无关，因此可全局记忆化复用
 */
export interface SuperUnitEval {
  hrid: string
  name: string
  action: SuperAction
  catalystRank: number
  /** 每 1 件：本步附加成本（金币/催化剂/茶，不含本体——中间产物沿链内部转移不重复计价） */
  costPerUnit: number
  /** 每 1 件：本步自身耗时（秒） */
  ownTimePerUnit: number
  /** 每 1 件：全链耗时（秒，含所有下游） */
  timePerUnit: number
  /** 每 1 件：全链附加成本累计（金币/催化剂/茶，不含起点购入） */
  costAllPerUnit: number
  /** 整条链的最高炼金等级要求（炼金各步要求 = 物品 itemLevel） */
  reqLevel: number
  /** 每 1 件：直卖价值（机会成本对照） */
  sellValue: number
  /** 每 1 件：沿链净收益（不含本体购入） */
  unitNet: number
  /** 期望子产物：每 1 件产出多少 */
  children: { hrid: string, countPerUnit: number }[]
  /** 因转化环切断、按直卖计的产物 */
  cycleCutProducts: { hrid: string, count: number }[]
  /** 主线动作序列（火车式"几步炼金"展示用）：本步动作 + 贡献净收益最大的可炼子节点的主线 */
  mainPath: SuperAction[]
  /** 主线物品序列，与 mainPath 一一对应：mainPath[i] 作用在 mainHrids[i] 上 */
  mainHrids: string[]
  /** 该步动作的转化成功率（卖=100%） */
  successRate: number
  /** 每件物品的期望动作次数——自返型物品（技能书93.5%变回自己）会显著大于1 */
  attemptsPerUnit: number
  priceInvalid: boolean
}

export interface SuperAlchemyRow {
  item: ItemDetail
  eval: SuperUnitEval
  /** 起点购入价（左价） */
  ask: number
  /** 每 1 件利润 = 沿链净收益 − 购入 */
  profit: number
  profitPH: number
  /** 利润率 = 利润 / (购入 + 全链附加成本) */
  profitRate: number
  /** 起点物品成交量（1h） */
  volume1h: number
}

export interface SuperAlchemyOptions {
  catalystRanks: number[]
  sellTaxFactor: number
  mode: SuperAlchemyMode
  /** false 时产物剔除稀有掉落与额外精华掉落（只保留主掉落表），默认 true */
  includeRare: boolean
}

/** 详情树节点（数量已按链路缩放） */
export interface SuperNode {
  id: number
  hrid: string
  name: string
  count: number
  action: SuperAction
  catalystRank: number
  depth: number
  children: SuperNode[]
  /** 该步附加成本（按 count 折算） */
  stepCost: number
  /** 该步自身耗时（秒，按 count 折算） */
  stepTimeSec: number
  /** 直卖价值（机会成本对照） */
  sellValue: number
  /** 该节点及以下净收益 */
  chainIncome: number
  cycleCut: boolean
  priceInvalid: boolean
  /** 该步动作的转化成功率 */
  successRate: number
  /** 每件物品的期望动作次数（自返型物品显著大于1） */
  attemptsPerUnit: number
}

export interface SuperTreeResult {
  root: SuperNode
  /** 主线节点序列（root 起，沿 mainPath/mainHrids 走） */
  mainNodes: SuperNode[]
  total: {
    income: number
    cost: number
    timeSec: number
    profit: number
    profitPH: number
    steps: number
    deepest: number
    ask: number
  }
}

const MAX_MEMO = 6000
/** 期望数量低于该值的产物不再展开 */
const MIN_COUNT = 0.005

const ACTION_CTORS: { action: SuperAction, create: (hrid: string, catalystRank: number, includeRare?: boolean) => Calculator }[] = [
  { action: "decompose", create: (hrid, catalystRank, includeRare) => new DecomposeCalculator({ hrid, catalystRank, includeRare }) },
  { action: "transmute", create: (hrid, catalystRank, includeRare) => new TransmuteCalculator({ hrid, catalystRank, includeRare }) },
  { action: "coinify", create: (hrid, catalystRank, includeRare) => new CoinifyCalculator({ hrid, catalystRank, includeRare }) }
]

interface Ctx {
  options: SuperAlchemyOptions
  memo: Map<string, SuperUnitEval>
  inProgress: Set<string>
}

function sellValueOf(hrid: string, taxFactor: number) {
  if (hrid === COIN_HRID) return 1
  const bid = getUsedPriceOf(hrid, 0, "bid") ?? -1
  return bid < 0 ? -1 : bid * taxFactor
}

function calcOf(action: SuperAction, hrid: string, catalystRank: number, taxFactor: number, includeRare: boolean): Calculator | null {
  try {
    const calc = ACTION_CTORS.find(a => a.action === action)!.create(hrid, catalystRank, includeRare)
    calc.setSellTaxFactor(taxFactor)
    if (!calc.available) return null
    calc.run()
    const nonItem = calc.ingredientListWithPrice.slice(1)
    if (nonItem.some(ing => ing.price === -1)) return null
    return calc
  } catch {
    return null
  }
}

/**
 * 单物品链条评估（每 1 件归一 + 全局记忆化）。
 * 转化环（golem↔twilight↔abyssal 精华互转）用 inProgress 切断：
 * 产物命中正在展开的路径时按直卖计，不再递归。
 */
function unitEval(hrid: string, ctx: Ctx): SuperUnitEval {
  const cached = ctx.memo.get(hrid)
  if (cached) return cached
  const { options } = ctx
  const taxFactor = options.sellTaxFactor
  const sellUnit = sellValueOf(hrid, taxFactor)

  interface Candidate {
    ev: SuperUnitEval
  }
  const candidates: Candidate[] = []

  const sellEv: SuperUnitEval = {
    hrid,
    name: getTrans(getItemDetailOf(hrid)?.name ?? hrid),
    action: "sell",
    catalystRank: 0,
    costPerUnit: 0,
    ownTimePerUnit: 0,
    timePerUnit: 0,
    costAllPerUnit: 0,
    reqLevel: 0,
    sellValue: Math.max(sellUnit, 0),
    unitNet: Math.max(sellUnit, 0),
    children: [],
    cycleCutProducts: [],
    mainPath: [],
    mainHrids: [],
    successRate: 1,
    attemptsPerUnit: 0,
    priceInvalid: sellUnit < 0,
  }
  candidates.push({ ev: sellEv })

  ctx.inProgress.add(hrid)
  try {
    for (const { action } of ACTION_CTORS) {
      for (const catalystRank of options.catalystRanks) {
        const calc = calcOf(action, hrid, catalystRank, taxFactor, options.includeRare)
        if (!calc) continue
        const ingredients = calc.ingredientListWithPrice
        const main = ingredients[0]
        if (!main || main.count <= 0) continue
        const actionsPerItem = 1 / main.count
        const costPerUnit = ingredients.slice(1).reduce((acc, ing) => acc + ing.count * ing.price, 0) * actionsPerItem
        const ownTimePerUnit = (3600 / calc.actionsPH) * actionsPerItem

        const children: SuperUnitEval["children"] = []
        const cycleCutProducts: SuperUnitEval["cycleCutProducts"] = []
        let cutIncome = 0
        for (const product of calc.productListWithPrice) {
          if (product.hrid === hrid) continue
          const countPerUnit = actionsPerItem * product.count * (product.rate || 1) * calc.successRate
          if (countPerUnit < MIN_COUNT) continue
          if (product.hrid === COIN_HRID) {
            cutIncome += countPerUnit
            const denom = product.marketPrice && product.marketPrice > 0 ? product.marketPrice : 1
            cycleCutProducts.push({ hrid: COIN_HRID, count: countPerUnit * denom })
            continue
          }
          if (ctx.inProgress.has(product.hrid) || ctx.memo.size > MAX_MEMO) {
            const v = sellValueOf(product.hrid, taxFactor)
            if (v > 0) cutIncome += countPerUnit * v
            cycleCutProducts.push({ hrid: product.hrid, count: countPerUnit })
            continue
          }
          children.push({ hrid: product.hrid, countPerUnit })
        }

        let unitNet = cutIncome - costPerUnit
        let timePerUnit = ownTimePerUnit
        for (const child of children) {
          const childEv = unitEval(child.hrid, ctx)
          unitNet += childEv.unitNet * child.countPerUnit
          timePerUnit += childEv.timePerUnit * child.countPerUnit
        }
        // 主线 = 贡献净收益最大的可炼子节点（火车式"几步炼金"展示）
        const alchemyChildren = children
          .map(c => ({ c, cev: ctx.memo.get(c.hrid) }))
          .filter(x => !!x.cev && x.cev.action !== "sell")
        let mainPath: SuperAction[] = [action]
        let mainHrids: string[] = [hrid]
        if (alchemyChildren.length > 0) {
          const best = alchemyChildren.reduce((a, b) => (b.cev!.unitNet * b.c.countPerUnit > a.cev!.unitNet * a.c.countPerUnit ? b : a))
          mainPath = [action, ...best.cev!.mainPath]
          mainHrids = [hrid, ...best.cev!.mainHrids]
        }
        let costAllPerUnit = costPerUnit
        let reqLevel = getItemDetailOf(hrid)?.itemLevel || 0
        for (const child of children) {
          const cev = ctx.memo.get(child.hrid)
          if (cev) {
            costAllPerUnit += cev.costAllPerUnit * child.countPerUnit
            reqLevel = Math.max(reqLevel, cev.reqLevel)
          }
        }
        candidates.push({
          ev: {
            hrid,
            name: getTrans(getItemDetailOf(hrid)?.name ?? hrid),
            action,
            catalystRank,
            costPerUnit,
            ownTimePerUnit,
            timePerUnit,
            costAllPerUnit,
            reqLevel,
            sellValue: Math.max(sellUnit, 0),
            unitNet,
            children,
            cycleCutProducts,
            mainPath,
            mainHrids,
            successRate: calc.successRate,
            attemptsPerUnit: actionsPerItem,
            priceInvalid: sellUnit < 0,
          }
        })
      }
    }
  } finally {
    ctx.inProgress.delete(hrid)
  }

  const alchemyCandidates = candidates.filter(c => c.ev.action !== "sell")
  let chosen: SuperUnitEval
  if (options.mode === "longest") {
    // 最长链：继续炼不比直卖亏就选净收益最高的炼金动作
    const profitable = alchemyCandidates.filter(c => c.ev.unitNet >= sellEv.unitNet - 1e-6)
    chosen = (profitable.length > 0 ? profitable : candidates).reduce((a, b) => (b.ev.unitNet > a.ev.unitNet ? b : a)).ev
  } else {
    chosen = candidates.reduce((a, b) => (b.ev.unitNet > a.ev.unitNet ? b : a)).ev
  }
  ctx.memo.set(hrid, chosen)
  return chosen
}

function hasAlchemyDetail(item: ItemDetail) {
  const ad = item.alchemyDetail
  return !!ad && (ad.decomposeItems != null || ad.transmuteDropTable != null || ad.isCoinifiable)
}

/** 全量计算：所有可炼且买得到的物品，按整链利润 / h 降序 */
export function computeSuperAlchemy(options: SuperAlchemyOptions): SuperAlchemyRow[] {
  const ctx: Ctx = { options, memo: new Map(), inProgress: new Set() }
  const rows: SuperAlchemyRow[] = []
  for (const item of Object.values(getGameDataApi().itemDetailMap)) {
    if (!item.isTradable || !hasAlchemyDetail(item)) continue
    const ask = getUsedPriceOf(item.hrid, 0, "ask") ?? -1
    if (ask < 0) continue // 市场无卖单，链条无从买起
    const ev = unitEval(item.hrid, ctx)
    if (ev.action === "sell") continue // 最优处置就是直卖，无炼金意义
    const profit = ev.unitNet - ask
    const cost = ask + ev.costAllPerUnit
    rows.push({
      item,
      eval: ev,
      ask,
      profit,
      profitPH: ev.timePerUnit > 0 ? (profit / ev.timePerUnit) * 3600 : profit,
      profitRate: cost > 0 ? profit / cost : 0,
      volume1h: getPriceOf(item.hrid, 0).vol ?? -1
    })
  }
  rows.sort((a, b) => b.profitPH - a.profitPH)
  return rows
}

/** 由记忆化结果重建某物品的展示树（数量按链路缩放） */
export function buildSuperTree(item: ItemDetail, options: SuperAlchemyOptions): SuperTreeResult {
  const ctx: Ctx = { options, memo: new Map(), inProgress: new Set() }
  unitEval(item.hrid, ctx) // 结果进 memo，供 build 复用
  let nextId = 1

  function build(hrid: string, count: number, depth: number): SuperNode {
    const ev = ctx.memo.get(hrid)
    const sellValue = ev ? ev.sellValue * count : 0
    const node: SuperNode = {
      id: nextId++,
      hrid,
      name: getTrans(getItemDetailOf(hrid)?.name ?? hrid),
      count,
      action: ev?.action ?? "sell",
      catalystRank: ev?.catalystRank ?? 0,
      depth,
      children: [],
      stepCost: (ev?.costPerUnit ?? 0) * count,
      stepTimeSec: (ev?.ownTimePerUnit ?? 0) * count,
      sellValue,
      chainIncome: (ev?.unitNet ?? 0) * count,
      cycleCut: false,
      priceInvalid: ev?.priceInvalid ?? false,
      successRate: ev?.successRate ?? 1,
      attemptsPerUnit: ev?.attemptsPerUnit ?? 0
    }
    if (ev) {
      node.children.push(...ev.cycleCutProducts.map((p) => {
        const unitSell = Math.max(sellValueOf(p.hrid, options.sellTaxFactor), 0)
        return {
          id: nextId++,
          hrid: p.hrid,
          name: getTrans(getItemDetailOf(p.hrid)?.name ?? p.hrid),
          count: p.count * count,
          action: "sell" as SuperAction,
          catalystRank: 0,
          depth: depth + 1,
          children: [],
          stepCost: 0,
          stepTimeSec: 0,
          sellValue: unitSell * p.count * count,
          chainIncome: unitSell * p.count * count,
          cycleCut: true,
          priceInvalid: false,
          successRate: 1,
          attemptsPerUnit: 0
        }
      }))
      for (const child of ev.children) {
        node.children.push(build(child.hrid, child.countPerUnit * count, depth + 1))
      }
    }
    return node
  }

  const root = build(item.hrid, 1, 0)
  // 主线序列：按评估时的 mainPath/mainHrids 在树里逐层找对应子节点
  const mainEv = ctx.memo.get(item.hrid)
  const mainNodes: SuperNode[] = []
  let cursor: SuperNode | undefined = root
  for (let i = 0; cursor && mainEv; i++) {
    mainNodes.push(cursor)
    const nextHrid = mainEv.mainHrids[i + 1]
    const nextAction = mainEv.mainPath[i + 1]
    if (!nextHrid || !nextAction) break
    cursor = cursor.children.find(c => !c.cycleCut && c.hrid === nextHrid && c.action === nextAction)
  }
  let income = 0
  let cost = 0
  let timeSec = 0
  let steps = 0
  let deepest = 0
  const walk = (node: SuperNode) => {
    if (node.action !== "sell") {
      steps++
      cost += node.stepCost
      timeSec += node.stepTimeSec
      deepest = Math.max(deepest, node.depth + 1)
    } else {
      income += node.sellValue
    }
    node.children.forEach(walk)
  }
  walk(root)
  const ask = getUsedPriceOf(item.hrid, 0, "ask") ?? -1
  if (ask > 0) cost += ask
  const profit = income - cost
  return {
    root,
    mainNodes,
    total: {
      income,
      cost,
      timeSec,
      profit,
      profitPH: timeSec > 0 ? (profit / timeSec) * 3600 : profit,
      steps,
      deepest,
      ask
    }
  }
}
