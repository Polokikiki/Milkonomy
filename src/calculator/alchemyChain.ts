import type Calculator from "."
import type { AlchemyCalculatorConfig } from "@/calculator/alchemy"
import type { ItemDetail } from "~/game"
import { CoinifyCalculator, DecomposeCalculator, TransmuteCalculator } from "@/calculator/alchemy"
import { getGameDataApi, getItemDetailOf, getPriceOf } from "@/common/apis/game"
import { getCraftCostOf } from "@/common/apis/game/craft"
import { getTrans } from "@/locales"
import { COIN_HRID } from "@/pinia/stores/game"

type AlchemyCtor = new (config: AlchemyCalculatorConfig) => Calculator & { available: boolean, run: () => Calculator }

export interface ChainOptions {
  /** smart=只在继续加工比直接卖更优时延伸；all=强制走到底 */
  mode: "smart" | "all"
  catalystRank: number
  sellTaxFactor: number
  includeRare: boolean
}

export interface ChainStepRow {
  hrid: string
  depth: number
  /** 相对上一层的产物数量（顶层为 1） */
  count: number
  /** 该步单层计算器（页面可展开明细列） */
  calc: Calculator | null
  /** 处置建议 */
  advice: string
  /** 该节点按链上最优处置折算的单件价值 */
  value: number
  children: ChainStepRow[]
}

export interface ChainSummary {
  /** 顶层 1 件按链上最优处置折算的最终价值 */
  totalValue: number
  /** 直接卖掉顶层的对照价值 */
  directSellValue: number
  /** 链上总耗时（秒，按顶层 1 件折算） */
  totalSeconds: number
}

interface CalcEntry {
  calc: Calculator
  /** 单次动作的边际成本（金币+催化剂+茶，不含被加工物本体） */
  marginalCost: number
  /** 单次动作的稀有/精华掉落期望产值 */
  rareIncome: number
}

function alchemyDetailOf(hrid: string): ItemDetail["alchemyDetail"] | undefined {
  return getItemDetailOf(hrid)?.alchemyDetail
}

/** 实例化并运行炼金计算器；不可用/关键原料无挂单时返回 null */
function buildCalc(Ctor: AlchemyCtor, hrid: string, opts: ChainOptions): CalcEntry | null {
  try {
    const calc = new Ctor({ hrid, catalystRank: opts.catalystRank, includeRare: opts.includeRare })
    calc.setSellTaxFactor(opts.sellTaxFactor)
    if (!calc.available || !calc.run().result) return null
    const ingredients = calc.ingredientListWithPrice
    if (!ingredients.length || ingredients[0].price === -1) return null
    for (let i = 1; i < ingredients.length; i++) {
      if (ingredients[i].price === -1) return null
    }
    const marginalCost = calc.cost - ingredients[0].count * ingredients[0].price
    // 稀有/精华掉落 = 主产物之外的全部产物期望值
    const mainHrids = new Set<string>()
    const detail = alchemyDetailOf(hrid)
    detail?.decomposeItems?.forEach(d => mainHrids.add(d.itemHrid))
    detail?.transmuteDropTable?.forEach(d => mainHrids.add(d.itemHrid))
    mainHrids.add(COIN_HRID)
    let rareIncome = 0
    for (const p of calc.productListWithPrice) {
      if (!mainHrids.has(p.hrid)) {
        rareIncome += p.count * (p.rate ?? 1) * p.price
      }
    }
    return { calc, marginalCost, rareIncome }
  } catch {
    return null
  }
}

function sellValueOf(hrid: string): number {
  return getPriceOf(hrid).bid
}

/** 退出价值：直接卖 vs 点金（点金边际收益 = 产物总值 − 催化剂等边际成本） */
function exitValueOf(hrid: string, opts: ChainOptions, entryCache: Map<string, CalcEntry | null>): number {
  const sell = sellValueOf(hrid)
  if (alchemyDetailOf(hrid)?.isCoinifiable) {
    const coinify = getEntry(CoinifyCalculator, hrid, opts, entryCache)
    if (coinify) {
      return Math.max(sell, coinify.calc.income - coinify.marginalCost)
    }
  }
  return sell
}

function getEntry(Ctor: AlchemyCtor, hrid: string, opts: ChainOptions, entryCache: Map<string, CalcEntry | null>): CalcEntry | null {
  const key = `${Ctor.name}|${hrid}|${opts.catalystRank}|${opts.includeRare}`
  if (!entryCache.has(key)) entryCache.set(key, buildCalc(Ctor, hrid, opts))
  return entryCache.get(key)!
}

// ==================== 分解链（图无环：递归 + 记忆化） ====================

export interface DecomposeChainResult extends ChainSummary {
  rows: ChainStepRow[]
}

export function computeDecomposeChain(hrid: string, opts: ChainOptions): DecomposeChainResult {
  const entryCache = new Map<string, CalcEntry | null>()
  const memo = new Map<string, number>()
  const root = decomposeRows(hrid, opts, entryCache, memo, 1, 0, new Set())
  return {
    totalValue: memo.get(hrid) ?? sellValueOf(hrid),
    directSellValue: sellValueOf(hrid),
    totalSeconds: root.secondsTotal,
    rows: [root.row]
  }
}

function decomposeValue(hrid: string, opts: ChainOptions, entryCache: Map<string, CalcEntry | null>, memo: Map<string, number>, path: Set<string>): number {
  const cached = memo.get(hrid)
  if (cached !== undefined) return cached
  const sell = sellValueOf(hrid)
  const detail = alchemyDetailOf(hrid)
  const entry = detail?.decomposeItems && !path.has(hrid) ? getEntry(DecomposeCalculator, hrid, opts, entryCache) : null
  if (!entry || !detail?.decomposeItems) {
    memo.set(hrid, sell)
    return sell
  }
  path.add(hrid)
  // 每件 X 分解一次：主产物 drop.count 件 + 摊薄到单件的稀有掉落与边际成本
  const bulk = detail.bulkMultiplier
  let ev = (entry.rareIncome - entry.marginalCost) / bulk
  for (const drop of detail.decomposeItems) {
    ev += drop.count * decomposeValue(drop.itemHrid, opts, entryCache, memo, path)
  }
  path.delete(hrid)
  const value = opts.mode === "all" || ev > sell ? ev : sell
  memo.set(hrid, value)
  return value
}

function decomposeRows(hrid: string, opts: ChainOptions, entryCache: Map<string, CalcEntry | null>, memo: Map<string, number>, count: number, depth: number, path: Set<string>): { row: ChainStepRow, secondsTotal: number } {
  const detail = alchemyDetailOf(hrid)
  const sell = sellValueOf(hrid)
  const value = decomposeValue(hrid, opts, entryCache, memo, path)
  const entry = detail?.decomposeItems && !path.has(hrid) ? getEntry(DecomposeCalculator, hrid, opts, entryCache) : null
  const shouldContinue = !!entry && (opts.mode === "all" || value > sell)
  const row: ChainStepRow = {
    hrid,
    depth,
    count,
    calc: entry?.calc ?? null,
    advice: shouldContinue ? getTrans("继续分解") : getTrans("直接卖"),
    value,
    children: []
  }
  let secondsTotal = 0
  if (shouldContinue && entry && detail?.decomposeItems) {
    const bulk = detail.bulkMultiplier
    secondsTotal = ((entry.calc as unknown as { effectiveTimeCost: number }).effectiveTimeCost / 1e9) / bulk
    path.add(hrid)
    for (const drop of detail.decomposeItems) {
      if (!alchemyDetailOf(drop.itemHrid)?.decomposeItems) continue
      const child = decomposeRows(drop.itemHrid, opts, entryCache, memo, drop.count * count, depth + 1, path)
      row.children.push(child.row)
      secondsTotal += child.secondsTotal * drop.count
    }
    path.delete(hrid)
  }
  return { row, secondsTotal }
}

// ==================== 转化链（图有环：可达集上值迭代收敛） ====================

export interface TransmuteHop {
  fromHrid: string
  toHrid: string
  /** 单次转化得到目标的期望数量（count × rate） */
  expectedCount: number
  seconds: number
}

export interface TransmuteChainResult extends ChainSummary {
  /** 逐跳路径：X → Y → …，直到最优动作为卖出/点金 */
  hops: TransmuteHop[]
  /** 退出方式：卖出 / 点金 */
  exitAdvice: string
}

export function computeTransmuteChain(hrid: string, opts: ChainOptions): TransmuteChainResult {
  const entryCache = new Map<string, CalcEntry | null>()

  // 1) 可达集 BFS（沿转化主产物边）
  const reachable = new Set<string>([hrid])
  const queue = [hrid]
  while (queue.length) {
    const cur = queue.shift()!
    const table = alchemyDetailOf(cur)?.transmuteDropTable
    if (!table) continue
    const entry = getEntry(TransmuteCalculator, cur, opts, entryCache)
    if (!entry) continue
    for (const p of (entry.calc as unknown as { productListWithPrice: { hrid: string }[] }).productListWithPrice) {
      if (p.hrid === cur || p.hrid === COIN_HRID) continue
      if (!table.some(d => d.itemHrid === p.hrid)) continue
      if (!reachable.has(p.hrid)) {
        reachable.add(p.hrid)
        queue.push(p.hrid)
      }
    }
  }

  // 2) 值迭代：value(X) = max(退出, 转化期望)，转化输入已按返还净值折算
  const values = new Map<string, number>()
  for (const h of reachable) values.set(h, exitValueOf(h, opts, entryCache))
  for (let iter = 0; iter < 50; iter++) {
    let changed = false
    for (const h of reachable) {
      const stepEV = transmuteStepEV(h, opts, entryCache, values)
      const exit = values.get(h)!
      const next = Math.max(exit, stepEV)
      if (Math.abs(next - exit) > 0.01) {
        values.set(h, next)
        changed = true
      }
    }
    if (!changed) break
  }

  const totalValue = values.get(hrid) ?? sellValueOf(hrid)
  const hops: TransmuteHop[] = []
  let totalSeconds = 0
  let exitAdvice = getTrans("直接卖")

  // 3) 沿最优下一跳还原路径
  let current = hrid
  const visited = new Set<string>([hrid])
  for (let step = 0; step < 15; step++) {
    const curDetail = alchemyDetailOf(current)
    const entry = curDetail?.transmuteDropTable ? getEntry(TransmuteCalculator, current, opts, entryCache) : null
    if (!entry) break
    const stepEV = transmuteStepEV(current, opts, entryCache, values)
    const exit = exitValueOf(current, opts, entryCache)
    if (opts.mode === "smart" && stepEV <= exit + 0.01) break
    const products = (entry.calc as unknown as {
      effectiveTimeCost: number
      productListWithPrice: { hrid: string, count: number, rate?: number, price: number }[]
    }).productListWithPrice
    let best: { hrid: string, expectedCount: number, score: number } | null = null
    for (const p of products) {
      if (p.hrid === current || p.hrid === COIN_HRID) continue
      if (!curDetail!.transmuteDropTable.some(d => d.itemHrid === p.hrid)) continue
      const score = p.count * (p.rate ?? 1) * (values.get(p.hrid) ?? exitValueOf(p.hrid, opts, entryCache))
      if (!best || score > best.score) best = { hrid: p.hrid, expectedCount: p.count * (p.rate ?? 1), score }
    }
    if (!best || visited.has(best.hrid)) break
    hops.push({
      fromHrid: current,
      toHrid: best.hrid,
      expectedCount: best.expectedCount,
      seconds: (entry.calc as unknown as { effectiveTimeCost: number }).effectiveTimeCost / 1e9
    })
    totalSeconds += (entry.calc as unknown as { effectiveTimeCost: number }).effectiveTimeCost / 1e9
    visited.add(best.hrid)
    current = best.hrid
  }

  // 退出方式判断
  const exitSell = sellValueOf(current)
  if (alchemyDetailOf(current)?.isCoinifiable) {
    const coinify = getEntry(CoinifyCalculator, current, opts, entryCache)
    if (coinify && coinify.calc.income - coinify.marginalCost > exitSell) {
      exitAdvice = getTrans("点金退出")
    }
  }

  return {
    totalValue,
    directSellValue: sellValueOf(hrid),
    totalSeconds,
    hops,
    exitAdvice
  }
}

/**
 * 单件 X 转化一次的期望价值：
 * 原料[0].count 已是扣除自身返还后的净消耗（bulk×(1-返还率)），
 * 主产物按 values 计价，稀有掉落与边际成本按净消耗摊到单件。
 */
function transmuteStepEV(hrid: string, opts: ChainOptions, entryCache: Map<string, CalcEntry | null>, values: Map<string, number>): number {
  const detail = alchemyDetailOf(hrid)
  if (!detail?.transmuteDropTable) return -Infinity
  const entry = getEntry(TransmuteCalculator, hrid, opts, entryCache)
  if (!entry) return -Infinity
  const ingredients = entry.calc.ingredientListWithPrice
  const netInput = ingredients[0].count
  if (netInput <= 0) return -Infinity
  let ev = entry.rareIncome - entry.marginalCost
  for (const p of entry.calc.productListWithPrice) {
    if (p.hrid === hrid || p.hrid === COIN_HRID) continue
    if (!detail.transmuteDropTable.some(d => d.itemHrid === p.hrid)) continue
    ev += p.count * (p.rate ?? 1) * (values.get(p.hrid) ?? 0)
  }
  return ev / netInput
}

/** 贤者之石 hrid */
export const STONE_HRID = "/items/philosophers_stone"

export interface StoneSourceRow {
  hrid: string
  method: "transmute" | "decompose"
  /** 各档催化剂里单颗成本最优的那档 */
  catalystRankUsed: number
  /** 每次动作的期望石头数（转化=dropRate，分解=确定性数量） */
  stonesPerAction: number
  /** 来源物品买价（ask）；无卖单时为制造成本回退（isCraftFallback=true） */
  buyPrice: number
  /** true = 市场无卖单，买价按制造成本估算 */
  isCraftFallback?: boolean
  /** 税后副产物期望抵扣（其他产物 EV，含稀有掉落） */
  byproductIncome: number
  /** 单颗贤者之石净成本 =（买价+催化剂 − 副产物抵扣）÷ 期望石头数 */
  costPerStone: number
}

export interface StoneLeaderboardResult {
  rows: StoneSourceRow[]
  /** 贤者之石当前市价（bid），作参照 */
  stoneBid: number
  /** 因当前无卖单被排除的来源数 */
  excludedCount: number
}

/**
 * 贤者之石获取排行：扫全部物品，找转化掉落表/分解产物里含贤者之石的来源，
 * 复用转化/分解计算器（含催化剂成本、稀有掉落、税），按单颗净成本升序。
 */
export function computeStoneLeaderboard(opts: { catalystRank: number, sellTaxFactor: number, includeRare: boolean }): StoneLeaderboardResult {
  const gameData = getGameDataApi()
  const stoneBid = getPriceOf(STONE_HRID, 0).bid
  const candidates: { hrid: string, method: "transmute" | "decompose" }[] = []
  for (const item of Object.values(gameData.itemDetailMap)) {
    if (!item.isTradable) continue
    const ad = item.alchemyDetail
    if (!ad) continue
    if (ad.transmuteDropTable?.some(d => d.itemHrid === STONE_HRID)) {
      candidates.push({ hrid: item.hrid, method: "transmute" })
    } else if (ad.decomposeItems?.some(d => d.itemHrid === STONE_HRID)) {
      candidates.push({ hrid: item.hrid, method: "decompose" })
    }
  }

  const rows: StoneSourceRow[] = []
  let excludedCount = 0
  for (const cand of candidates) {
    const marketAsk = getPriceOf(cand.hrid, 0).ask
    // 无卖单 → 回退制造成本（买不到就自己造）；仍无法定价才排除
    const isCraftFallback = marketAsk < 0
    const buyPrice = marketAsk >= 0 ? marketAsk : getCraftCostOf(cand.hrid)
    if (!(buyPrice > 0)) {
      excludedCount++
      continue
    }
    const ranks = opts.catalystRank === -1 ? [0, 1, 2] : [opts.catalystRank]
    let best: StoneSourceRow | null = null
    for (const rank of ranks) {
      const calc = cand.method === "transmute"
        ? new TransmuteCalculator({ hrid: cand.hrid, catalystRank: rank, includeRare: opts.includeRare })
        : new DecomposeCalculator({ hrid: cand.hrid, catalystRank: rank, includeRare: opts.includeRare })
      calc.setSellTaxFactor(opts.sellTaxFactor)
      const stoneEntry = calc.productListWithPrice.find(p => p.hrid === STONE_HRID)
      if (!stoneEntry) continue
      // 掉落表 dropRate 是"成功后"的条件概率（实测精华 10 项各 0.1 求和=1），
      // 每次尝试的真实产出须 × successRate（失败=物品销毁，见 wiki）；
      // calc.income 也是每次成功口径（successRate 在全站 gainPH 里乘），
      // 这里统一折算成"每次尝试"口径再作差
      const succ = calc.successRate
      const stonesPerAction = stoneEntry.count * (stoneEntry.rate ?? 1) * succ
      if (stonesPerAction <= 0) continue
      const stoneValuePerAttempt = stonesPerAction * stoneEntry.price * opts.sellTaxFactor
      const byproductIncome = calc.income * succ - stoneValuePerAttempt
      const costPerStone = (calc.cost - byproductIncome) / stonesPerAction
      if (!Number.isFinite(costPerStone)) continue
      const row: StoneSourceRow = { hrid: cand.hrid, method: cand.method, catalystRankUsed: rank, stonesPerAction, buyPrice, isCraftFallback, byproductIncome, costPerStone }
      if (!best || row.costPerStone < best.costPerStone) best = row
    }
    if (best) rows.push(best)
  }
  rows.sort((a, b) => a.costPerStone - b.costPerStone)
  return { rows, stoneBid, excludedCount }
}
