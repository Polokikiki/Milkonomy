import { DecomposeCalculator } from "@/calculator/alchemy"

import locales from "@/locales"
import { useGameStoreOutside } from "@/pinia/stores/game"
import { getGameDataApi } from "../game"
import { getUsedPriceOf } from "../price"
import { handlePage, handlePush, handleSearch, handleSort } from "../utils"

const { t } = locales.global
/** 查 */
export async function getDataApi(params: any) {
  let profitList: DecomposeCalculator[] = []
  if (useGameStoreOutside().getDecomposeCache()) {
    profitList = useGameStoreOutside().getDecomposeCache()
  } else {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startTime = Date.now()
    try {
      profitList = profitList.concat(calcProfit())
    } catch (e: any) {
      console.error(e)
    }
    useGameStoreOutside().setDecomposeCache(profitList)
    ElMessage.success(t("计算完成，耗时{0}秒", [(Date.now() - startTime) / 1000]))
  }

  return handlePage(handleSort(handleSearch(profitList, params), params), params)
}

function calcProfit() {
  const gameData = getGameDataApi()
  // 所有物品列表
  const list = Object.values(gameData.itemDetailMap)
  const profitList: DecomposeCalculator[] = []
  list.filter(item => item.enhancementCosts).forEach((item) => {
    for (let enhanceLevel = 1; enhanceLevel <= 20; enhanceLevel++) {
      if (getUsedPriceOf(item.hrid, enhanceLevel, "ask") === -1) {
        continue
      }
      let bestProfit = -Infinity
      let bestCal: DecomposeCalculator | undefined
      for (let catalystRank = 0; catalystRank <= 2; ++catalystRank) {
        const c = new DecomposeCalculator({ hrid: item.hrid, enhanceLevel, catalystRank })
        if (!c.available) continue
        c.run()
        if (c.result.profitPH > bestProfit) {
          bestProfit = c.result.profitPH
          bestCal = c
        }
      }
      bestCal && handlePush(profitList, bestCal)
    }
  })
  return profitList
}
