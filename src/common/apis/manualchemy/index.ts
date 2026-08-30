import type * as Leaderboard from "../leaderboard/type"

import type Calculator from "@/calculator"
import type { StorageCalculatorItem } from "@/pinia/stores/favorite"
import type { Action, ItemDetail } from "~/game"
import { CoinifyCalculator, DecomposeCalculator, TransmuteCalculator } from "@/calculator/alchemy"
import { ManufactureCalculator } from "@/calculator/manufacture"
import { getStorageCalculatorItem } from "@/calculator/utils"
import { WorkflowCalculator } from "@/calculator/workflow"
import locales, { getTrans } from "@/locales"
import { useGameStoreOutside } from "@/pinia/stores/game"
import { getGameDataApi } from "../game"
import { handlePage, handlePush, handleSearch, handleSort } from "../utils"

const { t } = locales.global
/** 查 */
export async function getLeaderboardDataApi(params: Leaderboard.RequestData) {
  let profitList: Calculator[] = []
  if (useGameStoreOutside().getManualchemyCache()) {
    profitList = useGameStoreOutside().getManualchemyCache()
  } else {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startTime = Date.now()
    try {
      profitList = profitList.concat(calcAllFlowProfit())
    } catch (e: any) {
      console.error(e)
    }

    useGameStoreOutside().setManualchemyCache(profitList)
    ElMessage.success(t("计算完成，耗时{0}秒", [(Date.now() - startTime) / 1000]))
  }
  return handlePage(handleSort(handleSearch(profitList, params), params), params)
}

function calcAllFlowProfit() {
  const gameData = getGameDataApi()
  // 所有物品列表
  const list = Object.values(gameData.itemDetailMap)
  const profitList: Calculator[] = []
  const projects: [string, Action][] = [
    [getTrans("锻造"), "cheesesmithing"],
    [getTrans("制造"), "crafting"],
    [getTrans("裁缝"), "tailoring"],
    [getTrans("烹饪"), "cooking"],
    [getTrans("冲泡"), "brewing"]
  ]

  // t提前映射，加快运算速度
  const tMap = new Map<string, string>()

  function getT(key: string, args: (string | number)[] = []) {
    const mapKey = [key, ...args].join(",")
    if (tMap.has(mapKey)) {
      return tMap.get(mapKey)!
    }
    const value = t(key, args)
    tMap.set(mapKey, value)
    return value
  }

  list.forEach((item) => {
    for (const [project, action] of projects) {
      const configs: StorageCalculatorItem[] = []
      let c = new ManufactureCalculator({ hrid: item.hrid, project, action })
      let actionItem = c.actionItem

      while (actionItem?.upgradeItemHrid) {
        configs.unshift(getStorageCalculatorItem(c))

        if (configs.length >= 1) {
          let projectName = getT("{0}步{1}", [configs.length, project])
          const otherProject = configs.find(conf => conf.project !== project)
          otherProject && (projectName += getT("({0})", [otherProject!.project!]))
          // handlePush(profitList, new WorkflowCalculator(configs, projectName))
          calcManualchemyProfit({
            item,
            projectName,
            configs,
            profitList
          })
        }

        // D4更新后，会出现多步动作中出现不同Action组合的情况
        for (const [project, action] of projects) {
          c = new ManufactureCalculator({ hrid: actionItem.upgradeItemHrid, project, action })
          if (c.actionItem) {
            break
          }
        }

        actionItem = c.actionItem
      }
      configs.unshift(getStorageCalculatorItem(c))

      let projectName = getT("{0}步{1}", [configs.length, project])
      const otherProject = configs.find(conf => conf.project !== project)
      otherProject && (projectName += getT("({0})", [otherProject!.project!]))
      // handlePush(profitList, new WorkflowCalculator(configs, projectName))

      calcManualchemyProfit({
        item,
        projectName,
        configs,
        profitList
      })
    }
  })
  return profitList
}

function calcManualchemyProfit({
  item,
  projectName,
  configs,
  profitList
}: {
  item: ItemDetail
  projectName?: string
  configs: StorageCalculatorItem[]
  profitList: Calculator[]
}) {
  const cList = []
  for (let catalystRank = 0; catalystRank <= 2; catalystRank++) {
    cList.push(new TransmuteCalculator({
      hrid: item.hrid,
      catalystRank
    }))
    cList.push(new DecomposeCalculator({
      hrid: item.hrid,
      catalystRank
    }))
    cList.push(new CoinifyCalculator({
      hrid: item.hrid,
      catalystRank
    }))
  }
  for (const c of cList) {
    const alcheConfig = getStorageCalculatorItem(c)
    handlePush(profitList, new WorkflowCalculator([...configs, alcheConfig], `${projectName}-${c.project}`))
  }
}
