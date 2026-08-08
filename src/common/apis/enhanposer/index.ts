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
export async function getEnhanposerDataApi(params: any) {
  let profitList: WorkflowCalculator[] = []

  const cached = useGameStoreOutside().getEnhanposerCache()
  if (cached && cached.length > 0) {
    profitList = cached
  } else {
    const marketTs = useGameStoreOutside().marketData?.timestamp
    let restored = false
    if (marketTs) {
      try {
        const tsKey = "mk_enhanposer_ts"
        const cacheKey = "mk_enhanposer_data"
        const cachedTs = localStorage.getItem(tsKey)
        const raw = localStorage.getItem(cacheKey)
        if (cachedTs && Number(cachedTs) === marketTs && raw) {
          profitList = JSON.parse(raw)
          if (Array.isArray(profitList) && profitList.length > 0) {
            useGameStoreOutside().setEnhanposerCache(profitList)
            restored = true
          }
        }
      } catch (e) {}
    }
    if (!restored) {
      await new Promise(resolve => setTimeout(resolve, 300))
      const startTime = Date.now()
      try {
        profitList = profitList.concat(calcEnhanceProfit())
      } catch (e: any) {
        console.error(e)
      }
      useGameStoreOutside().setEnhanposerCache(profitList)
      if (marketTs && profitList.length > 0) {
        try {
          localStorage.setItem("mk_enhanposer_ts", String(marketTs))
          localStorage.setItem("mk_enhanposer_data", JSON.stringify(profitList))
        } catch (e) {}
      }
      ElMessage.success(t("计算完成，耗时{0}秒", [(Date.now() - startTime) / 1000]))
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

  list.filter(function(item: any) { return item.enhancementCosts }).forEach(function(item: any) {
    // 找第一个有卖价的等级作为买入等级
    let baseLevel = 0
    for (let lv = 1; lv <= 5; lv++) {
      if (getUsedPriceOf(item.hrid, lv, "ask") !== -1) { baseLevel = lv; break }
    }
    if (baseLevel === 0 && getUsedPriceOf(item.hrid, 0, "ask") === -1) {
      return
    }

    // 从 baseLevel+1 开始：买入Lv5只能强化到Lv6+
    for (let enhanceLevel = baseLevel + 1; enhanceLevel <= 20; enhanceLevel++) {
      if (getUsedPriceOf(item.hrid, baseLevel, "ask") === -1) {
        continue
      }

      let bestProfit = -Infinity
      let bestCal: WorkflowCalculator | undefined
      for (let protectLevel = (enhanceLevel > 2 ? 2 : enhanceLevel); protectLevel <= enhanceLevel; protectLevel++) {
        const enhancer = new EnhanceCalculator({ enhanceLevel, protectLevel, originLevel: baseLevel, hrid: item.hrid })
        for (let catalystRank = 0; catalystRank <= 2; catalystRank++) {
          if (!useGameStoreOutside().checkSecret() && item.itemLevel > 1) {
            continue
          }

          const decomposer = new DecomposeCalculator({ enhanceLevel, hrid: item.hrid, catalystRank })
          if (!decomposer.available) {
            continue
          }

          if (!enhancer.profitable) {
            continue
          }

          const c = new WorkflowCalculator([
            getStorageCalculatorItem(enhancer),
            getStorageCalculatorItem(decomposer)
          ], getTrans("强化分解") + "+" + enhanceLevel)

          c.run()

          if (c.result.profitPH > bestProfit) {
            bestProfit = c.result.profitPH
            bestCal = c
          }
        }
      }
      bestCal && handlePush(profitList, bestCal)
    }
  })

  return profitList
}
