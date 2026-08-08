import { DecomposeCalculator } from "@/calculator/alchemy"
import { EnhanceCalculator } from "@/calculator/enhance"
import { getStorageCalculatorItem } from "@/calculator/utils"
import { WorkflowCalculator } from "@/calculator/workflow"
import locales, { getTrans } from "@/locales"
import { useGameStoreOutside } from "@/pinia/stores/game"
import { getGameDataApi } from "../game"

import { getUsedPriceOf } from "../price"
import { handlePage, handlePush, handleSearch, handleSort } from "../utils"

const { t } = locales.global

const LS_KEY = "mk_enhposest_v2"

function loadCache(marketTs: number): WorkflowCalculator[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || !Array.isArray(p.list) || p.ts !== marketTs) return null
    console.log("[SUPER] 缓存命中 " + p.list.length + " 条, age=" + ((Date.now() - p.savedAt)/60000).toFixed(0) + "m")
    return p.list
  } catch (e) { return null }
}

function _loadAnyCache(): WorkflowCalculator[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return Array.isArray(p.list) ? p.list : null
  } catch (e) { return null }
}

function saveCache(list: WorkflowCalculator[], marketTs: number) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ts: marketTs, savedAt: Date.now(), list })) } catch (e) {}
}

/** 查 */
export async function getEnhanposestDataApi(params: any) {
  let profitList: WorkflowCalculator[] = []
  const marketTs = useGameStoreOutside().marketData?.timestamp ?? 0

  // 1. localStorage 优先
  const cached = loadCache(marketTs)
  if (cached) {
    profitList = cached
    useGameStoreOutside().setJungleCache(profitList, "enhanposest")
  } else {
    // 2. Pinia 内存缓存
    const mem = useGameStoreOutside().getJungleCache("enhanposest")
    if (mem && mem.length > 0) {
      profitList = mem
    } else {
      // 3. 市场变了, 先用旧数据显示（价格不准但结构可用）, 后台算新数据
      const oldCache = _loadAnyCache()
      if (oldCache && oldCache.length > 0) {
        console.log("[SUPER] 先用旧缓存 " + oldCache.length + " 条, 后台更新中...")
        profitList = oldCache
        useGameStoreOutside().setJungleCache(profitList, "enhanposest")
        // 异步重算
        setTimeout(function() {
          var newList: WorkflowCalculator[] = []
          try { newList = calcEnhanceProfit() } catch(e) { console.error(e) }
          if (newList.length > 0) {
            useGameStoreOutside().setJungleCache(newList, "enhanposest")
            saveCache(newList, marketTs)
            console.log("[SUPER] 后台更新完成 " + newList.length + " 条")
          }
        }, 500)
      } else {
        // 无缓存, 必须同步算
        console.log("[SUPER] 首次计算...")
        await new Promise(resolve => setTimeout(resolve, 300))
        const startTime = Date.now()
        try { profitList = profitList.concat(calcEnhanceProfit()) } catch (e: any) { console.error(e) }
        console.log("[SUPER] 计算完成 " + profitList.length + " 条, " + ((Date.now()-startTime)/1000).toFixed(1) + "s")
        useGameStoreOutside().setJungleCache(profitList, "enhanposest")
        saveCache(profitList, marketTs)
      }
    }
  }

  profitList = profitList.filter(item => {
    const eh = (item.calculator as DecomposeCalculator)?.enhanceLevel
    if (params.maxLevel && eh != null && eh > params.maxLevel) return false
    if (params.minLevel && eh != null && eh < params.minLevel) return false
    return true
  })

  return handlePage(handleSort(handleSearch(profitList, params), params), params)
}

function calcEnhanceProfit() {
  const gameData = getGameDataApi()
  const list = Object.values(gameData.itemDetailMap)
  const profitList: WorkflowCalculator[] = []
  const escapeLevels = [-1, 0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
  const originLevels = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
  const targetLevels = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

  var itemsWithCosts = 0, pushedTotal = 0

  list.filter(function(item: any) { return item.enhancementCosts }).forEach(function(item: any) {
    itemsWithCosts++
    for (var _ti = targetLevels.length - 1; _ti >= 0; _ti--) {
      var enhanceLevel = targetLevels[_ti]
      var bestProfit = -Infinity
      var bestCal: WorkflowCalculator | undefined

      for (var oi = 0; oi < originLevels.length; oi++) {
        var originLevel = originLevels[oi]
        if (getUsedPriceOf(item.hrid, originLevel, "ask") === -1) continue

        for (var ei = 0; ei < escapeLevels.length; ei++) {
          var escapeLevel = escapeLevels[ei]
          if (originLevel >= enhanceLevel || escapeLevel >= originLevel) continue

          // 缓存 protectLevel 循环内的 enhancer（仅 depend on enhanceLevel+protectLevel，不依赖 catalyst）
          for (var protectLevel = (enhanceLevel > 2 ? 2 : enhanceLevel); protectLevel <= enhanceLevel; protectLevel++) {
            var enhancer = new EnhanceCalculator({ enhanceLevel: enhanceLevel, escapeLevel: escapeLevel, originLevel: originLevel, protectLevel: protectLevel, hrid: item.hrid })
            if (!enhancer.available || !enhancer.profitable) continue

            // 同一个 enhancer 复用于 3 种 catalyst
            for (var catalystRank = 0; catalystRank <= 2; catalystRank++) {
              var c = new WorkflowCalculator([
                getStorageCalculatorItem(enhancer),
                getStorageCalculatorItem(new DecomposeCalculator({ enhanceLevel: enhanceLevel, hrid: item.hrid, catalystRank: catalystRank }))
              ], "+" + originLevel + " " + getTrans("→") + " +" + enhanceLevel)

              c.run()

              if (c.result.profitPH > bestProfit) {
                bestProfit = c.result.profitPH
                bestCal = c
              }
            }
          }
        }
      }

      if (bestCal) { handlePush(profitList, bestCal); pushedTotal++ }
    }
  })

  console.log("[SUPER] 物品:" + itemsWithCosts + " 推送:" + pushedTotal + " 最终:" + profitList.length)
  return profitList
}
