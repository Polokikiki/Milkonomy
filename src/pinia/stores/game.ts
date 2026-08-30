import type Calculator from "@/calculator"
import type { DecomposeCalculator } from "@/calculator/alchemy"
import type { EnhanceCalculator } from "@/calculator/enhance"
import type { ManufactureCalculator } from "@/calculator/manufacture"

import type { WorkflowCalculator } from "@/calculator/workflow"
import type { Action, GameData, NoncombatStatsKey } from "~/game"
import type { Market, MarketData, MarketDataPlain, MarketItemPrice } from "~/market"
import { defineStore } from "pinia"
import { getIndexedDbValue, setIndexedDbValue } from "@/common/utils/cache/indexed-db"
import locales, { getTrans } from "@/locales"
import { pinia } from "@/pinia"

const { t } = locales.global

export const COIN_HRID = "/items/coin"

export const ACTION_LIST = [
  "milking",
  "foraging",
  "woodcutting",
  "cheesesmithing",
  "crafting",
  "tailoring",
  "cooking",
  "brewing",
  "alchemy",
  "enhancing"
] as const

export const EQUIPMENT_LIST = [
  "head",
  "body",
  "legs",
  "feet",
  "hands",

  "ring",
  "neck",
  "earrings",
  "back",
  "off_hand",
  "pouch",
  // 'main_hand'
  "charm"
] as const

export const COMMUNITY_BUFF_LIST = [
  "moo_card",
  "experience",
  "gathering_quantity",
  "production_efficiency",
  "enhancing_speed"
]

export const ACHIEVEMENT_TIER_LIST = [
  "beginner",
  "novice",
  "adept",
  "veteran",
  "elite",
  "champion"
] as const

const DEFAULT_HOUSE = {
  Efficiency: 0.015,
  Experience: 0.0005,
  RareFind: 0.002
}
export const HOUSE_MAP: Record<Action, Partial<Record<NoncombatStatsKey, number>>> = {
  milking: { ...DEFAULT_HOUSE },
  foraging: { ...DEFAULT_HOUSE },
  woodcutting: { ...DEFAULT_HOUSE },
  cheesesmithing: { ...DEFAULT_HOUSE },
  crafting: { ...DEFAULT_HOUSE },
  tailoring: { ...DEFAULT_HOUSE },
  brewing: { ...DEFAULT_HOUSE },
  cooking: { ...DEFAULT_HOUSE },
  alchemy: { ...DEFAULT_HOUSE },
  enhancing: {
    Speed: 0.01,
    Success: 0.0005,
    Experience: 0.0005,
    RareFind: 0.002
  }
}

export enum PriceStatus {
  // 左价
  ASK = "ASK",
  // 右价
  BID = "BID",
  // 比左价低一档
  ASK_LOW = "ASK_LOW",
  // 比右价高一档
  BID_HIGH = "BID_HIGH"
}

export const PRICE_STATUS_LIST = [
  { value: PriceStatus.ASK, label: getTrans("左价") },
  { value: PriceStatus.ASK_LOW, label: `${getTrans("左价")}-` },
  { value: PriceStatus.BID, label: getTrans("右价") },
  { value: PriceStatus.BID_HIGH, label: `${getTrans("右价")}+` }
]

export const useGameStore = defineStore("game", {
  state: () => ({
    gameData: null as GameData | null,
    marketData: null as MarketData | null,
    leaderboardCache: {} as { [key: string]: Calculator[] },
    enhanposerCache: {} as { [time: number]: WorkflowCalculator[] },
    manualchemyCache: {} as { [key: string]: Calculator[] },
    superAlchemyCache: {} as { [key: string]: any[] },
    volHistory: [] as { ts: number, v: Record<string, number> }[],
    realtimeData: null as { ts: number, data: Record<string, { a: number, b: number, t: number }> } | null,
    jungleCache: {} as { [key: string]: WorkflowCalculator[] },
    junglestCache: {} as { [key: string]: EnhanceCalculator[] },
    inheritCache: {} as { [time: number]: ManufactureCalculator[] },
    decomposeCache: {} as { [time: number]: DecomposeCalculator[] },
    secret: loadSecret(),
    buyStatus: loadBuyStatus(),
    sellStatus: loadSellStatus(),
    persistentDataHydrated: false
  }),
  actions: {
    async pollRealtime() {
      try {
        const res = await fetch("https://rt.milkonomy.top/realtime.json", { cache: "no-store", signal: AbortSignal.timeout(10_000) })
        if (!res.ok) return
        const data = await res.json()
        if (data && data.data && Object.keys(data.data).length > 0) {
          this.realtimeData = data
        }
      } catch {
        // 域名未生效/网络不可达时静默
      }
    },
    async hydratePersistentData() {
      if (this.persistentDataHydrated) {
        return
      }

      const [gameData, marketData] = await Promise.all([
        getGameData(),
        getMarketData()
      ])

      this.gameData = gameData
      this.marketData = marketData
      this.persistentDataHydrated = true
    },
    async tryFetchData() {
      let retryCount = 5
      while (retryCount--) {
        try {
          await this.fetchData(retryCount)
          break
        } catch (e) {
          console.error(`获取数据第${5 - retryCount}次失败`, e)
          ElMessage.error(t("获取数据第{0}次失败，正在重试...", [5 - retryCount]))
        }
      }
      if (retryCount < 0) {
        // 5 次全部失败：有缓存则降级用缓存，否则只能报错
        if (this.gameData && this.marketData) {
          ElMessage.error(t("数据获取失败，直接使用缓存数据"))
          return
        }
        ElMessage.error(t("数据获取失败，请检查网络连接"))
        throw new Error("强制宕机")
      }
    },
    async fetchData(offset: number) {
      // 如果数据time晚于30min前，无需更新，减少流量
      // if (this.gameData && this.marketData && this.marketData.timestamp * 1000 > Date.now() - 1000 * 60 * 30) {
      //   return
      // }
      const url = import.meta.env.MODE === "development" ? "/" : "./"
      const MARKET_URLS = [
        // "https://mooket.qi-e.top/market/api.json",
        "https://www.milkywayidle.com/game_data/marketplace.json"
      ]
      const LAST_MARKET_URL = `${url}data/market.json`
      const DATA_URL = `${url}data/data.json`
      const marketUrl = MARKET_URLS[(4 - offset) % MARKET_URLS.length]

      // 官方 marketplace.json 响应带约 1h 的 HTTP 缓存头，必须 no-store，
      // 否则挂机轮询永远命中缓存、时间戳停在首次打开时刻
      const fetchMarket = async (u: string) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10_000)
        try {
          return await fetch(u, { cache: "no-store", signal: controller.signal })
        } finally {
          clearTimeout(timer)
        }
      }
      // 官方格式：数字 timestamp + marketData 对象（拒绝 MWIApi 旧格式 market/time）
      const isOfficialMarket = (d: unknown): d is MarketDataPlain =>
        typeof (d as MarketDataPlain)?.timestamp === "number"
        && !!(d as MarketDataPlain)?.marketData

      const dataPromise = fetch(DATA_URL).then(async (res) => {
        if (!res.ok) throw new Error("Response not ok")
        return res.json() as Promise<GameData>
      })

      let newMarketData: MarketDataPlain
      try {
        const marketResponse = await fetchMarket(marketUrl)
        if (!marketResponse.ok) throw new Error("Response not ok")
        const official = await marketResponse.json()
        if (!isOfficialMarket(official)) throw new Error("invalid marketplace.json")
        newMarketData = official
      } catch (e) {
        // 国内直连官方接口失败/超时：回退同源快照（gh-pages 上由 update-market workflow 每小时刷新）
        console.warn("官方市场数据获取失败，回退本地快照", e)
        const snapshotResponse = await fetchMarket(LAST_MARKET_URL)
        if (!snapshotResponse.ok) throw new Error("Snapshot response not ok")
        const snapshot = await snapshotResponse.json()
        if (!isOfficialMarket(snapshot)) throw new Error("invalid market snapshot")
        newMarketData = snapshot
      }
      const newGameData = await dataPromise
      // 仅当 gameData 版本真的变化时才更新 pinia 状态并清空衍生缓存，
      // 避免每次轮询都触发整棵响应链；
      // 历史上注释写的"防止国际化数据被覆"已不再成立——i18n 走静态映射，不会回写 gameData
      const gameVersionChanged = !this.gameData
        || this.gameData.gameVersion !== newGameData.gameVersion
        || this.gameData.versionTimestamp !== newGameData.versionTimestamp
      if (gameVersionChanged) {
        this.gameData = newGameData
        this.clearAllCaches()
      }
      await setGameData(newGameData)

      // 如果缓存数据的时间戳与新数据相同，则不更新
      const sameTimestamp = this.marketData?.timestamp && this.marketData?.timestamp === newMarketData.timestamp
      // 兼容：老缓存 marketData 里没有 avg/vol 字段，但 timestamp 可能相同，导致无法触发结构升级
      if (sameTimestamp && hasAvgVolFields(this.marketData)) {
        return
      }

      this.marketData = await updateMarketData(this.marketData, newMarketData, newGameData)
      this.clearAllCaches()

      // 成交量历史快照（update-market workflow 每小时生成；文件不存在时静默跳过）
      fetch(`${url}data/vol-history.json`)
        .then(async (res) => {
          if (!res.ok) return
          const hist = await res.json()
          if (Array.isArray(hist) && hist.length > 0 && this.volHistory.length !== hist.length) {
            this.volHistory = hist
          }
        })
        .catch(() => { /* 快照尚未生成，忽略 */ })
    },

    savePriceStatus() {
      // saveBuyStatus(this.buyStatus)
      // saveSellStatus(this.sellStatus)
      this.clearAllCaches()
    },
    resetPriceStatus() {
      this.buyStatus = loadBuyStatus()
      this.sellStatus = loadSellStatus()
    },
    getLeaderboardCache(key?: string) {
      const cacheKey = key ?? String(this.marketData!.timestamp)
      return this.leaderboardCache[cacheKey]
    },
    setLeaderBoardCache(list: Calculator[], key?: string) {
      const cacheKey = key ?? String(this.marketData!.timestamp)
      this.leaderboardCache[cacheKey] = list
    },
    clearLeaderBoardCache(key?: string) {
      if (key) {
        delete this.leaderboardCache[key]
        return
      }
      this.leaderboardCache = {}
    },
    getEnhanposerCache() {
      return this.enhanposerCache[this.marketData!.timestamp]
    },
    setEnhanposerCache(list: WorkflowCalculator[]) {
      this.clearEnhanposerCache()
      this.enhanposerCache[this.marketData!.timestamp] = list
    },
    clearEnhanposerCache() {
      this.enhanposerCache = {}
    },
    getManualchemyCache() {
      return this.manualchemyCache[this.marketData!.timestamp]
    },
    setManualchemyCache(list: Calculator[]) {
      this.clearManualchemyCache()
      this.manualchemyCache[this.marketData!.timestamp] = list
    },
    clearManualchemyCache() {
      this.manualchemyCache = {}
    },
    getSuperAlchemyCache(key?: string) {
      const cacheKey = key ?? String(this.marketData!.timestamp)
      return this.superAlchemyCache[cacheKey]
    },
    setSuperAlchemyCache(list: any[], key?: string) {
      this.clearSuperAlchemyCache()
      this.superAlchemyCache[key ?? String(this.marketData!.timestamp)] = list
    },
    clearSuperAlchemyCache() {
      this.superAlchemyCache = {}
    },
    getJungleCache(key: string) {
      return this.jungleCache[key]
    },
    setJungleCache(list: WorkflowCalculator[], key: string) {
      this.jungleCache[key] = list
    },
    clearJungleCache(key?: string) {
      if (key) {
        delete this.jungleCache[key]
      } else {
        this.jungleCache = {}
      }
    },
    getJunglestCache() {
      return this.junglestCache[this.marketData!.timestamp]
    },
    getJunglestCacheByKey(key: string) {
      return this.junglestCache[key]
    },
    setJunglestCache(list: EnhanceCalculator[]) {
      this.clearJunglestCache()
      this.junglestCache[this.marketData!.timestamp] = list
    },
    setJunglestCacheByKey(list: EnhanceCalculator[], key: string) {
      this.junglestCache[key] = list
    },
    clearJunglestCache() {
      this.junglestCache = {}
    },
    getInheritCache() {
      return this.inheritCache[this.marketData!.timestamp]
    },
    setInheritCache(list: ManufactureCalculator[]) {
      this.clearInheritCache()
      this.inheritCache[this.marketData!.timestamp] = list
    },
    clearInheritCache() {
      this.inheritCache = {}
    },
    getDecomposeCache() {
      return this.decomposeCache[this.marketData!.timestamp]
    },
    setDecomposeCache(list: DecomposeCalculator[]) {
      this.clearDecomposeCache()
      this.decomposeCache[this.marketData!.timestamp] = list
    },
    clearDecomposeCache() {
      this.decomposeCache = {}
    },
    setSecret(value: string) {
      this.secret = value
      saveSecret(value)
    },
    checkSecret() {
      return true
      // return import.meta.env.VITE_BUILD_MODE === "private"
    },

    clearAllCaches() {
      this.clearLeaderBoardCache()
      this.clearManualchemyCache()
      this.clearInheritCache()
      this.clearDecomposeCache()
      this.clearEnhanposerCache()
      this.clearJungleCache()
      this.clearJunglestCache()
    }
  }
})

function hasAvgVolFields(data: MarketData | null | undefined) {
  const market = data?.marketData
  if (!market) return false
  for (const hrid in market) {
    const item = market[hrid]
    if (!item) continue
    for (const level in item) {
      const price: any = (item as any)[level]
      if (price && (Object.prototype.hasOwnProperty.call(price, "avg") || Object.prototype.hasOwnProperty.call(price, "vol"))) {
        return true
      }
    }
  }
  return false
}

async function updateMarketData(oldData: MarketData | null, newData: MarketDataPlain, newGameData: GameData): Promise<MarketData> {
  const oldMarket = oldData?.marketData || {}
  const newMarket: Market = { }

  // 将 MarketDataPlain 转成 MarketData 的结构
  for (const hrid in newData.marketData) {
    const levels = newData.marketData[hrid]
    if (!levels) continue
    newMarket[hrid] = {}
    for (const level in levels) {
      const plain = levels[level] || {}
      newMarket[hrid][level] = {
        ask: plain.a ?? -1,
        bid: plain.b ?? -1,
        avg: plain.p ?? -1,
        vol: plain.v ?? -1
      }
    }
  }

  // 取得name->isEquipment的映射
  const itemDetailMap = newGameData.itemDetailMap
  const isEquipmentMap: Record<string, boolean> = {}
  for (const key in itemDetailMap) {
    const item = itemDetailMap[key]
    isEquipmentMap[item.hrid] = item.categoryHrid === "/item_categories/equipment"
  }
  for (const hrid in newMarket) {
    // 装备不留旧值；非装备且无旧数据的物品也无从回填，跳过
    if (isEquipmentMap[hrid] || !oldMarket[hrid]) {
      continue
    }
    for (const level in newMarket[hrid]) {
      const price = newMarket[hrid][level]
      if (price.ask === -1) {
        price.ask = (oldMarket[hrid]?.[level] as MarketItemPrice)?.ask || -1
      }
      if (price.bid === -1) {
        price.bid = (oldMarket[hrid]?.[level] as MarketItemPrice)?.bid || -1
      }
      if ((price.avg ?? -1) === -1) {
        price.avg = (oldMarket[hrid]?.[level] as MarketItemPrice)?.avg ?? -1
      }
      if ((price.vol ?? -1) === -1) {
        price.vol = (oldMarket[hrid]?.[level] as MarketItemPrice)?.vol ?? -1
      }
    }
  }

  // 有些物品可能是oldMarket有的，newMarket没有的
  // for (const key in oldMarket) {
  //   if (!newMarket[key] && !isEquipmentMap[key]) {
  //     newMarket[key] = JSON.parse(JSON.stringify(oldMarket[key]))
  //   }
  // }

  const result = {
    timestamp: newData.timestamp,
    marketData: newMarket
  }
  await setMarketData(result)

  return result
}

const KEY_PREFIX = "game-"
const GAME_DATA_KEY = `${KEY_PREFIX}game-data`
const MARKET_DATA_KEY = `${KEY_PREFIX}market-data`

function readLegacyLocalStorageJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) {
    return null
  }
  return JSON.parse(raw) as T
}

async function getMarketData() {
  const cached = await getIndexedDbValue<MarketData>(MARKET_DATA_KEY)
  if (cached) {
    return cached
  }

  const legacy = readLegacyLocalStorageJson<MarketData>(MARKET_DATA_KEY)
  if (legacy) {
    await setIndexedDbValue(MARKET_DATA_KEY, legacy)
    localStorage.removeItem(MARKET_DATA_KEY)
  }
  return legacy
}

async function setMarketData(value: MarketData) {
  await setIndexedDbValue(MARKET_DATA_KEY, value)
  localStorage.removeItem(MARKET_DATA_KEY)
}

async function getGameData() {
  const cached = await getIndexedDbValue<GameData>(GAME_DATA_KEY)
  if (cached) {
    return cached
  }

  const legacy = readLegacyLocalStorageJson<GameData>(GAME_DATA_KEY)
  if (legacy) {
    await setIndexedDbValue(GAME_DATA_KEY, legacy)
    localStorage.removeItem(GAME_DATA_KEY)
  }
  return legacy
}

async function setGameData(value: GameData) {
  await setIndexedDbValue(GAME_DATA_KEY, value)
  localStorage.removeItem(GAME_DATA_KEY)
}

function loadSecret() {
  return localStorage.getItem(`${KEY_PREFIX}secrete`) || ""
}

function saveSecret(value: string) {
  localStorage.setItem(`${KEY_PREFIX}secrete`, value)
}

function loadBuyStatus() {
  return PriceStatus.ASK
}
function loadSellStatus() {
  return PriceStatus.BID
}

export function useGameStoreOutside() {
  return useGameStore(pinia)
}
