import type { EnhancelateResult } from "@/calculator/enhance"
import type { AchievementTierDetail, ActionDetail, CommunityBuffDetail, DropTableItem, GameData, ItemDetail, PersonalBuffDetail } from "~/game"
import type { MarketData, MarketItemPrice } from "~/market"
import deepFreeze from "deep-freeze-strict"
import { COIN_HRID, PriceStatus, useGameStoreOutside } from "@/pinia/stores/game"
import { SHOP_FIXED_PRICES } from "@/common/config"

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
  console.log("raw marketData changed")
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
  "/items/cowbell": () => ({
    ask: getPriceOf("/items/bag_of_10_cowbells").ask / 10 || 40000,
    bid: getPriceOf("/items/bag_of_10_cowbells").bid / 10 || 40000,
    avg: -1,
    vol: -1
  }),
  "/items/coin": () => ({
    ask: 1,
    bid: 1,
    avg: 1,
    vol: -1
  })
}

function convertPriceOfStatus(price: MarketItemPrice, buyStatus: PriceStatus, sellStatus: PriceStatus) {
  function convert(status: PriceStatus) {
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
          result.price = priceStepOf(result.price, false)
        }
        break
      case PriceStatus.BID_HIGH:
        result.price = price.bid
        if (result.price > 0) {
          result.price = priceStepOf(result.price, true)
        }
        break
    }
    return result
  }

  return {
    ask: convert(buyStatus).price,
    bid: convert(sellStatus).price,
    // avg/vol are not affected by buy/sell status; keep raw values
    avg: price.avg,
    vol: price.vol
  }
}

const priceStep = [
  [0, 1],
  [50, 2],
  [100, 5],
  [300, 10]
  // [500,20],
  // [1000,50]
  // ...
]
/**
 * 举例：
 * priceStepOf(300,true) = 310
 * priceStepOf(300,false) = 295
 * priceStepOf(1000,true) = 1050
 * priceStepOf(1000,false) = 980
 * priceStepOf(100000,true) = 105000
 * priceStepOf(100000,false) = 98000
 * @param price 原价
 * @param high true加价, false减价
 */
export function priceStepOf(price: number, high: boolean = true) {
  if (price <= 0) {
    return -1
  }
  // 先将price按十进制转为0~300的范围
  let dec = 0
  while (price > 300) {
    price /= 10
    dec += 1
  }
  // 找到对应的step和stepIndex
  let highStepIndex = 0
  let lowStepIndex = 0
  for (let i = 0; i < priceStep.length; i++) {
    if (price <= priceStep[i][0]) {
      highStepIndex = lowStepIndex = i - 1
      if (price === priceStep[i][0]) {
        highStepIndex = i
      }
      break
    }
  }
  return high ? (price + priceStep[highStepIndex][1]) * 10 ** dec : (price - priceStep[lowStepIndex][1]) * 10 ** dec
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
    return convertPriceOfStatus(price, buyStatus, sellStatus)
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
  return drop.reduce((acc, cur) => {
    const count = (cur.maxCount + cur.minCount) / 2
    const item = getPriceOf(cur.itemHrid)
    acc.ask += item.ask * count * cur.dropRate
    acc.bid += item.bid * count * cur.dropRate
    return acc
  }, { ask: 0, bid: 0 })
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
    result = getGameDataApi().communityBuffTypeDetailMap[hrid]
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
    const map = getGameDataApi().achievementTierDetailMap
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
