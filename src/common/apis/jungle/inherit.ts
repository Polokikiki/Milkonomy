import type { Action } from "~/game"
import { ManufactureCalculator } from "@/calculator/manufacture"
import locales, { getTrans } from "@/locales"

import { useGameStoreOutside } from "@/pinia/stores/game"
import { getGameDataApi } from "../game"
import { getUsedPriceOf } from "../price"
import { handlePage, handlePush, handleSearch, handleSort } from "../utils"

const { t } = locales.global
/** 查 */
export async function getDataApi(params: any) {
  let profitList: ManufactureCalculator[] = []
  if (useGameStoreOutside().getInheritCache()) {
    profitList = useGameStoreOutside().getInheritCache()
  } else {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startTime = Date.now()
    try {
      profitList = profitList.concat(calcProfit())
    } catch (e: any) {
      console.error(e)
    }
    useGameStoreOutside().setInheritCache(profitList)
    ElMessage.success(t("计算完成，耗时{0}秒", [(Date.now() - startTime) / 1000]))
  }

  profitList = profitList.filter(item => params.maxLevel ? item.originLevel <= params.maxLevel : true)
  profitList = profitList.filter(item => params.minLevel ? item.originLevel >= params.minLevel : true)

  return handlePage(handleSort(handleSearch(profitList, params), params), params)
}

function calcProfit() {
  const gameData = getGameDataApi()
  // 所有物品列表
  const list = Object.values(gameData.itemDetailMap)
  const profitList: ManufactureCalculator[] = []
  list.filter(item => item.enhancementCosts).forEach((item) => {
    for (let originLevel = 1; originLevel <= 20; originLevel++) {
      const projects: [string, Action][] = [
        [getTrans("锻造"), "cheesesmithing"],
        [getTrans("制造"), "crafting"],
        [getTrans("裁缝"), "tailoring"]
      ]
      for (const [project, action] of projects) {
        const c = new ManufactureCalculator({ hrid: item.hrid, project, action, originLevel })
        const actionItem = c.actionItem
        if (!actionItem?.upgradeItemHrid || actionItem.upgradeItemHrid === "/items/philosophers_stone") {
          continue
        }
        if (getUsedPriceOf(actionItem.upgradeItemHrid, originLevel, "ask") === -1) {
          continue
        }
        if (getUsedPriceOf(item.hrid, Math.floor(c.targetLevel), "bid") === -1) {
          continue
        }
        handlePush(profitList, c)
      }
    }
  })
  return profitList
}
