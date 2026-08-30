import type * as Leaderboard from "./type"

import type Calculator from "@/calculator"
import type { Action } from "~/game"
import { CoinifyCalculator, DecomposeCalculator, TransmuteCalculator } from "@/calculator/alchemy"
import { GatherCalculator } from "@/calculator/gather"
import { ManufactureCalculator } from "@/calculator/manufacture"
import { getStorageCalculatorItem } from "@/calculator/utils"
import { WorkflowCalculator } from "@/calculator/workflow"
import locales, { getTrans } from "@/locales"
import { SHOP_FIXED_PRICES } from "@/common/config"
import { type StorageCalculatorItem, useFavoriteStoreOutside } from "@/pinia/stores/favorite"
import { useGameStoreOutside } from "@/pinia/stores/game"
import { getGameDataApi } from "../game"
import { isShopTier, normalizeProject, parseTierLevel, TIER_CHAINS } from "./tierChains"
import { getEquipmentTypeOf } from "@/common/utils/game"
import { SELL_TAX_FACTOR, NO_TAX_FACTOR } from "@/common/constants/market"
import { handlePage, handlePush, handleSearch, handleSort, handleVolume1hSearch } from "../utils"

const { t } = locales.global
/** 查 */
export async function getLeaderboardDataApi(params: Leaderboard.RequestData) {
  // 数据未就绪时返回空
  const marketData = useGameStoreOutside().marketData
  if (!marketData) return { list: [], total: 0 } as any
  const includeTax = params.includeTax !== false
  const sellTaxFactor = includeTax ? SELL_TAX_FACTOR : NO_TAX_FACTOR
  const crossStepBalance = params.crossStepBalance === true

  let profitList: Calculator[] = []
  const cacheKey = `${useGameStoreOutside().marketData!.timestamp}-${includeTax ? "tax" : "noTax"}-${crossStepBalance ? "csb" : "noCsb"}-buy${useGameStoreOutside().buyStatus}-sell${useGameStoreOutside().sellStatus}`
  const cached = useGameStoreOutside().getLeaderboardCache(cacheKey)
  if (cached && cached.length > 0) {
    profitList = cached
  } else {
    await new Promise(resolve => setTimeout(resolve, 100))
    const startTime = Date.now()
    let hasError = false
    try {
      profitList = calcProfit(sellTaxFactor)
      profitList = profitList.concat(calcAllFlowProfit(sellTaxFactor, crossStepBalance))
    } catch (e: any) {
      hasError = true
      console.error(e)
    }

    if (profitList.length > 0) {
      useGameStoreOutside().setLeaderBoardCache(profitList, cacheKey)
    } else {
      useGameStoreOutside().clearLeaderBoardCache(cacheKey)
    }

    if (hasError || profitList.length === 0) {
      ElMessage.error(t("计算失败或结果为空，请打开控制台查看错误"))
    } else {
      ElMessage.success(t("计算完成，耗时{0}秒", [(Date.now() - startTime) / 1000]))
    }
  }
  profitList.forEach(item => item.favorite = useFavoriteStoreOutside().hasFavorite(item))
  profitList = profitList.filter(item => item.actionLevel >= (params.actionLevel || 0))
  const hasMaxItemLevel = params.maxItemLevel !== undefined && params.maxItemLevel !== null
  if (hasMaxItemLevel) {
    const maxItemLevel = Number(params.maxItemLevel)
    profitList = profitList.filter((item) => {
      const itemLevel = item.item?.itemLevel
      return typeof itemLevel === "number" && itemLevel <= maxItemLevel
    })
  }
  profitList = handleVolume1hSearch(profitList, params)

  // 排除装备：仅当项目选中时生效，用装备类型判断而非 ingredientList
  if (params.banEquipment && params.project) {
    const normProject = normalizeProject(params.project || '')
    const skipProjects = ['冲泡', '烹饪', '挤奶', '采摘', '伐木', '点金', '分解', '转化', '炼金', '强化',
      'Brewing', 'Cooking', 'Milking', 'Foraging', 'Woodcutting', 'Coinify', 'Decompose', 'Transmute', 'Alchemy', 'Enhancing']
    if (!skipProjects.includes(normProject)) {
      profitList = profitList.filter((item: any) => {
        const calcList = item.calculatorList
        // 多步 workflow 保留
        if (Array.isArray(calcList) && calcList.length >= 1) return true
        // 物品本身是装备类型（body/legs/head/hands/feet/back/charm）→ 排除
        const eqType = item.item?.equipmentDetail?.type
        if (eqType) {
          const slot = (eqType as string).split('/').pop()
          const equipSlots = ['body', 'legs', 'head', 'hands', 'feet', 'back', 'charm']
          if (equipSlots.includes(slot!)) return false
        }
        return true
      })
    }
  }

  // 逐级制作 / 起始材质筛选（仅对 workflow 多步制作生效）
  const startTier = params.startTierLevel
  const endTier = params.endTierLevel
  const hasStartTier = startTier !== undefined && startTier !== null && startTier !== ""
  const hasEndTier = endTier !== undefined && endTier !== null && endTier !== ""
  // 材质链前缀（用于区分皮革/布料同等级的情况）
  let chainPrefixes: string[] = []
  if (params.tierChainKey && params.project) {
    const chainList = TIER_CHAINS[normalizeProject(params.project)] || []
    const chain = chainList.find(c => c.key === params.tierChainKey)
    if (chain) {
      chainPrefixes = chain.tiers.map(t => t.label)
      // 奶酪链特殊处理
      const extra: string[] = []
      for (const label of chainPrefixes) {
        const short = label.replace('奶酪', '')
        if (short && short !== label) extra.push(short)
      }
      chainPrefixes.push(...extra)
    }
  }
  if (hasStartTier || hasEndTier) {
    profitList = profitList.filter((item: any) => {
      const calcList = item.calculatorList
      // 单步项目：直接检查物品等级
      if (!Array.isArray(calcList) || calcList.length < 1) {
        const itemLevel = item.item?.itemLevel
        if (hasStartTier && itemLevel !== parseTierLevel(startTier)) return false
        if (hasEndTier && itemLevel !== parseTierLevel(endTier)) return false
        return true
      }
      // 多步项目：查找链路中第一个匹配起始材质的步骤
      const endLevel = item.item?.itemLevel
      if (hasStartTier) {
        const targetStartLevel = parseTierLevel(startTier)
        const found = calcList.some((cal: any) => {
          const c = Array.isArray(cal) ? cal[0] : cal
          return c?.item?.itemLevel === targetStartLevel
        })
        if (!found) return false
      }
      if (hasEndTier && endLevel !== parseTierLevel(endTier)) return false
      return true
    })
  }
  // 材质链前缀筛选（仅对 workflow 多步制作按产物名区分皮革/布料）
  if (chainPrefixes.length > 0) {
    profitList = profitList.filter((item: any) => {
      const il = item.ingredientListWithPrice || item.ingredientList || []
      // 有原料的就是单步制造（装备等），直接保留
      if (il.length > 0) return true
      const rawName: string = item.name || item.item?.name || ''
      const itemName: string = rawName.match(/^[一-龥]/) ? rawName : t(rawName)
      return chainPrefixes.some(p => itemName.startsWith(p))
    })
  }

  // 商店购买模式：起始材质的原料使用商店固定价格（SHOP_FIXED_PRICES）
  if (isShopTier(startTier)) {
    profitList = profitList.map((item: any) => {
      const ingrList = item.ingredientListWithPrice
      if (!Array.isArray(ingrList) || ingrList.length === 0) return item
      // 检查所有原料是否有商店固定价
      let shopPrice: number | undefined
      let targetIndex = -1
      for (let i = 0; i < ingrList.length; i++) {
        const hrid: string = ingrList[i].hrid || ''
        const price = SHOP_FIXED_PRICES[hrid]
        if (typeof price === 'number') { shopPrice = price; targetIndex = i; break }
      }
      if (shopPrice === undefined) return item

      const oldPrice = ingrList[targetIndex].price || 0
      const priceDelta = shopPrice - oldPrice
      if (priceDelta === 0) return item

      const newIngrList = ingrList.map((ing: any, i: number) => {
        if (i === targetIndex) return { ...ing, price: shopPrice }
        return ing
      })
      const countPH = ingrList[targetIndex].countPH || 1
      const profitDelta = -priceDelta * countPH
      const result = { ...item.result }
      result.profitPH = (result.profitPH || 0) + profitDelta
      result.profitPD = (result.profitPD || 0) + profitDelta * 24
      return { ...item, ingredientListWithPrice: newIngrList, result, hasManualPrice: true }
    })
  }

  // 材质链筛选：选了材质链就自动过滤，不用再勾纯净火车
  // 纯净火车：所有非催化剂原料必须来自该项目下的任一材质链等级
  if ((params.pureOnly || !!params.tierChainKey) && params.project) {
    const normProject = normalizeProject(params.project || '')
    const chainList = TIER_CHAINS[normProject]
    if (chainList) {
      // 先按项目/动作类型过滤，只保留该项目下的物品
      const projectActionMap: Record<string, string> = {
        '裁缝': 'tailoring', '锻造': 'cheesesmithing', '制造': 'crafting',
        '炼金': 'alchemy', '烹饪': 'cooking', '冲泡': 'brewing'
      }
      const projAction = projectActionMap[normProject]
      if (projAction) {
        profitList = profitList.filter((item: any) => item.action === projAction)
      }
      // 纯净火车：护符不走标准材质链，自动排除
      if (params.pureOnly) {
        profitList = profitList.filter((item: any) => {
          if (!item.item) return true
          const eqType = getEquipmentTypeOf(item.item)
          if (eqType === "charm") return false
          const name = item.item.name || ""
          if (name.includes("Beacon") || name.includes("探照灯")) return false
          if (name.includes("Torch") || name.includes("火把")) return false
          if (name.includes("Cape") || name.includes("Shroud") || name.includes("Cloak") || name.includes("斗篷") || name.includes("披风")) return false
          return true
        })
      }
      // 收集所有合法原料前缀：当前项目下所有链 + 制造板甲需要锻造链奶酪
      const allProjectLabels = new Set<string>()
      for (const chain of chainList) {
        for (const tier of chain.tiers) allProjectLabels.add(tier.label)
      }
      // 制造需要锻造链奶酪前缀（板甲 = 木材 + 奶酪）
      // 锻造需要制造链木材前缀（锤/枪 = 奶酪 + 原木）
      if (normProject === '制造' || normProject === '锻造') {
        const cheeseChain = TIER_CHAINS['锻造']
        if (cheeseChain) {
          for (const chain of cheeseChain) {
            for (const tier of chain.tiers) allProjectLabels.add(tier.label)
          }
        }
      }
      if (normProject === '制造' || normProject === '锻造') {
        const woodChain = TIER_CHAINS['制造']
        if (woodChain) {
          for (const chain of woodChain) {
            for (const tier of chain.tiers) allProjectLabels.add(tier.label)
          }
        }
      }

      const projectPrefixes = Array.from(allProjectLabels)

      // 选中链的档位标签（用于非纯纯净火车时至少一个匹配即可）
      let selectedLabels: string[]
      if (params.tierChainKey && chainList.length > 1) {
        const selChain = chainList.find(c => c.key === params.tierChainKey)
        selectedLabels = selChain?.tiers.map(t => t.label) || []
      } else {
        selectedLabels = chainList[0].tiers.map(t => t.label)
      }
      const selectedPrefixes = new Set<string>(selectedLabels)
      for (const label of selectedLabels) {
        for (const suffix of ['奶酪', '皮革', '布料']) {
          const short = label.replace(suffix, '')
          if (short && short !== label) selectedPrefixes.add(short)
        }
      }

      const gameData = getGameDataApi()
      const skipNames = new Set(['精通之油', '洞察之枝', '专精之线',
        'Butter Of Proficiency', 'Branch Of Insight', 'Thread Of Expertise'])

      profitList = profitList.filter((item: any) => {
        const ingrList = item.ingredientListWithPrice || item.ingredientList || []
        // 无原料列表：无法判断，保留
        if (ingrList.length === 0) return true

        // 收集配方中所有主原料（跳过催化和茶）
        const mainIngs: { hrid: string; name: string }[] = []
        for (const ing of ingrList) {
          const hrid: string = ing.hrid || ''
          const detail = gameData.itemDetailMap[hrid]
          if (!detail) continue
          const ingName: string = t(detail.name)
          if (skipNames.has(ingName) || skipNames.has(detail.name)) continue
          if (ingName.includes('茶')) continue
          mainIngs.push({ hrid, name: ingName })
        }
        // 全是催化剂/茶 → 保留
        if (mainIngs.length === 0) return true

        if (params.pureOnly) {
          // 纯净模式：选了具体链则只用该链标签，否则用所有项目标签
          const purePrefixes = params.tierChainKey && chainList.length > 1
            ? selectedLabels
            : projectPrefixes
          return mainIngs.every(ing =>
            purePrefixes.some((p: string) => ing.name.startsWith(p)))
        }

        // 普通材质链筛选：至少一个原料匹配选中链
        return mainIngs.some(ing =>
          Array.from(selectedPrefixes).some((p: string) => ing.name.startsWith(p)))
      })
    }
  }

  return handlePage(handleSort(handleSearch(profitList, params), params), params)
}

function calcProfit(sellTaxFactor: number) {
  const gameData = getGameDataApi()
  // 所有物品列表
  const list = Object.values(gameData.itemDetailMap)
  const profitList: Calculator[] = []
  list.forEach((item) => {
    const cList = []
    for (let catalystRank = 0; catalystRank <= 2; catalystRank++) {
      const transmute = new TransmuteCalculator({
        hrid: item.hrid,
        catalystRank
      })
      transmute.setSellTaxFactor(sellTaxFactor)
      cList.push(transmute)

      const decompose = new DecomposeCalculator({
        hrid: item.hrid,
        catalystRank
      })
      decompose.setSellTaxFactor(sellTaxFactor)
      cList.push(decompose)

      const coinify = new CoinifyCalculator({
        hrid: item.hrid,
        catalystRank
      })
      coinify.setSellTaxFactor(sellTaxFactor)
      cList.push(coinify)
    }
    cList.forEach(c => handlePush(profitList, c))
    const projects: [string, Action][] = [
      [getTrans("锻造"), "cheesesmithing"],
      [getTrans("制造"), "crafting"],
      [getTrans("裁缝"), "tailoring"],
      [getTrans("烹饪"), "cooking"],
      [getTrans("冲泡"), "brewing"]
    ]
    for (const [project, action] of projects) {
      const c = new ManufactureCalculator({ hrid: item.hrid, project, action })
      c.setSellTaxFactor(sellTaxFactor)
      handlePush(profitList, c)
    }

    const gatherings: [string, Action][] = [
      [getTrans("挤奶"), "milking"],
      [getTrans("采摘"), "foraging"],
      [getTrans("伐木"), "woodcutting"]
    ]
    for (const [project, action] of gatherings) {
      const c = new GatherCalculator({ hrid: item.hrid, project, action })
      c.setSellTaxFactor(sellTaxFactor)
      handlePush(profitList, c)
    }
  })
  return profitList
}

function calcAllFlowProfit(sellTaxFactor: number, crossStepBalance: boolean) {
  const gameData = getGameDataApi()
  // 所有物品列表
  const list = Object.values(gameData.itemDetailMap)
  const profitList: Calculator[] = []
  list.forEach((item) => {
    const projects: [string, Action][] = [
      [getTrans("锻造"), "cheesesmithing"],
      [getTrans("制造"), "crafting"],
      [getTrans("裁缝"), "tailoring"],
      [getTrans("烹饪"), "cooking"],
      [getTrans("冲泡"), "brewing"]
    ]
    for (const [project, action] of projects) {
      const configs: StorageCalculatorItem[] = []
      let c = new ManufactureCalculator({ hrid: item.hrid, project, action })
      let actionItem = c.actionItem
      if (!actionItem?.upgradeItemHrid) {
        continue
      }

      while (actionItem && actionItem.upgradeItemHrid) {
        configs.unshift(getStorageCalculatorItem(c))

        if (configs.length > 1) {
          let projectName = t("{0}步{1}", [configs.length, project])
          const otherProject = configs.find(conf => conf.project !== project)
          otherProject && (projectName += t("({0})", [otherProject?.project]))
          handlePush(profitList, new WorkflowCalculator(configs, projectName, sellTaxFactor, crossStepBalance))
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

      let projectName = t("{0}步{1}", [configs.length, project])
      const otherProject = configs.find(conf => conf.project !== project)
      otherProject && (projectName += t("({0})", [otherProject?.project]))
      handlePush(profitList, new WorkflowCalculator(configs, projectName, sellTaxFactor, crossStepBalance))
    }
  })
  return profitList
}
