import { EnhanceCalculator } from "@/calculator/enhance"
import locales from "@/locales"

import { useGameStoreOutside } from "@/pinia/stores/game"
import { getGameDataApi } from "../game"
import { getUsedPriceOf } from "../price"
import { handlePage, handlePush, handleSearch, handleSort } from "../utils"

const { t } = locales.global
/** 查 */
export async function getDataApi(params: any) {
  let profitList: EnhanceCalculator[] = []
  const junglestKey = `${useGameStoreOutside().marketData!.timestamp}-buy${useGameStoreOutside().buyStatus}-sell${useGameStoreOutside().sellStatus}`
  if (useGameStoreOutside().getJunglestCacheByKey(junglestKey)) {
    profitList = useGameStoreOutside().getJunglestCacheByKey(junglestKey)
  } else {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startTime = Date.now()
    try {
      profitList = profitList.concat(calcSuperEnhanceProfit())
    } catch (e: any) {
      console.error(e)
    }
    useGameStoreOutside().setJunglestCacheByKey(profitList, junglestKey)
    ElMessage.success(t("计算完成，耗时{0}秒", [(Date.now() - startTime) / 1000]))
  }

  const _activeExact = (params.exactLevelValues || []).filter((v: any, i: number) => (params.exactLevelActive || [])[i] && v !== null && v !== undefined && v !== "").map(Number)
  if (_activeExact.length > 0) {
    profitList = profitList.filter(item => _activeExact.includes(item.enhanceLevel))
  } else {
    profitList = profitList.filter(item => params.maxLevel ? item.enhanceLevel <= params.maxLevel : true)
    profitList = profitList.filter(item => params.minLevel ? item.enhanceLevel >= params.minLevel : true)
  }
  profitList = profitList.filter(item => params.maxOriginLevel ? item.originLevel <= params.maxOriginLevel : true)
  profitList = profitList.filter(item => params.minOriginLevel ? item.originLevel >= params.minOriginLevel : true)
  profitList = profitList.filter(item => params.minSellPrice ? item.productListWithPrice[0].price >= params.minSellPrice * 1e6 : true)

  const hasMinItemLevel = params.minItemLevel !== undefined && params.minItemLevel !== null && params.minItemLevel !== ""
  const hasMaxItemLevel = params.maxItemLevel !== undefined && params.maxItemLevel !== null && params.maxItemLevel !== ""
  profitList = profitList.filter(item => hasMinItemLevel ? (item.item.itemLevel >= Number(params.minItemLevel)) : true)
  profitList = profitList.filter(item => hasMaxItemLevel ? (item.item.itemLevel <= Number(params.maxItemLevel)) : true)

  return handlePage(handleSort(handleSearch(profitList, params), params), params)
}

export function calcSuperEnhanceProfit() {
  const gameData = getGameDataApi()
  // 所有物品列表
  const list = Object.values(gameData.itemDetailMap)
  const profitList: EnhanceCalculator[] = []

  const escapeLevels = [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
  const originLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
  const targetLevels = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

  // const escapeLevels = Array.from({ length: 20 }, (_, i) => i)
  // const originLevels = Array.from({ length: 20 }, (_, i) => i)
  // const targetLevels = Array.from({ length: 20 }, (_, i) => i)

  list.filter(item => item.enhancementCosts).forEach((item) => {
    for (const enhanceLevel of targetLevels) {
      if (getUsedPriceOf(item.hrid, enhanceLevel, "bid") === -1) {
        continue
      }

      let bestProfit = -Infinity
      let bestCal: EnhanceCalculator | undefined

      for (const originLevel of originLevels) {
        if (getUsedPriceOf(item.hrid, originLevel, "ask") === -1) {
          continue
        }
        for (const escapeLevel of escapeLevels) {
          if (originLevel >= enhanceLevel || escapeLevel >= originLevel) {
            continue
          }
          for (let protectLevel = Math.max(2, escapeLevel + 1); protectLevel <= enhanceLevel; protectLevel++) {
            const c = new EnhanceCalculator({ originLevel, enhanceLevel, protectLevel, hrid: item.hrid, escapeLevel, project: `+${originLevel} → +${enhanceLevel}` })
            if (!c.available) {
              continue
            }
            c.run()

            if (c.result.profitPH > bestProfit) {
              bestProfit = c.result.profitPH
              bestCal = c
            }
          }
        }
      }
      // 只取最优的保护情况
      bestCal && handlePush(profitList, bestCal)
    }
  })
  return profitList
}
