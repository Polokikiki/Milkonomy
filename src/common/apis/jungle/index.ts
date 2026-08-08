import type { Action } from "~/game"
import { EnhanceCalculator } from "@/calculator/enhance"
import { ManufactureCalculator } from "@/calculator/manufacture"
import { getStorageCalculatorItem } from "@/calculator/utils"
import { WorkflowCalculator } from "@/calculator/workflow"
import { getEquipmentTypeOf } from "@/common/utils/game"

import locales, { getTrans } from "@/locales"
import { useGameStoreOutside } from "@/pinia/stores/game"
import { getGameDataApi } from "../game"
import { getUsedPriceOf } from "../price"
import { handlePage, handlePush, handleSearch, handleSort } from "../utils"

const { t } = locales.global
/** 查 */
export async function getDataApi(params: any, cacheKey?: string) {
  cacheKey = cacheKey || `jungle-buy${useGameStoreOutside().buyStatus}-sell${useGameStoreOutside().sellStatus}`
  let profitList: WorkflowCalculator[] = []
  if (useGameStoreOutside().getJungleCache(cacheKey)) {
    profitList = useGameStoreOutside().getJungleCache(cacheKey)
  } else {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startTime = Date.now()
    try {
      profitList = profitList.concat(await calcEnhanceProfit())
    } catch (e: any) {
      console.error(e)
    }
    useGameStoreOutside().setJungleCache(profitList, cacheKey)
    ElMessage.success(t("计算完成，耗时{0}秒", [(Date.now() - startTime) / 1000]))
  }

  const _activeExact = (params.exactLevelValues || []).filter((v: any, i: number) => (params.exactLevelActive || [])[i] && v !== null && v !== undefined && v !== "").map(Number)
  if (_activeExact.length > 0) {
    profitList = profitList.filter(item => _activeExact.includes(item.calculator.enhanceLevel))
  } else {
    profitList = profitList.filter(item => params.maxLevel ? item.calculator.enhanceLevel <= params.maxLevel : true)
    profitList = profitList.filter(item => params.minLevel ? item.calculator.enhanceLevel >= params.minLevel : true)
  }
  profitList = profitList.filter(item => params.minSellPrice ? item.calculator.productListWithPrice[0].price >= params.minSellPrice * 1e6 : true)
  profitList = profitList.filter(item => params.maxSellPrice ? item.calculator.productListWithPrice[0].price <= params.maxSellPrice * 1e6 : true)

  const hasMinItemLevel = params.minItemLevel !== undefined && params.minItemLevel !== null && params.minItemLevel !== ""
  const hasMaxItemLevel = params.maxItemLevel !== undefined && params.maxItemLevel !== null && params.maxItemLevel !== ""
  profitList = profitList.filter(item => hasMinItemLevel ? (item.calculator.item.itemLevel >= Number(params.minItemLevel)) : true)
  profitList = profitList.filter(item => hasMaxItemLevel ? (item.calculator.item.itemLevel <= Number(params.maxItemLevel)) : true)

  if (params.bestManufacture) {
    const maxProfitMap: Record<string, WorkflowCalculator> = {}
    profitList.forEach((item) => {
      const key = `${item.calculator.hrid}-${item.calculator.enhanceLevel}`
      if (!maxProfitMap[key] || maxProfitMap[key].result.profitPH < item.result.profitPH) {
        maxProfitMap[key] = item
      }
    })
    profitList = Object.values(maxProfitMap)
  }

  return handlePage(handleSort(handleSearch(profitList, params), params), params)
}

async function calcEnhanceProfit() {
  const gameData = getGameDataApi()
  // 所有物品列表
  const validItems = Object.values(gameData.itemDetailMap).filter(item => item.enhancementCosts)
  const profitList: WorkflowCalculator[] = []

  for (const item of validItems) {
    for (let enhanceLevel = 1; enhanceLevel <= 20; enhanceLevel++) {
      if (getUsedPriceOf(item.hrid, enhanceLevel, "bid") === -1) {
        continue
      }

      let bestProfit = -Infinity
      let bestCal: WorkflowCalculator | undefined

      let bestProfitStep0 = -Infinity
      let bestCalStep0: EnhanceCalculator | undefined

      // 为支持更多步数的工作流，使用数组存储各步数的最佳结果
      const bestMultiStepProfits: number[] = []
      const bestMultiStepCals: (WorkflowCalculator | undefined)[] = []
      const maxSteps = getEquipmentTypeOf(item) === "charm" ? 7 : 2
      for (let i = 0; i <= maxSteps; i++) {
        bestMultiStepProfits[i] = -Infinity
        bestMultiStepCals[i] = undefined
      }

      for (let protectLevel = (enhanceLevel > 2 ? 2 : enhanceLevel); protectLevel <= enhanceLevel; protectLevel++) {
        const enhancer = new EnhanceCalculator({ enhanceLevel, protectLevel, hrid: item.hrid })
        const projects: [string, Action][] = [
          [getTrans("锻造"), "cheesesmithing"],
          [getTrans("制造"), "crafting"],
          [getTrans("裁缝"), "tailoring"]
        ]
        for (const [projectLast, actionLast] of projects) {
          for (const [project, action] of projects) {
            const manual = new ManufactureCalculator({ hrid: item.hrid, project, action })

            if (!enhancer.available) {
              continue
            }

            enhancer.run()
            if (enhancer.result.profitPH > bestProfitStep0) {
              bestProfitStep0 = enhancer.result.profitPH
              bestCalStep0 = enhancer
            }

            if (!manual.available) {
              continue
            }

            // protectLevel = enhanceLevel 时表示不用垫子
            const c = new WorkflowCalculator([
              getStorageCalculatorItem(manual),
              getStorageCalculatorItem(enhancer)
            ], `${project} → ${getTrans("强化")}+${enhanceLevel}`)

            c.run()

            // 循环构建多步工作流
            const multiStepWorkflows: WorkflowCalculator[] = []
            let currentManual = manual
            const manualChain: ManufactureCalculator[] = [manual]
            let stepCount = 1

            // 继续添加步骤，只要还有 upgradeItemHrid 且未达到最大步数
            while (currentManual.actionItem?.upgradeItemHrid && stepCount < maxSteps) {
              const nextManual = new ManufactureCalculator({
                hrid: currentManual.actionItem.upgradeItemHrid,
                project: projectLast,
                action: actionLast
              })

              if (!nextManual.available) {
                break
              }

              manualChain.unshift(nextManual) // 在开头添加，因为我们需要反向构建
              stepCount++

              // 创建当前步数的工作流
              const stepItems = [
                ...manualChain.map(m => getStorageCalculatorItem(m)),
                getStorageCalculatorItem(enhancer)
              ]

              const cStep = new WorkflowCalculator(
                stepItems,
                `${stepCount}${getTrans("步")}${project} → ${getTrans("强化")}+${enhanceLevel}`
              )
              cStep.run()
              multiStepWorkflows.push(cStep)

              currentManual = nextManual
            }

            if (c.result.profitPH > bestProfit) {
              bestProfit = c.result.profitPH
              bestCal = c
            }

            // 处理多步工作流的最佳结果
            multiStepWorkflows.forEach((workflow) => {
              const steps = workflow.calculatorList.length - 1 // 减去enhancer的1步
              if (steps >= 2 && steps <= maxSteps) {
                if (workflow.result.profitPH > bestMultiStepProfits[steps]) {
                  bestMultiStepProfits[steps] = workflow.result.profitPH
                  bestMultiStepCals[steps] = workflow
                }
              }
            })
          }
        }
      }
      // 只取最优的保护情况
      bestCal && handlePush(profitList, bestCal)
      bestCalStep0 && handlePush(profitList, bestCalStep0)

      // 添加所有多步工作流的最佳结果（2步及以上）
      for (let i = 2; i <= maxSteps; i++) {
        const bestCal = bestMultiStepCals[i]
        bestCal && handlePush(profitList, bestCal)
      }
    }
  }

  return profitList
}
