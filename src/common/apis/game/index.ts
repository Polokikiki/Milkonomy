import type { EnhancelateResult } from "@/calculator/enhance"
import type { AchievementTierDetail, ActionDetail, CommunityBuffDetail, DropTableItem, GameData, ItemDetail, PersonalBuffDetail } from "~/game"
import type { MarketData, MarketItemPrice } from "~/market"
import deepFreeze from "deep-freeze-strict"
import { SHOP_FIXED_PRICES } from "@/common/config"
import { COIN_HRID, PriceStatus, useGameStoreOutside } from "@/pinia/stores/game"

// 把Proxy扒下来，提高性能
const game = {
  gameData: null as GameData | null,
  marketData: null as MarketData | null
}
let _actionDetailMapCache: Record<string, ActionDetail> = {}
const _itemDetailMapCache: Record<string, ItemDetail> = {}
const _communityBuffTypeDetailMapCache: Record<string, CommunityBuffDetail> = {}
const _personalBuffTypeDetailMapCache: Record<string, PersonalBuffDetail> = {}
const _achievementTierDetailMapCache: Record<string, AchievementTierDetail> = {}

export interface ProcessingInfo {
  hrid: string
  inputCount: number
}
let _processingProductMap: Record<string, ProcessingInfo> = {}
let _priceCache = {} as Record<string, MarketItemPrice>
let currentBuyStatus = useGameStoreOutside().buyStatus
let currentSellStatus = useGameStoreOutside().sellStatus
watch(() => useGameStoreOutside().gameData, () => {
  const data = structuredClone(toRaw(useGameStoreOutside().gameData))
  game.gameData = data ? deepFreeze(data) : data
  _actionDetailMapCache = {}
  _priceCache = {}
  initProcessingProductMap()
}, { immediate: true })
watch(() => useGameStoreOutside().marketData, () => {
  const data = Object.freeze(structuredClone(toRaw(useGameStoreOutside().marketData)))
  game.marketData = data
  _priceCache = {}
}, { immediate: true })

watch([() => useGameStoreOutside().buyStatus, () => useGameStoreOutside().sellStatus], () => {
  _priceCache = {}
}, { immediate: true })

watch(() => useGameStoreOutside().buyStatus, (newVal) => {
  currentBuyStatus = newVal
}, { immediate: true })

watch(() => useGameStoreOutside().sellStatus, (newVal) => {
  currentSellStatus = newVal
}, { immediate: true })

/** 查 */
export function getGameDataApi() {
  const res = game.gameData
  return res!
}
export function getMarketDataApi() {
  const res = game.marketData
  return res!
}
const SPECIAL_PRICE: Record<string, () => MarketItemPrice> = {
  "/items/cowbell": () => {
    const bag = getPriceOf("/items/bag_of_10_cowbells")
    // 无市价时 ask/bid 为 -1，-1/10 是 truthy 会漏过 || 兜底，必须显式判断
    return {
      ask: bag.ask > 0 ? bag.ask / 10 : 40000,
      bid: bag.bid > 0 ? bag.bid / 10 : 40000,
      avg: -1,
      vol: -1
    }
  },
  "/items/coin": () => ({
    ask: 1,
    bid: 1,
    avg: 1,
    vol: -1
  })
}

function convertPriceOfStatus(price: MarketItemPrice, buyStatus: PriceStatus, sellStatus: PriceStatus, level: number = 0) {
  function convert(status: PriceStatus, side: "ask" | "bid") {
    const result = { price: -1 }
    switch (status) {
      case PriceStatus.ASK:
        result.price = price.ask
        break
      case PriceStatus.BID:
        result.price = price.bid
        break
      case PriceStatus.ASK_LOW:
        result.price = price.ask
        if (result.price > 0) {
          result.price = priceStepOf(result.price, false, level)
        }
        break
      case PriceStatus.BID_HIGH:
        result.price = price.bid
        if (result.price > 0) {
          result.price = priceStepOf(result.price, true, level)
        }
        break
      case PriceStatus.MARKET:
        // 市场价格：不做档位换算，按侧直取原始挂单价
        result.price = side === "ask" ? price.ask : price.bid
        break
    }
    return result
  }

  return {
    ask: convert(buyStatus, "ask").price,
    bid: convert(sellStatus, "bid").price,
    // avg/vol are not affected by buy/sell status; keep raw values
    avg: price.avg,
    vol: price.vol
  }
}

/**
 * 官方价格档位（2026-09-29 自游戏客户端 JS 反解的 binGap 原逻辑）。
 * 依据：从 2 累加到 10^12 生成的档位数与官方一致（普通 6184 档、强化 1346 档）；
 * 玩家实测时空手+7 连点序列 23.2M→23.6M→24.0M→24.5M→25.0M→25.5M→26.0M 逐跳吻合
 * （23 前缀档距 400K、跨入 24 前缀变 500K 的突变即两位前缀换档）。
 * 补丁说明原文：挂单价间隔 0.33%~0.44%，强化品(+1 起)用 5 倍间距(1.67%~2.22%)。
 */
const BIN_GAP_UNIT_TIERS: ReadonlyArray<readonly [number, number]> = [
  [12, 4],
  [15, 5],
  [18, 6],
  [24, 8],
  [30, 10],
  [36, 12],
  [48, 16],
  [60, 20],
  [75, 25],
  [90, 30]
]

function tightBinGapUnit(prefix: number): number {
  for (const [threshold, unit] of BIN_GAP_UNIT_TIERS) {
    if (prefix < threshold) return unit
  }
  return 40
}

/** 挂单档位间距（官方 binGap）：enhanced=强化品（+1 起，官方 5 倍间距） */
export function binGapOf(price: number, enhanced: boolean): number {
  const s = String(Math.floor(price))
  const n = s.length
  if (n <= 2) return 1
  if (n === 3) {
    const d = s[0]
    if (enhanced) return d === "1" ? 2 : d <= "3" ? 5 : d <= "7" ? 10 : 20
    return d <= "3" ? 1 : d <= "7" ? 2 : 4
  }
  const base = tightBinGapUnit(Number(s.slice(0, 2))) * 10 ** (n - 4)
  return enhanced ? 5 * base : base
}

/** 懒生成官方完整阶梯（普通 6184 档 / 强化 1346 档，与官方提取数一致） */
let ladderCache: { normal: number[], enhanced: number[] } | null = null
function getLadder(enhanced: boolean): number[] {
  if (!ladderCache) {
    const build = (enh: boolean) => {
      const arr: number[] = [2]
      let p = 2
      while (p < 1e12) {
        p += binGapOf(p, enh)
        if (p > 1e12) break
        arr.push(p)
      }
      return arr
    }
    ladderCache = { normal: build(false), enhanced: build(true) }
  }
  return enhanced ? ladderCache.enhanced : ladderCache.normal
}

/**
 * 官方档位上下一档：在完整阶梯上二分查找，非档位价（如补丁前老单的价）按方向吸附到最近合法档——
 * 与游戏挂单框行为一致。
 * 边界：最低价 2，减到 2 以下回到 0（官方行为）。
 * 举例：
 * priceStepOf(570, true) = 572
 * priceStepOf(23200000, true, 7) = 23600000（档位价逐档走）
 * priceStepOf(481000000, true, 7) = 下一合法档（补丁前老价吸附）
 * @param price 原价
 * @param high true加价(吸附到上一档), false减价(吸附到下一档)
 * @param level 物品强化等级（≥1 走强化品阶梯）
 */
export function priceStepOf(price: number, high: boolean = true, level: number = 0) {
  if (price <= 0) {
    return -1
  }
  const ladder = getLadder(level >= 1)
  let lo = 0
  let hi = ladder.length - 1
  if (high) {
    if (price >= ladder[hi]) return ladder[hi]
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ladder[mid] > price) hi = mid
      else lo = mid + 1
    }
    return ladder[lo]
  }
  if (price <= ladder[0]) return 0
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ladder[mid] < price) lo = mid
    else hi = mid - 1
  }
  return ladder[lo]
}

/** 把任意数值四舍五入到 3 位有效数字（可挂单区间端点显示用） */
export function priceSnapOf(value: number): number {
  if (!(value > 0)) return value
  const q = 10 ** (Math.floor(Math.log10(value)) - 2)
  return Math.round(value / q) * q
}

export function getPriceOf(hrid: string, level: number = 0, buyStatus: PriceStatus = currentBuyStatus, sellStatus: PriceStatus = currentSellStatus): MarketItemPrice {
  if (!hrid) {
    return {
      ask: -1,
      bid: -1,
      avg: -1,
      vol: -1
    }
  }
  const item = getItemDetailOf(hrid)
  if (level) {
    const marketItem = game.marketData?.marketData[hrid]
    const priceItem = marketItem ? marketItem[level] : undefined

    const price = {
      ask: priceItem?.ask ?? -1,
      bid: priceItem?.bid ?? -1,
      avg: priceItem?.avg ?? -1,
      vol: priceItem?.vol ?? -1
    }
    return convertPriceOfStatus(price, buyStatus, sellStatus, level)
  }

  // Cache key MUST include price status; otherwise calling getPriceOf(hrid, 0, ..., BID_HIGH)
  // after getPriceOf(hrid, 0, ..., BID) would incorrectly return the cached BID result.
  const cacheKey = `${hrid}|${buyStatus}|${sellStatus}`

  if (_priceCache[cacheKey]) {
    return _priceCache[cacheKey]
  }
  if (SPECIAL_PRICE[hrid]) {
    _priceCache[cacheKey] = SPECIAL_PRICE[hrid]()
    return _priceCache[cacheKey]
  }
  if (isLoot(hrid) && hrid !== "/items/bag_of_10_cowbells") {
    _priceCache[cacheKey] = getLootPrice(hrid)
    return _priceCache[cacheKey]
  }
  const shopItem = getGameDataApi().shopItemDetailMap[`/shop_items/${item.hrid.split("/").pop()}`]
  const fixedShopPrice = SHOP_FIXED_PRICES[item.hrid]
  const price = (getMarketDataApi().marketData[item.hrid]?.[0]) || { ask: -1, bid: -1, avg: -1, vol: -1 }

  // 商店价格：优先取 API 数据，兜底取硬编码
  const shopPrice = shopItem?.costs?.[0]?.itemHrid === COIN_HRID ? shopItem.costs[0].count : fixedShopPrice
  if (shopPrice) {
    price.ask = price.ask === -1 ? shopPrice : Math.min(price.ask, shopPrice)
  }
  _priceCache[cacheKey] = convertPriceOfStatus(price, buyStatus, sellStatus)

  return _priceCache[cacheKey]
}

function isLoot(hrid: string) {
  return getItemDetailOf(hrid).categoryHrid === "/item_categories/loot"
}

function getLootPrice(hrid: string): MarketItemPrice {
  const drop = getGameDataApi().openableLootDropMap[hrid]
  if (!drop) return { ask: -1, bid: -1, avg: -1, vol: -1 }
  return drop.reduce((acc, cur) => {
    const count = (cur.maxCount + cur.minCount) / 2
    const item = getPriceOf(cur.itemHrid)
    acc.ask += item.ask * count * cur.dropRate
    acc.bid += item.bid * count * cur.dropRate
    return acc
  }, { ask: 0, bid: 0, avg: -1, vol: -1 })
}

export function getItemDetailOf(hrid: string) {
  let result = _itemDetailMapCache[hrid]
  if (!result) {
    result = getGameDataApi().itemDetailMap[hrid]
    result && (_itemDetailMapCache[hrid] = result)
  }
  return result
}

export function getActionDetailOf(key: string) {
  let result = _actionDetailMapCache[key]
  if (!result) {
    result = getGameDataApi().actionDetailMap[key]
    result && (_actionDetailMapCache[key] = result)
  }
  return result
}

export function getCommunityBuffDetailOf(hrid: string) {
  let result = _communityBuffTypeDetailMapCache[hrid]
  if (!result) {
    // 游戏数据未加载完成时返回 undefined，调用方需自行判空（模板首屏竞态）
    const map = getGameDataApi()?.communityBuffTypeDetailMap
    result = map?.[hrid]
    result && (_communityBuffTypeDetailMapCache[hrid] = result)
  }
  return result
}

export function getPersonalBuffDetailOf(hrid: string) {
  let result = _personalBuffTypeDetailMapCache[hrid]
  if (!result) {
    const map = getGameDataApi().personalBuffTypeDetailMap
    if (!map) {
      return undefined
    }
    result = map[hrid]
    result && (_personalBuffTypeDetailMapCache[hrid] = result)
  }
  return result
}

export function getAchievementTierDetailOf(hrid: string) {
  let result = _achievementTierDetailMapCache[hrid]
  if (!result) {
    const map = getGameDataApi()?.achievementTierDetailMap
    if (!map) {
      return undefined
    }
    result = map[hrid as keyof GameData["achievementTierDetailMap"]]
    result && (_achievementTierDetailMapCache[hrid] = result)
  }
  return result
}

export function getTransmuteTimeCost() {
  return getActionDetailOf("/actions/alchemy/transmute").baseTimeCost
}

export function getDecomposeTimeCost() {
  return getActionDetailOf("/actions/alchemy/decompose").baseTimeCost
}

export function getCoinifyTimeCost() {
  return getActionDetailOf("/actions/alchemy/coinify").baseTimeCost
}

export function getEnhanceTimeCost() {
  return getActionDetailOf("/actions/enhancing/enhance").baseTimeCost
}

export function enhancementLevelSuccessRateTable() {
  return getGameDataApi().enhancementLevelSuccessRateTable
}

export function initProcessingProductMap() {
  _processingProductMap = {}
  game.gameData && Object.entries(game.gameData.actionDetailMap).forEach(([key, value]) => {
    if (key.match(/fabric$/) || key.match(/lumber$/) || key.match(/cheese$/)) {
      const input = value.inputItems[0]
      _processingProductMap[input.itemHrid] = {
        hrid: value.outputItems[0].itemHrid,
        inputCount: input.count
      }
    }
  })
  if (!_processingProductMap["/items/rainbow_milk"]) {
    _processingProductMap["/items/rainbow_milk"] = {
      hrid: "/items/rainbow_cheese",
      inputCount: 2
    }
  }
}

export function getProcessingProduct(hrid: string): ProcessingInfo | undefined {
  return _processingProductMap[hrid]
}

// #region enhancelate
let enhancelateCache = {} as Record<string, EnhancelateResult>
export interface EnhancelateCacheParams {
  enhanceLevel: number
  protectLevel: number
  itemLevel: number
  originLevel: number
  escapeLevel: number
}
export function getEnhancelateCache(params: EnhancelateCacheParams) {
  return enhancelateCache[`${params.originLevel}-${params.enhanceLevel}-${params.protectLevel}-${params.itemLevel}-${params.escapeLevel}`]
}
export function setEnhancelateCache(params: EnhancelateCacheParams, result: EnhancelateResult) {
  enhancelateCache[`${params.originLevel}-${params.enhanceLevel}-${params.protectLevel}-${params.itemLevel}-${params.escapeLevel}`] = result
}
export function clearEnhancelateCache() {
  enhancelateCache = {}
}
// #region 游戏内代码
const TIMEVALUES = {
  SECOND: 1e9,
  MINUTE: 6e10,
  HOUR: 36e11,
  NANOSECONDS_IN_MILLISECOND: 1e6,
  NANOSECONDS_IN_SECOND: 1e9,
  SECONDS_IN_YEAR: 31536e3,
  SECONDS_IN_DAY: 86400,
  SECONDS_IN_HOUR: 3600,
  SECONDS_IN_MINUTE: 60
}

export function getAlchemyRareDropTable(item: ItemDetail, baseTimeCost: number): DropTableItem[] {
  let dropHrid = "/items/small_artisans_crate"
  const i = 1 * baseTimeCost / (8 * TIMEVALUES.HOUR)
  let s = 0
  if (item.itemLevel < 35) {
    dropHrid = "/items/small_artisans_crate"
    s = (item.itemLevel + 100) / 100
  } else if (item.itemLevel < 70) {
    dropHrid = "/items/medium_artisans_crate"
    s = (item.itemLevel - 35 + 100) / 150
  } else {
    dropHrid = "/items/large_artisans_crate"
    s = (item.itemLevel - 70 + 100) / 200
  }
  return [{
    itemHrid: dropHrid,
    dropRate: i * s,
    minCount: 1,
    maxCount: 1
  }]
}

export function getAlchemyEssenceDropTable(item: ItemDetail, timeCost: number): DropTableItem[] {
  return [{
    itemHrid: "/items/alchemy_essence",
    dropRate: 1 * timeCost / (6 * TIMEVALUES.MINUTE) * ((item.itemLevel + 100) / 100),
    minCount: 1,
    maxCount: 1
  }]
}

// 分解强化物品
export function getAlchemyDecomposeEnhancingEssenceOutput(item: ItemDetail, enhancementLevel: number) {
  return enhancementLevel === 0
    ? 0
    : Math.round(2 * (0.5 + 0.1 * 1.05 ** (item.itemLevel || 0)) * 2 ** enhancementLevel)
}

export function getAlchemyDecomposeCoinCost(item: ItemDetail) {
  const itemLevel = item.itemLevel || 0
  return Math.floor(5 * (10 + itemLevel))
}

export function getEnhancingEssenceDropTable(item: ItemDetail, timeCost: number) {
  const a = 1 * timeCost / (2 * TIMEVALUES.MINUTE) * ((item.itemLevel + 100) / 100)
  return [{
    itemHrid: "/items/enhancing_essence",
    dropRate: a,
    minCount: 1,
    maxCount: 1
  }]
}

export function getEnhancingRareDropTable(item: ItemDetail, timeCost: number) {
  let dropHird = "/items/small_artisans_crate"
  const i = 1 * timeCost / (4 * TIMEVALUES.HOUR)
  let s = 0
  if (item.itemLevel < 35) {
    dropHird = "/items/small_artisans_crate"
    s = (item.itemLevel + 100) / 100
  } else if (item.itemLevel < 70) {
    dropHird = "/items/medium_artisans_crate"
    s = (item.itemLevel - 35 + 100) / 150
  } else {
    dropHird = "/items/large_artisans_crate"
    s = (item.itemLevel - 70 + 100) / 200
  }
  return [{
    itemHrid: dropHird,
    dropRate: i * s,
    minCount: 1,
    maxCount: 1
  }]
}

export function getEnhancementExp(item: ItemDetail, enhancementLevel: number) {
  return 1.4 * (1 + enhancementLevel) * (10 + item.itemLevel)
}

export function getCoinifyExp(item: ItemDetail) {
  return 1 * (10 + item.itemLevel)
}
export function getDecomposeExp(item: ItemDetail) {
  return 1.4 * (10 + item.itemLevel)
}
export function getTransmuteExp(item: ItemDetail) {
  return 1.6 * (10 + item.itemLevel)
}

// #endregion

/** 多窗口成交量：1h = 当前市场数据；N小时 = 最近 N 条小时快照求和 */
export function getVolOf(hrid: string, level: number = 0, hours: number = 1): number {
  if (hours <= 1) return getPriceOf(hrid, level).vol ?? -1
  const hist = useGameStoreOutside().volHistory
  if (!hist || hist.length === 0) return -1
  let sum = 0
  for (const snap of hist.slice(-hours)) {
    sum += snap.v?.[`${hrid}@${level}`] || 0
  }
  return sum
}

/** 实时订单簿价格 */
export function getRealtimePriceOf(hrid: string, level: number = 0): { ask: number, bid: number, isRealtime: boolean } {
  const rt = useGameStoreOutside().realtimeData
  const key = `${hrid}@${level}`
  const snap = rt?.data?.[key]
  // 240s 窗口 = 上报批次 30s + 边缘缓存最长 ~120s + 余量（免费档边缘 TTL 下限所致）
  if (snap && snap.t > Date.now() - 240_000) {
    return { ask: snap.a, bid: snap.b, isRealtime: true }
  }
  const p = getPriceOf(hrid, level)
  return { ask: p.ask, bid: p.bid, isRealtime: false }
}

export function getRealtimeAgeSec(): number {
  const rt = useGameStoreOutside().realtimeData
  if (!rt || !rt.ts) return -1
  return Math.floor((Date.now() - rt.ts) / 1000)
}

/** 催化剂价格侧独立设置 */
let currentCatalystStatus: PriceStatus | null = null
export function setCatalystBuyStatus(status: PriceStatus | null) {
  currentCatalystStatus = status
}
export function getCatalystBuyStatus(): PriceStatus | null {
  return currentCatalystStatus
}
export function getCatalystAskOf(hrid: string): number {
  return getPriceOf(hrid, 0, currentCatalystStatus ?? currentBuyStatus).ask
}
