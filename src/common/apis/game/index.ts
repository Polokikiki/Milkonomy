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

/** 白板（level 0）网格：合法价格必须是它的整倍数（打字输入精度） */
function whiteboardGridOf(price: number): number {
  if (price < 500) return 1
  if (price < 1000) return 2
  const k = Math.floor(Math.log10(price))
  return (price < 5 * 10 ** k ? 1 : 5) * 10 ** (k - 3)
}

/** 强化品（level ≥ 1）网格：整十进制 5×10^(k-3)；10K 以下样本稀疏取兜底 */
function enhancedGridOf(price: number): number {
  if (price < 10000) {
    return Math.max(whiteboardGridOf(price), price >= 1000 ? 5 : 1)
  }
  const k = Math.floor(Math.log10(price))
  return 5 * 10 ** (k - 3)
}

/** 向下/向上取整到 3 位有效数字（游戏挂单框的「档位」吸附粒度） */
function floorTo3Sig(v: number): number {
  if (v <= 0) return v
  const q = 10 ** (Math.floor(Math.log10(v)) - 2)
  return Math.floor(v / q) * q
}

function ceilTo3Sig(v: number): number {
  if (v <= 0) return v
  const q = 10 ** (Math.floor(Math.log10(v)) - 2)
  return Math.ceil(v / q) * q
}

/**
 * 2026-09-27 游戏补丁后的挂单价格增量（挂单框 ＋/－ 一跳 = 站点步进与左低价/右高价换算的「一档」）。
 * 规则（玩家实测时空手+7 连点序列反推，六跳全吻合）：价格 ×(1+r) 后吸附到 3 位有效数字档位——
 * 强化品 r=2.1%，白板 r=0.42%（恒 5 倍，与补丁传闻「白板 0.33~0.44%、强化 5 倍 1.67~2.22%」吻合；
 * 低价段自然复现旧行为 300→301、570→572）。
 * 实测序列验证：23.2M→23.6M→24.0M→24.5M→25.0M→25.5M→26.0M
 * （×1.021 后取整：23.687→23.6、24.096→24.0、24.504→24.5…）。
 * 另有网格层（priceStepValueOf，合法价格精度，比档位细）：由 09-28/09-29 快照只取补丁后新挂单价
 * 分带求 GCD 实证（白板 1358 点 / 强化 1500 点零违例），用于可挂单区间端点吸附等。
 * @param price 原价
 * @param high true加价(×(1+r)向下吸附), false减价(÷(1+r)向上吸附)
 * @param level 物品强化等级（≥1 走强化品档）
 */
export function priceStepOf(price: number, high: boolean = true, level: number = 0) {
  if (price <= 0) {
    return -1
  }
  const ratio = level >= 1 ? 1.021 : 1.0042
  if (high) {
    const next = floorTo3Sig(price * ratio)
    if (next > price) return next
    // 涨幅不足一个档位粒度时（如白板低价段 0.42% < 档位间距），进到下一个 3 位有效数字档
    const q = 10 ** (Math.floor(Math.log10(price)) - 2)
    return Math.floor(price / q) * q + q
  }
  const prev = ceilTo3Sig(price / ratio)
  if (prev < price) return prev
  const q = 10 ** (Math.floor(Math.log10(price)) - 2)
  return Math.ceil(price / q) * q - q
}

/** 当前网格的单档步长值（合法价格精度；用于把任意数值吸附到合法网格，如可挂单区间端点取整） */
export function priceStepValueOf(price: number, level: number = 0): number {
  if (price <= 0) return 1
  return level >= 1 ? enhancedGridOf(price) : whiteboardGridOf(price)
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
