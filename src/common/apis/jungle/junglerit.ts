import type { Action } from "~/game"
import { EnhanceCalculator } from "@/calculator/enhance"

import { ManufactureCalculator } from "@/calculator/manufacture"
import { getStorageCalculatorItem } from "@/calculator/utils"
import { WorkflowCalculator } from "@/calculator/workflow"
import { getEquipmentTypeOf, isRefined } from "@/common/utils/game"
import locales, { getTrans } from "@/locales"
import { useGameStoreOutside } from "@/pinia/stores/game"
import { getGameDataApi } from "../game"
import { getUsedPriceOf } from "../price"
import { handlePage, handlePush, handleSearch, handleSort } from "../utils"

const { t } = locales.global
/** 查 */
export async function getDataApi(params: any) {
  let profitList: WorkflowCalculator[] = []
  if (useGameStoreOutside().getJungleCache("junglerit")) {
    profitList = useGameStoreOutside().getJungleCache("junglerit")
  } else {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startTime = Date.now()
    try {
      profitList = profitList.concat(calcEnhanceProfit(params))
    } catch (e: any) {
      console.error(e)
    }
    useGameStoreOutside().setJungleCache(profitList, "junglerit")
    ElMessage.success(t("计算完成，耗时{0}秒", [(Date.now() - startTime) / 1000]))
  }

  const _activeExact = (params.exactLevelValues || []).filter((v: any, i: number) => (params.exactLevelActive || [])[i] && v !== null && v !== undefined && v !== "").map(Number)
  if (_activeExact.length > 0) {
    profitList = profitList.filter(item => _activeExact.includes(item.calculator.enhanceLevel))
  } else {
    profitList = profitList.filter(item => params.maxLevel ? item.calculator.enhanceLevel <= params.maxLevel : true)
    profitList = profitList.filter(item => params.minLevel ? item.calculator.enhanceLevel >= params.minLevel : true)
  }
  return handlePage(handleSort(handleSearch(profitList, params), params), params)
}

function calcEnhanceProfit(params: any) {
  const gameData = getGameDataApi()
  // 所有物品列表
  const list = Object.values(gameData.itemDetailMap)
  const profitList: WorkflowCalculator[] = []
  let escapeLevels = Array.from({ length: 20 }, (_, i) => i)
  if (params.noEscape) {
    escapeLevels = [-1]
  }
  list.filter(item => item.enhancementCosts)
    .filter(item => !isRefined(item))
    .filter(item => getEquipmentTypeOf(item) === "charm" || item.itemLevel >= 90)
    .forEach((item) => {
      for (let inheritOrgLvl = 1; inheritOrgLvl <= 20; inheritOrgLvl++) {
        const projects: [string, Action][] = [
          [getTrans("锻造"), "cheesesmithing"],
          [getTrans("制造"), "crafting"],
          [getTrans("裁缝"), "tailoring"]
        ]
        for (const [project, action] of projects) {
          const mc = new ManufactureCalculator({ hrid: item.hrid, project, action, originLevel: inheritOrgLvl })
          const actionItem = mc.actionItem
          if (!actionItem?.upgradeItemHrid) {
            continue
          }
          if (getUsedPriceOf(actionItem.upgradeItemHrid, inheritOrgLvl, "ask") === -1) {
            continue
          }

          const originLevel = Math.floor(mc.targetLevel)

          for (let enhanceLevel = originLevel + 1; enhanceLevel <= 20; ++enhanceLevel) {
            if (getUsedPriceOf(item.hrid, enhanceLevel, "bid") === -1) {
              continue
            }

            let bestProfit = -Infinity
            let bestCal: WorkflowCalculator | undefined

            for (const escapeLevel of escapeLevels) {
              if (originLevel >= enhanceLevel || escapeLevel >= originLevel) {
                continue
              }
              for (let protectLevel = Math.max(2, escapeLevel + 1); protectLevel <= enhanceLevel; protectLevel++) {
                const ec = new EnhanceCalculator({ originLevel, enhanceLevel, protectLevel, hrid: item.hrid, escapeLevel })
                let ecUp: EnhanceCalculator | undefined
                if (!ec.available) {
                  continue
                }
                if (mc.targetLevel % 1 > 0) {
                  ecUp = new EnhanceCalculator({ originLevel: originLevel + 1, enhanceLevel, protectLevel, hrid: item.hrid, escapeLevel })
                  if (originLevel + 1 === enhanceLevel) {
                    ecUp = undefined
                  } else if (!ecUp.available) {
                    continue
                  }
                }
                const c = new WorkflowCalculator([
                  getStorageCalculatorItem(mc),
                  ecUp
                    ? [getStorageCalculatorItem(ec), getStorageCalculatorItem(ecUp)]
                    : getStorageCalculatorItem(ec)
                ], `${project}+${inheritOrgLvl} ${getTrans("强化")}+${enhanceLevel}`)

                c.run()

                if (c.result.profitPH > bestProfit) {
                  bestProfit = c.result.profitPH
                  bestCal = c
                }
              }
            }
            // 只取最优的保护情况
            bestCal && handlePush(profitList, bestCal)
          }
        }
      }
    })
  return profitList
}
