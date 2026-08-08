<script lang="ts" setup>
import type { Action, ItemDetail } from "~/game"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import TieredPriceInput from "@@/components/TieredPriceInput/index.vue"

import * as Format from "@@/utils/format"
import { Star, StarFilled } from "@element-plus/icons-vue"
import { ElTable } from "element-plus"
import { useRoute } from "vue-router"
import { EnhanceCalculator } from "@/calculator/enhance"
import { ManufactureCalculator } from "@/calculator/manufacture"
import { getStorageCalculatorItem } from "@/calculator/utils"
import { WorkflowCalculator } from "@/calculator/workflow"
import { getItemDetailOf, getMarketDataApi, getPriceOf, priceStepOf } from "@/common/apis/game"
import { getEquipmentList } from "@/common/apis/player"
import { useMemory } from "@/common/composables/useMemory"
import { getEquipmentTypeOf } from "@/common/utils/game"
import { useEnhancerStore } from "@/pinia/stores/enhancer"
import { COIN_HRID, PRICE_STATUS_LIST, PriceStatus, useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"

const enhancerStore = useEnhancerStore()
const gameStore = useGameStore()
const { t } = useI18n()
const route = useRoute()

function getQueryFirstString(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (Array.isArray(value) && typeof value[0] === "string") return value[0]
  return undefined
}

function applyPrefillFromRouteQuery(options: { selectItem?: boolean } = {}) {
  const hrid = getQueryFirstString(route.query.hrid)
  const enhanceLevelStr = getQueryFirstString(route.query.enhanceLevel)

  if (enhanceLevelStr) {
    const enhanceLevel = Math.floor(Number(enhanceLevelStr))
    if (Number.isFinite(enhanceLevel) && enhanceLevel >= 1 && enhanceLevel <= 20) {
      enhancerStore.config.enhanceLevel = enhanceLevel
    }
  }

  if (!hrid) return
  if (currentItem.value.hrid === hrid && !options.selectItem) return

  enhancerStore.config.hrid = hrid
  if (options.selectItem) {
    try {
      onSelect(getItemDetailOf(hrid))
    } catch (e) {
      console.warn("Invalid hrid from route query", hrid, e)
    }
  }
}

const dialogVisible = ref(false)
const search = ref("")
const equipmentList = computed(() => {
  return getEquipmentList().filter(item => t(item.name).toLocaleLowerCase().includes(search.value.toLowerCase())).sort((a, b) =>
    a.sortIndex - b.sortIndex
  )
})

const currentItem = ref<Item>({
  protection: {} as Ingredient,
  originPrice: 0
})
const manufactureIngredients = ref<Ingredient[]>([])
const manufactureStepList = ref<{ title: string, ingredients: Ingredient[] }[]>([])
const enhancementCosts = ref<Ingredient[]>([])
const protectionList = ref<Ingredient[]>([])
const costGuideVisible = ref(false)
const costGuideLoading = ref(false)
const costGuideError = ref("")
const costGuideTotalCost = ref<number>(-1)
const costGuideRows = ref<CostGuideRow[]>([])
const costGuideLeafRows = ref<CostGuideLeafRow[]>([])
const costGuideView = ref<"leaf" | "tree">("leaf")
const costGuideKeyword = ref("")
const costGuideOnlyUnknown = ref(false)
const costGuideExpandedRowKeys = ref<string[]>([])

const defaultConfig = {
  hourlyRate: 5000000,
  taxRate: 2,
  enhanceLevel: 10
}

// Market tax rate: only 0% / 2%.
// Internally we persist `ignoreTax` (0% => true, 2% => false).
const marketTaxRate = computed<number>({
  get: () => (enhancerStore.config.ignoreTax ? 0 : 2),
  set: (value: number) => {
    enhancerStore.config.ignoreTax = value === 0
  }
})

onMounted(() => {
  applyPrefillFromRouteQuery({ selectItem: false })
  enhancerStore.hrid && onSelect(getItemDetailOf(enhancerStore.hrid))
})

watch(
  () => route.query,
  () => {
    // When navigating from other tools (e.g., Jungle) while staying on this page,
    // re-apply query and re-select the item.
    applyPrefillFromRouteQuery({ selectItem: true })
  },
  { immediate: false }
)

watch(
  () => enhancerStore.config,
  () => {
    enhancerStore.saveConfig()
  },
  { deep: true }
)

interface Ingredient {
  hrid: string
  count: number
  level?: number
  originPrice: number
  /** Optional placeholder override for originPrice (e.g. "无库存", "由制作链产出") */
  originPriceText?: string
  /** True when this row is an intermediate item provided by previous steps in the workflow (not bought from market). */
  fromWorkflow?: boolean
  price?: number
}
interface Item {
  hrid?: string
  originPrice: number
  productPrice?: number
  price?: number
  protection?: Ingredient
}

interface CostGuideRow {
  id: string
  hrid: string
  level?: number
  count: number
  unitCost: number
  totalCost: number
  source: "craft" | "market" | "unknown"
  project?: string
  children?: CostGuideRow[]
}

interface CostGuideLeafRow {
  key: string
  hrid: string
  level?: number
  count: number
  totalCost: number
}

const gearManufacture = ref(false)
const bestManufacture = ref(false)
const lastGearManufacture = ref(false)
// Independent buy-price status for the two cost blocks (do NOT mutate global buyStatus)
const gearCostBuyStatus = useMemory("enhancer-gear-cost-buy-status", PriceStatus.ASK)
const enhancementCostBuyStatus = useMemory("enhancer-enhancement-cost-buy-status", PriceStatus.ASK)
watch([
  () => manufactureIngredients.value,
  () => gearManufacture.value,
  () => bestManufacture.value,
  () => gearCostBuyStatus.value,
  () => enhancementCostBuyStatus.value
], resetPrice, { deep: true })

watch([
  () => gearManufacture.value,
  () => bestManufacture.value,
  () => gearCostBuyStatus.value
], () => {
  recalcManufacturePlan()
}, { deep: false })

watch([
  () => gearCostBuyStatus.value,
  () => currentItem.value.hrid
], () => {
  if (!costGuideVisible.value) return
  costGuideLoading.value = true
  costGuideError.value = ""
  refreshCostGuide()
}, { deep: false })

function isDrink(hrid: string) {
  return getItemDetailOf(hrid).categoryHrid === "/item_categories/drink"
}

function getGearCostOriginPrice(hrid: string, level?: number) {
  // Use `.ask` as "buying" price output; the selected status decides which market field is used.
  return getPriceOf(hrid, level, gearCostBuyStatus.value, gameStore.sellStatus).ask
}

function getEnhancementCostOriginPrice(hrid: string, level?: number) {
  return getPriceOf(hrid, level, enhancementCostBuyStatus.value, gameStore.sellStatus).ask
}

function calcSingleStepIngredients(hrid: string) {
  const projects: [string, Action][] = [
    [t("锻造"), "cheesesmithing"],
    [t("制造"), "crafting"],
    [t("裁缝"), "tailoring"]
  ]
  let calc: ManufactureCalculator | undefined
  for (const [project, action] of projects) {
    const c = new ManufactureCalculator({
      hrid,
      project,
      action
    })
    if (c.available) {
      calc = c
      break
    }
  }
  return calc?.available
    ? calc.ingredientList
        .filter(item => !isDrink(item.hrid))
        .map(item => ({
          hrid: item.hrid,
          count: item.count,
          level: item.level,
          originPrice: getGearCostOriginPrice(item.hrid, item.level)
        }))
    : []
}

function calcBestManufacturePlan(hrid: string) {
  const item = getItemDetailOf(hrid)
  const projects: [string, Action][] = [
    [t("锻造"), "cheesesmithing"],
    [t("制造"), "crafting"],
    [t("裁缝"), "tailoring"]
  ]

  // Max steps for best manufacture plan search.
  // - charms: allow deeper chains by default
  // - non-charms:
  //   - if target gear is not buyable (-1): allow deeper chains to craft missing intermediates
  //   - otherwise keep it small for performance
  const maxSteps = getEquipmentTypeOf(item) === "charm"
    ? 7
    : (getGearCostOriginPrice(hrid) === -1 ? 7 : 3)

  let best: {
    workflow: WorkflowCalculator
    outputPH: number
    costPerItem: number
  } | undefined

  for (const [projectLast, actionLast] of projects) {
    for (const [project, action] of projects) {
      const manual = new ManufactureCalculator({ hrid, project, action })
      if (!manual.available) {
        continue
      }

      const manualChain: ManufactureCalculator[] = [manual]
      const chainsToTry: ManufactureCalculator[][] = [[...manualChain]]

      let currentManual = manual
      let stepCount = 1
      while (currentManual.actionItem?.upgradeItemHrid && stepCount < maxSteps) {
        const nextManual = new ManufactureCalculator({
          hrid: currentManual.actionItem.upgradeItemHrid,
          project: projectLast,
          action: actionLast
        })
        if (!nextManual.available) {
          break
        }
        manualChain.unshift(nextManual)
        stepCount++
        chainsToTry.push([...manualChain])
        currentManual = nextManual
      }

      for (const chain of chainsToTry) {
        const wf = new WorkflowCalculator(
          chain.map(m => getStorageCalculatorItem(m)),
          t("{0}步{1}", [chain.length, project])
        )
        wf.run()

        const outputPH = wf.productListWithPricePreprocess.list
          .filter(p => p.hrid === hrid)
          .reduce((acc, p) => acc + (p.countPH || 0), 0)
        if (!outputPH || outputPH <= 1e-12) {
          continue
        }

        // If any required ingredient has no market price (-1), this workflow is not actionable.
        // Skip it so that longer chains that actually craft the missing intermediate can win.
        let invalid = false
        const costPH = wf.ingredientListWithPrice
          .filter(ing => !isDrink(ing.hrid))
          .reduce((acc, ing) => {
            const countPH = ing.countPH || 0
            // Only treat as invalid when this ingredient is actually required (net > 0)
            if (countPH > 1e-12) {
              const unitPrice = getGearCostOriginPrice(ing.hrid, ing.level)
              if (unitPrice === -1) {
                invalid = true
                return acc
              }
              return acc + countPH * unitPrice
            }
            return acc
          }, 0)
        if (invalid) {
          continue
        }
        const costPerItem = costPH / outputPH

        if (!best || costPerItem < best.costPerItem) {
          best = { workflow: wf, outputPH, costPerItem }
        }
      }
    }
  }

  if (!best) {
    return undefined
  }

  const { workflow: wf, outputPH } = best

  const keyOf = (hrid2: string, level2?: number) => `${hrid2}|${level2 ?? ""}`

  // Net ingredients (after workflow cancellation), converted to "per 1 final item"
  const totalIngredients: Ingredient[] = wf.ingredientListWithPrice
    .filter(ing => !isDrink(ing.hrid))
    .filter(ing => (ing.countPH || 0) > 1e-12)
    .map(ing => ({
      hrid: ing.hrid,
      count: (ing.countPH || 0) / outputPH,
      level: ing.level,
      originPrice: getGearCostOriginPrice(ing.hrid, ing.level)
    }))

  // Step-by-step inputs (for display)
  const stepList: { title: string, ingredients: Ingredient[] }[] = []
  const producedBefore = new Set<string>()
  for (let i = 0; i < wf.calculatorList.length; i++) {
    const cal = wf.calculatorList[i]
    if (Array.isArray(cal)) continue

    const wm = wf.workMultiplier[i] as number
    const stepIngredients: Ingredient[] = cal.ingredientListWithPrice
      .filter(ing => !isDrink(ing.hrid))
      .map((ing) => {
        const fromWorkflow = producedBefore.has(ing.hrid) || producedBefore.has(keyOf(ing.hrid, ing.level))
        return {
          hrid: ing.hrid,
          count: ((ing.countPH || 0) * wm) / outputPH,
          level: ing.level,
          originPrice: getGearCostOriginPrice(ing.hrid, ing.level),
          fromWorkflow
        }
      })

    stepList.push({
      title: `${t("{0}步{1}", [stepList.length + 1, cal.project])}:`,
      ingredients: stepIngredients
    })

    // Mark products from this step as available for subsequent steps.
    for (const p of cal.productListWithPrice) {
      producedBefore.add(p.hrid)
      producedBefore.add(keyOf(p.hrid, p.level))
    }
  }

  return { totalIngredients, stepList }
}

function getOriginPricePlaceholder(row: Ingredient) {
  if (row.originPriceText) {
    return row.originPriceText
  }
  if (row.fromWorkflow) {
    return t("由制作链产出")
  }
  // Keep -1 as-is (do not replace with text like "无库存")
  if (row.originPrice === -1) {
    return "-1"
  }
  return Format.number(row.originPrice)
}

function getCostGuidePriceText(price: number) {
  return price < 0 ? "-1" : Format.number(price)
}

function getCostGuideSourceLabel(source: CostGuideRow["source"], project?: string) {
  if (source === "craft") {
    return project ? `${t("制作")}(${project})` : t("制作")
  }
  if (source === "market") {
    return t("买价")
  }
  return t("无库存")
}

function getGuideManufactureCalculator(hrid: string) {
  const projects: [string, Action][] = [
    [t("锻造"), "cheesesmithing"],
    [t("制造"), "crafting"],
    [t("裁缝"), "tailoring"]
  ]

  for (const [project, action] of projects) {
    const calculator = new ManufactureCalculator({ hrid, project, action })
    if (!calculator.available) continue

    const outputCount = calculator.productList.find(item => item.hrid === hrid)?.count ?? 1
    if (outputCount <= 0) continue

    return {
      calculator,
      project,
      outputCount
    }
  }

  return undefined
}

let _guideRowId = 0
function createGuideRow(input: Omit<CostGuideRow, "id">): CostGuideRow {
  _guideRowId++
  return { id: String(_guideRowId), ...input }
}

function buildCostGuideRow(
  hrid: string,
  count: number,
  level: number | undefined,
  stack: Set<string>
): CostGuideRow {
  const key = `${hrid}|${level ?? 0}`
  const unitMarketPrice = getGearCostOriginPrice(hrid, level)

  // Enhanced/leveled ingredient is treated as market leaf.
  if ((level ?? 0) > 0) {
    return createGuideRow({
      hrid,
      level,
      count,
      unitCost: unitMarketPrice,
      totalCost: unitMarketPrice < 0 ? -1 : unitMarketPrice * count,
      source: unitMarketPrice < 0 ? "unknown" : "market"
    })
  }

  if (stack.has(key)) {
    return createGuideRow({
      hrid,
      level,
      count,
      unitCost: unitMarketPrice,
      totalCost: unitMarketPrice < 0 ? -1 : unitMarketPrice * count,
      source: unitMarketPrice < 0 ? "unknown" : "market"
    })
  }

  const guideCalculator = getGuideManufactureCalculator(hrid)
  if (!guideCalculator) {
    return createGuideRow({
      hrid,
      level,
      count,
      unitCost: unitMarketPrice,
      totalCost: unitMarketPrice < 0 ? -1 : unitMarketPrice * count,
      source: unitMarketPrice < 0 ? "unknown" : "market"
    })
  }

  const nextStack = new Set(stack)
  nextStack.add(key)
  const children = guideCalculator.calculator.ingredientList
    .filter(item => !isDrink(item.hrid))
    .map(item => buildCostGuideRow(
      item.hrid,
      count * item.count / guideCalculator.outputCount,
      item.level,
      nextStack
    ))

  const hasUnknown = children.some(item => item.totalCost < 0)
  const craftTotalCost = hasUnknown ? -1 : children.reduce((acc, item) => acc + item.totalCost, 0)
  const craftUnitCost = hasUnknown ? -1 : craftTotalCost / count

  return createGuideRow({
    hrid,
    level,
    count,
    unitCost: craftUnitCost,
    totalCost: craftTotalCost,
    source: hasUnknown ? "unknown" : "craft",
    project: guideCalculator.project,
    children
  })
}

function buildCostGuideLeafRows(root: CostGuideRow) {
  const leafMap = new Map<string, CostGuideLeafRow>()

  function dfs(node: CostGuideRow) {
    if (!node.children?.length || node.source !== "craft") {
      const key = `${node.hrid}|${node.level ?? 0}`
      const prev = leafMap.get(key)
      if (prev) {
        prev.count += node.count
        if (prev.totalCost >= 0 && node.totalCost >= 0) {
          prev.totalCost += node.totalCost
        } else {
          prev.totalCost = -1
        }
      } else {
        leafMap.set(key, {
          key,
          hrid: node.hrid,
          level: node.level,
          count: node.count,
          totalCost: node.totalCost
        })
      }
      return
    }
    node.children.forEach(dfs)
  }

  dfs(root)
  return Array.from(leafMap.values()).sort((a, b) => a.hrid.localeCompare(b.hrid))
}

function getGuideItemName(hrid: string) {
  return t(getItemDetailOf(hrid)?.name || hrid)
}

function collectGuideRowIds(rows: CostGuideRow[]) {
  const ids: string[] = []
  function dfs(row: CostGuideRow) {
    ids.push(row.id)
    row.children?.forEach(dfs)
  }
  rows.forEach(dfs)
  return ids
}

function filterGuideRows(rows: CostGuideRow[], keyword: string, onlyUnknown: boolean): CostGuideRow[] {
  function dfs(row: CostGuideRow): CostGuideRow | null {
    const children = (row.children || [])
      .map(child => dfs(child))
      .filter((item): item is CostGuideRow => item !== null)

    const matchKeyword = !keyword || getGuideItemName(row.hrid).toLowerCase().includes(keyword)
    const matchUnknown = !onlyUnknown || row.totalCost < 0
    const selfMatch = matchKeyword && matchUnknown
    const childMatch = children.length > 0

    if (!selfMatch && !childMatch) {
      return null
    }

    return { ...row, children }
  }

  return rows
    .map(item => dfs(item))
    .filter((item): item is CostGuideRow => item !== null)
}

const filteredCostGuideRows = computed(() => {
  const keyword = costGuideKeyword.value.trim().toLowerCase()
  return filterGuideRows(costGuideRows.value, keyword, costGuideOnlyUnknown.value)
})

const filteredCostGuideLeafRows = computed(() => {
  const keyword = costGuideKeyword.value.trim().toLowerCase()
  return costGuideLeafRows.value
    .filter((row) => {
      const matchKeyword = !keyword || getGuideItemName(row.hrid).toLowerCase().includes(keyword)
      const matchUnknown = !costGuideOnlyUnknown.value || row.totalCost < 0
      return matchKeyword && matchUnknown
    })
    .sort((a, b) => {
      const costA = a.totalCost < 0 ? -1 : a.totalCost
      const costB = b.totalCost < 0 ? -1 : b.totalCost
      return costB - costA
    })
})

const costGuideLeafKnownTotal = computed(() => {
  return filteredCostGuideLeafRows.value.reduce((acc, row) => row.totalCost > 0 ? acc + row.totalCost : acc, 0)
})

function getLeafShareText(totalCost: number) {
  if (totalCost <= 0 || costGuideLeafKnownTotal.value <= 0) return "-"
  return Format.percent(totalCost / costGuideLeafKnownTotal.value)
}

function getLeafUnitCostText(row: CostGuideLeafRow) {
  if (row.totalCost < 0 || row.count <= 0) return "-1"
  return Format.number(row.totalCost / row.count)
}

function expandAllGuideRows() {
  costGuideExpandedRowKeys.value = collectGuideRowIds(filteredCostGuideRows.value)
}

function collapseAllGuideRows() {
  costGuideExpandedRowKeys.value = []
}

function refreshCostGuide() {
  const hrid = currentItem.value.hrid
  if (!hrid) {
    return
  }

  try {
    _guideRowId = 0
    const root = buildCostGuideRow(hrid, 1, undefined, new Set())
    costGuideRows.value = [root]
    costGuideLeafRows.value = buildCostGuideLeafRows(root)
    costGuideTotalCost.value = root.totalCost
  } catch (e: any) {
    costGuideError.value = e?.message || "failed"
  } finally {
    costGuideLoading.value = false
  }
}

function openCostGuide() {
  if (!currentItem.value.hrid) {
    return
  }
  costGuideVisible.value = true
  costGuideLoading.value = true
  costGuideError.value = ""
  costGuideView.value = "leaf"
  costGuideKeyword.value = ""
  costGuideOnlyUnknown.value = false
  costGuideRows.value = []
  costGuideLeafRows.value = []
  costGuideTotalCost.value = -1
  costGuideExpandedRowKeys.value = []
  refreshCostGuide()
}

let _syncingProductPriceStep = false
function onProductPriceChange(value: number | undefined, oldValue: number | undefined) {
  if (_syncingProductPriceStep) return

  const item = currentItem.value
  const hrid = item?.hrid
  if (!hrid) return
  if (typeof value !== "number") return
  if (value < -1) {
    _syncingProductPriceStep = true
    item.productPrice = -1
    nextTick(() => {
      _syncingProductPriceStep = false
    })
    return
  }

  const enhanceLevel = enhancerStore.enhanceLevel ?? defaultConfig.enhanceLevel
  const marketBid = getPriceOf(hrid, enhanceLevel).bid

  const isOldNumber = typeof oldValue === "number"
  const delta = isOldNumber ? (value - (oldValue as number)) : Number.NaN

  let high: boolean | undefined
  let base: number | undefined

  if (isOldNumber && oldValue === -1 && value === 0) {
    _syncingProductPriceStep = true
    item.productPrice = 1
    nextTick(() => {
      _syncingProductPriceStep = false
    })
    return
  } else if (isOldNumber && Math.abs(Math.abs(delta) - 1) < 1e-9) {
    high = delta > 0
    base = oldValue as number
  } else if (!isOldNumber && (value === 0 || value === 1) && typeof marketBid === "number" && marketBid > 0) {
    high = value === 1
    base = marketBid
  } else if (!isOldNumber && value === -1) {
    // Empty -> click "-" should step down from market price by tier,
    // not hard-set to -1 directly.
    if (typeof marketBid !== "number" || marketBid <= 0) {
      _syncingProductPriceStep = true
      item.productPrice = -1
      nextTick(() => {
        _syncingProductPriceStep = false
      })
      return
    }
    high = false
    base = marketBid
  } else {
    return
  }

  const next = priceStepOf(base, high)
  if (next <= 0) {
    _syncingProductPriceStep = true
    item.productPrice = -1
    nextTick(() => {
      _syncingProductPriceStep = false
    })
    return
  }

  _syncingProductPriceStep = true
  item.productPrice = next
  nextTick(() => {
    _syncingProductPriceStep = false
  })
}

let _syncingGearIngredientPriceStep = false
let _syncingGearPriceStep = false
let _syncingEnhancementCostPriceStep = false
let _syncingProtectionPriceStep = false

function resolveTierStep(value: number | undefined, oldValue: number | undefined, marketPrice: number) {
  if (typeof value !== "number") {
    return undefined
  }
  if (value < -1) {
    return -1
  }
  const isOldNumber = typeof oldValue === "number"
  const delta = isOldNumber ? (value - oldValue) : Number.NaN
  let high: boolean | undefined
  let base: number | undefined

  if (isOldNumber && oldValue === -1 && value === 0) {
    return 1
  } else if (isOldNumber && Math.abs(Math.abs(delta) - 1) < 1e-9) {
    high = delta > 0
    base = oldValue
  } else if (!isOldNumber && (value === -1 || value === 0 || value === 1)) {
    if (marketPrice > 0) {
      high = value === 1
      base = marketPrice
    } else {
      return value === 1 ? 1 : -1
    }
  } else {
    return undefined
  }

  const next = priceStepOf(base, high)
  return next > 0 ? next : -1
}

function onGearIngredientPriceChange(row: Ingredient, value: number | undefined, oldValue: number | undefined) {
  if (_syncingGearIngredientPriceStep || row.hrid === COIN_HRID) return
  const next = resolveTierStep(value, oldValue, row.originPrice)
  if (next === undefined) return
  _syncingGearIngredientPriceStep = true
  row.price = next
  nextTick(() => {
    _syncingGearIngredientPriceStep = false
  })
}

function onGearPriceChange(value: number | undefined, oldValue: number | undefined) {
  if (_syncingGearPriceStep || !currentItem.value.hrid) return
  const next = resolveTierStep(value, oldValue, currentItem.value.originPrice)
  if (next === undefined) return
  _syncingGearPriceStep = true
  currentItem.value.price = next
  nextTick(() => {
    _syncingGearPriceStep = false
  })
}

function onEnhancementCostPriceChange(row: Ingredient, value: number | undefined, oldValue: number | undefined) {
  if (_syncingEnhancementCostPriceStep || row.hrid === COIN_HRID) return
  const next = resolveTierStep(value, oldValue, row.originPrice)
  if (next === undefined) return
  _syncingEnhancementCostPriceStep = true
  row.price = next
  nextTick(() => {
    _syncingEnhancementCostPriceStep = false
  })
}

function onProtectionPriceChange(row: Item, value: number | undefined, oldValue: number | undefined) {
  if (_syncingProtectionPriceStep || !row.protection) return
  const next = resolveTierStep(value, oldValue, row.protection.originPrice)
  if (next === undefined) return
  _syncingProtectionPriceStep = true
  row.protection.price = next
  nextTick(() => {
    _syncingProtectionPriceStep = false
  })
}

function recalcManufacturePlan() {
  const hrid = currentItem.value.hrid
  if (!hrid) {
    manufactureIngredients.value = []
    manufactureStepList.value = []
    return
  }

  if (!gearManufacture.value) {
    manufactureStepList.value = []
    return
  }

  if (!bestManufacture.value) {
    manufactureIngredients.value = calcSingleStepIngredients(hrid)
    manufactureStepList.value = []
    return
  }

  const bestPlan = calcBestManufacturePlan(hrid)
  if (!bestPlan) {
    // Fallback: still show single-step craft ingredients (so we don't fall back to market -1)
    // even if we failed to find a multi-step "best" plan.
    manufactureIngredients.value = calcSingleStepIngredients(hrid)
    manufactureStepList.value = []
    return
  }
  manufactureIngredients.value = bestPlan.totalIngredients
  manufactureStepList.value = bestPlan.stepList
}

function onSelect(item: ItemDetail) {
  if (!item) {
    return
  }
  enhancerStore.config.hrid = item.hrid
  currentItem.value = {
    hrid: item.hrid,
    originPrice: 0
  }
  dialogVisible.value = false
  const projects: [string, Action][] = [
    [t("锻造"), "cheesesmithing"],
    [t("制造"), "crafting"],
    [t("裁缝"), "tailoring"]
  ]
  let calc: ManufactureCalculator
  for (const [project, action] of projects) {
    calc = new ManufactureCalculator({
      hrid: item.hrid,
      project,
      action
    })
    if (calc.available) {
      break
    }
  }
  manufactureIngredients.value = calc!.available
    ? calc!.ingredientList.filter(item => getItemDetailOf(item.hrid).categoryHrid !== "/item_categories/drink").map(item => ({
        hrid: item.hrid,
        count: item.count,
        level: item.level,
        originPrice: getGearCostOriginPrice(item.hrid, item.level)
      }))
    : []

  enhancementCosts.value = item.enhancementCosts!.map(item => ({
    hrid: item.itemHrid,
    count: item.count,
    originPrice: getEnhancementCostOriginPrice(item.itemHrid)
  }))

  protectionList.value = item.protectionItemHrids
    ? item.protectionItemHrids.map(hrid => ({
        hrid,
        count: 1,
        originPrice: getEnhancementCostOriginPrice(hrid)
      }))
    : []
  if (!protectionList.value.length) {
    protectionList.value.push({
      hrid: item.hrid,
      count: 1,
      originPrice: getEnhancementCostOriginPrice(item.hrid)
    })
  }

  protectionList.value.push({
    hrid: "/items/mirror_of_protection",
    count: 1,
    originPrice: getEnhancementCostOriginPrice("/items/mirror_of_protection")
  })

  // price最低的
  currentItem.value.protection = protectionList.value.reduce((acc: Ingredient, item) => {
    if (!acc) {
      return item
    }
    return acc.originPrice < item.originPrice ? acc : item
  })

  recalcManufacturePlan()
}

let _resultsRunCount = 0
const results = computed(() => {
  _resultsRunCount++
  if (!currentItem.value.hrid) {
    return []
  }

  console.time('[强化分解] results')
  const result = []
  const ignoreTax = !!enhancerStore.config.ignoreTax
  const sellTaxFactor = ignoreTax ? 1 : 0.98
  const enhanceLevel = enhancerStore.enhanceLevel ?? defaultConfig.enhanceLevel
  for (let i = 1; i <= enhanceLevel; ++i) {
    const calc = new EnhanceCalculator({
      hrid: currentItem.value.hrid,
      enhanceLevel,
      protectLevel: i
    })

    const { actions, protects } = calc.enhancelate()
    const matCost
        = enhancementCosts.value.reduce((acc, item) => {
          const price = typeof item.price === "number" ? item.price : item.originPrice
          return acc + (price * item.count * actions)
        }, 0) + (typeof currentItem.value.protection?.price === "number"
          ? currentItem.value.protection!.price
          : currentItem.value.protection!.originPrice) * protects

    const gearCost = gearManufacture.value
      ? currentItem.value!.originPrice
      : (typeof currentItem.value?.price === "number" ? currentItem.value!.price : currentItem.value!.originPrice)
    const totalCostNoHourly = matCost + gearCost
    let totalCost = totalCostNoHourly + (enhancerStore.hourlyRate ?? defaultConfig.hourlyRate) * (actions / calc.actionsPH)
    if (!ignoreTax) {
      totalCost *= (1 + (enhancerStore.taxRate ?? defaultConfig.taxRate) / 100)
    }

    const productPrice = typeof currentItem.value.productPrice === "number"
      ? currentItem.value.productPrice
      : getPriceOf(currentItem.value.hrid, enhanceLevel).bid

    const hourlyCost = (productPrice * sellTaxFactor - totalCostNoHourly) / actions * calc.actionsPH
    const profitPP = productPrice * sellTaxFactor - totalCostNoHourly

    const seconds = actions / calc.actionsPH * 3600
    result.push({
      actions,
      actionsFormatted: Format.number(actions, 2),
      protects,
      protectsFormatted: Format.number(protects, 2),
      protectLevel: i,
      time: Format.costTime(seconds * 1000000000),
      expPHFormat: Format.money(calc.exp * calc.actionsPH),
      matCost: Format.money(matCost),
      totalCostFormatted: Format.money(totalCost),
      totalCost,
      totalCostNoHourly,
      matCostPH: `${Format.money(matCost / seconds * 3600)} / h`,
      hourlyCost,
      hourlyCostFormatted: Format.money(hourlyCost),
      profitPPFormatted: Format.money(profitPP),
      profitRateFormatted: Format.percent(profitPP / totalCostNoHourly)
    })
  }
  console.timeEnd('[强化分解] results')
  console.log('[强化分解] #' + _resultsRunCount, '强化等级:', enhanceLevel, '行数:', result.length)
  return result
})

const columnWidths = computed(() => {
  interface ResultItem {
    actions: number
    actionsFormatted: string
    protects: number
    protectsFormatted: string
    protectLevel: number
    time: string
    matCost: string
    totalCostFormatted: string
    matCostPH: string
  }
  if (!results.value.length) {
    return {}
  }

  const props = Object.keys(results.value[0]) as (keyof ResultItem)[]
  const widths: Record<string, number> = {}
  for (const prop of props) {
    const maxWidth = Math.max(...results.value.map(item => item[prop]?.toString().length || 0))
    widths[prop] = Math.max(maxWidth * 10 + 20, 60)
  }
  for (const item of enhancementCosts.value) {
    const maxWidth = Math.max(...results.value.map(result => (Format.number(item.count * result.actions)).toString().length || 0))
    widths[item.hrid] = Math.max(maxWidth * 10 + 20, 60)
  }
  return widths
})

const refTable = ref<InstanceType<typeof ElTable> | null>(null)
const tableWidth = computed(() => {
  const columns = refTable.value?.columns as unknown as any[] ?? []
  const width = columns.reduce((acc, item) => {
    return acc + (item.minWidth || 0)
  }, 0) ?? 0
  return Math.max(width + 100, 1100)
})

watch([
  () => getMarketDataApi(),
  () => usePlayerStore().config
], () => enhancerStore.hrid && onSelect(getItemDetailOf(enhancerStore.hrid)), { immediate: false })

function resetPrice() {
  if (!currentItem.value.hrid) {
    return
  }
  const modeChanged = lastGearManufacture.value !== gearManufacture.value
  lastGearManufacture.value = gearManufacture.value

  // 触发一次computed
  currentItem.value = JSON.parse(JSON.stringify(currentItem.value))

  manufactureIngredients.value.forEach((item) => {
    item.originPrice = getGearCostOriginPrice(item.hrid, item.level)
  })
  manufactureStepList.value.forEach((step) => {
    step.ingredients.forEach((item) => {
      item.originPrice = getGearCostOriginPrice(item.hrid, item.level)
    })
  })
  enhancementCosts.value.forEach((item) => {
    item.originPrice = getEnhancementCostOriginPrice(item.hrid, item.level)
  })
  protectionList.value.forEach((item) => {
    item.originPrice = getEnhancementCostOriginPrice(item.hrid, item.level)
  })

  if (!gearManufacture.value) {
    currentItem.value.originPrice = getGearCostOriginPrice(currentItem.value.hrid!)
  } else {
    const val = manufactureIngredients.value
    currentItem.value.originPrice = val.length
      ? val.reduce((acc, item) => {
          const price = typeof item.price === "number" ? item.price : item.originPrice
          return acc + (price * item.count)
        }, 0)
      : getGearCostOriginPrice(currentItem.value.hrid!)
    if (modeChanged) {
      currentItem.value.price = undefined
    }
  }

  // After the deep clone above, `currentItem.protection` is no longer the same object
  // as the one inside `protectionList`, so its originPrice would NOT refresh.
  // Re-link it to the list item (preserve selected hrid + custom price).
  if (protectionList.value.length) {
    const selectedHrid = currentItem.value.protection?.hrid
    const customPrice = currentItem.value.protection?.price
    const selected = selectedHrid
      ? protectionList.value.find(p => p.hrid === selectedHrid)
      : undefined

    const fallback = protectionList.value.reduce((acc, p) => acc.originPrice < p.originPrice ? acc : p)
    const target = selected || fallback
    if (typeof customPrice === "number") {
      target.price = customPrice
    }
    currentItem.value.protection = target
  }
}

function rowStyle({ row }: { row: any }) {
  // totalcost最小的为半透明浅绿色（内容不要透明）
  // totalCostNoHourly最小的为半透明浅蓝色

  if (enhancerStore.config.tab === "1") {
    if (row.hourlyCost === Math.max(...results.value.map(item => item.hourlyCost))) {
      return { background: "rgb(34, 68, 34)" }
    }
  } else {
    if (row.totalCost === Math.min(...results.value.map(item => item.totalCost))) {
      return { background: "rgb(34, 68, 34)" }
    }
  }
  if (row.totalCostNoHourly === Math.min(...results.value.map(item => item.totalCostNoHourly))) {
    return { background: "rgb(34, 51, 85)" }
  }
}

const menuVisible = ref(false)
const top = ref(0)
const left = ref(0)
const selectedTag = ref("")
function openMenu(hrid: string, e: MouseEvent) {
  const menuMinWidth = 100
  // 当前页面宽度
  const offsetWidth = document.body.offsetWidth
  // 面板的最大左边距
  const maxLeft = offsetWidth - menuMinWidth
  // 面板距离鼠标指针的距离
  const left15 = e.clientX + 10
  left.value = left15 > maxLeft ? maxLeft : left15
  top.value = e.clientY
  // 显示面板
  menuVisible.value = true
  // 更新当前正在右键操作的标签页
  selectedTag.value = hrid
}

/** 关闭右键菜单面板 */
function closeMenu() {
  menuVisible.value = false
}

watch(menuVisible, (value) => {
  value ? document.body.addEventListener("click", closeMenu) : document.body.removeEventListener("click", closeMenu)
})
</script>

<template>
  <div class="app-container">
    <ul v-show="menuVisible" class="contextmenu" :style="{ left: `${left}px`, top: `${top}px` }">
      <li v-if="!enhancerStore.hasFavorite(selectedTag)" @click="enhancerStore.addFavorite(selectedTag)">
        收藏
      </li>
      <li v-else @click="enhancerStore.removeFavorite(selectedTag)">
        取消收藏
      </li>
    </ul>
    <div class="game-info">
      <GameInfo />

      <div>
        <ActionConfig :actions="['enhancing']" :equipments="['hands', 'neck', 'earrings', 'ring', 'pouch']" />
      </div>
    </div>
    <el-row :gutter="20" class="row max-w-1100px mx-auto!">
      <el-col :xs="24" :sm="24" :md="10" :lg="8" :xl="8" class="max-w-400px mx-auto">
        <el-card>
          <template #header>
            <div class="flex flex-col gap-2">
              <span class="whitespace-nowrap flex-shrink-0">{{ t('装备成本') }}</span>
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <el-checkbox v-model="gearManufacture">
                  {{ t('制作装备') }}
                </el-checkbox>
                <el-checkbox v-model="bestManufacture" :disabled="!gearManufacture">
                  {{ t('最佳制作方案') }}
                </el-checkbox>
                <el-button size="small" type="primary" plain :disabled="!currentItem?.hrid" @click="openCostGuide">
                  {{ t('成本指导价') }}
                </el-button>
              </div>

              <div v-if="gameStore.checkSecret()" class="flex items-center gap-2">
                <div class="w-10 whitespace-nowrap">
                  {{ t('买价') }}
                </div>
                <el-select v-model="gearCostBuyStatus" :placeholder="t('左价')" style="width:110px">
                  <el-option v-for="item in PRICE_STATUS_LIST" :key="item.value" :value="item.value" :label="item.label" />
                </el-select>
              </div>
            </div>
          </template>
          <template v-if="gearManufacture && manufactureIngredients.length">
            <ElTable :data="manufactureIngredients" style="--el-table-border-color:none" :cell-style="{ padding: '0' }">
              <el-table-column :label="t('物品')">
                <template #default="{ row }">
                  <ItemIcon :hrid="row.hrid" />
                </template>
              </el-table-column>
              <el-table-column prop="count" :label="t('数量')">
                <template #default="{ row }">
                  {{ Format.number(row.count, 2) }}
                </template>
              </el-table-column>

              <el-table-column :label="t('价格')" align="center" min-width="170">
                <template #default="{ row }">
                  <el-input-number
                    v-if="row.hrid !== COIN_HRID"
                    class="max-w-100%"
                    style="width: 100%"
                    v-model="row.price"
                    :min="-1"
                    :placeholder="getOriginPricePlaceholder(row)"
                    :controls="true"
                    controls-position="right"
                    @change="(value, oldValue) => onGearIngredientPriceChange(row, value, oldValue)"
                  />
                </template>
              </el-table-column>
            </ElTable>
            <el-divider class="mt-2 mb-2" />
          </template>

          <template v-if="gearManufacture && bestManufacture && manufactureStepList.length">
            <div v-for="step in manufactureStepList" :key="step.title" class="mb-3">
              <div class="text-xs color-gray-500 mb-1">
                {{ step.title }}
              </div>
              <ElTable :data="step.ingredients" style="--el-table-border-color:none" :cell-style="{ padding: '0' }" size="small">
                <el-table-column :label="t('物品')">
                  <template #default="{ row }">
                    <ItemIcon :hrid="row.hrid" />
                  </template>
                </el-table-column>
                <el-table-column prop="count" :label="t('数量')">
                  <template #default="{ row }">
                    {{ Format.number(row.count, 4) }}
                  </template>
                </el-table-column>
              </ElTable>
            </div>
            <el-divider class="mt-2 mb-2" />
          </template>

          <ElTable :data="[currentItem]" :show-header="false" style="--el-table-border-color:none">
            <el-table-column>
              <template #default="{ row }">
                <ItemIcon :hrid="row.hrid" />
              </template>
            </el-table-column>
            <el-table-column prop="count" />
            <el-table-column min-width="170" align="center">
              <template #default="{ row }">
                <el-input-number
                  class="max-w-100%"
                  style="width: 100%"
                  v-model="row.price"
                  :min="-1"
                  :placeholder="getOriginPricePlaceholder(row)"
                  :controls="true"
                  controls-position="right"
                  :disabled="gearManufacture"
                  @change="onGearPriceChange"
                />
              </template>
            </el-table-column>
          </ElTable>
        </el-card>
      </el-col>
      <el-col :xs="16" :sm="10" :md="10" :lg="6" :xl="6" class="max-w-300px mx-auto">
        <el-card>
          <div style="position: relative; width: 100%; padding-bottom: 100%;">
            <ItemIcon
              :hrid="currentItem?.hrid"
              style="position: absolute; bottom:10%; left:10%; width: 80%; height: 80%;"
            />
            <el-button style="position: absolute; width: 100%; height: 100%; opacity: 0.5;" @click="dialogVisible = true, search = ''">
              {{ currentItem?.hrid ? '' : t('选择装备') }}
            </el-button>
            <div v-if="currentItem?.hrid" class="absolute bottom-0 right-0">
              <el-link v-if="!enhancerStore.hasFavorite(currentItem.hrid)" :underline="false" type="info" :icon="Star" @click="enhancerStore.addFavorite(currentItem.hrid)" style="font-size:42px" />
              <el-link v-else :underline="false" :icon="StarFilled" type="primary" @click="enhancerStore.removeFavorite(currentItem.hrid)" style="font-size:42px" />
            </div>
            <el-dialog
              v-model="dialogVisible"
              :show-close="false"
            >
              <el-input v-model="search" :placeholder="t('搜索')" />
              <template v-if="enhancerStore.favorite.length && !search">
                <el-divider class="mt-2 mb-2" />
                <div class="mb-2 color-gray-500">
                  {{ t('收藏') }}
                  <span color-gray-600>
                    ({{ t('右键/长按取消收藏') }})</span>
                </div>
                <div class="flex flex-wrap">
                  <el-button
                    v-for="hrid in enhancerStore.favorite"
                    :key="hrid"
                    class="relative"
                    style="width: 50px; height: 50px; margin: 2px;"
                    @click="onSelect(getItemDetailOf(hrid))"
                    @contextmenu.prevent="openMenu(hrid, $event)"
                  >
                    <ItemIcon
                      :hrid="hrid"
                    />

                    <div class="absolute bottom-0 right-0">
                      <el-link :underline="false" :icon="StarFilled" type="primary" style="font-size:16px" />
                    </div>
                  </el-button>
                </div>
                <el-divider class="mt-2 mb-1" />
              </template>
              <div style="display: flex; flex-wrap: wrap;margin-top:10px">
                <el-button
                  v-for="item in equipmentList"
                  :key="item.hrid"
                  style="width: 50px; height: 50px; margin: 2px;"
                  class="relative"
                  @click="onSelect(item)"
                  @contextmenu.prevent="openMenu(item.hrid, $event)"
                >
                  <ItemIcon
                    :hrid="item.hrid"
                  />

                  <div v-if="enhancerStore.hasFavorite(item.hrid)" class="absolute bottom-0 right-0">
                    <el-link :underline="false" :icon="StarFilled" type="primary" style="font-size:16px" />
                  </div>
                </el-button>
              </div>
            </el-dialog>
          </div>
        </el-card>

        <el-card class="mt-2">
          <el-tabs v-model="enhancerStore.config.tab" type="border-card" stretch>
            <el-tab-pane :label="t('工时费')">
              <div class="flex justify-between items-center">
                <div class="font-size-14px">
                  {{ t('工时费/h') }}
                </div>
                <TieredPriceInput
                  class="w-120px"
                  v-model="enhancerStore.config.hourlyRate"
                  :min="0"
                  :max="5000000000"
                  :placeholder="Format.number(defaultConfig.hourlyRate)"
                  :fallback-base="defaultConfig.hourlyRate"
                  width="120px"
                />
              </div>

              <div class="flex justify-between items-center">
                <div class="font-size-14px">
                  {{ t('溢价率%') }}
                </div>
                <el-input-number
                  class="w-120px"
                  v-model="enhancerStore.config.taxRate"
                  :step="2"
                  :step-strictly="true"
                  :min="0"
                  :max="2"
                  controls-position="right"
                  :placeholder="defaultConfig.taxRate.toString()"
                />
              </div>
            </el-tab-pane>
            <el-tab-pane :label="t('成品售价')">
              <div
                class="grid w-full items-center gap-x-1"
                :style="{ gridTemplateColumns: '44px minmax(0, 1fr)' }"
              >
                <div class="font-size-14px whitespace-nowrap">
                  {{ t('价格') }}
                </div>
                <el-input-number
                  class="w-full"
                  style="width: 100%"
                  v-model="currentItem.productPrice"
                  :step="1"
                  :min="-1"
                  :placeholder="Format.number(getPriceOf(currentItem.hrid!, enhancerStore.enhanceLevel ?? defaultConfig.enhanceLevel).bid)"
                  controls-position="right"
                  :controls="true"
                  @change="onProductPriceChange"
                />
              </div>

              <div
                class="grid w-full items-center gap-x-1 gap-y-1 mt-2"
                :style="{ gridTemplateColumns: '44px minmax(0, 1fr)' }"
              >
                <div class="font-size-14px whitespace-nowrap">
                  {{ t('税率%') }}
                </div>
                <el-input-number
                  class="w-full"
                  style="width: 100%"
                  v-model="marketTaxRate"
                  :step="2"
                  :step-strictly="true"
                  :min="0"
                  :max="2"
                  controls-position="right"
                  :controls="true"
                />
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="10" :lg="8" :xl="8" class="max-w-400px mx-auto">
        <el-card>
          <template #header>
            <div class="flex flex-col gap-2">
              <span class="whitespace-nowrap flex-shrink-0">{{ t('强化消耗') }}</span>
              <div v-if="gameStore.checkSecret()" class="flex items-center gap-2">
                <div class="w-10 whitespace-nowrap">
                  {{ t('买价') }}
                </div>
                <el-select v-model="enhancementCostBuyStatus" :placeholder="t('左价')" style="width:110px">
                  <el-option v-for="item in PRICE_STATUS_LIST" :key="item.value" :value="item.value" :label="item.label" />
                </el-select>
              </div>
            </div>
          </template>
          <ElTable :data="enhancementCosts" style="--el-table-border-color:none;" :cell-style="{ padding: '0' }">
            <el-table-column :label="t('物品')">
              <template #default="{ row }">
                <ItemIcon :hrid="row.hrid" />
              </template>
            </el-table-column>
            <el-table-column prop="count" :label="t('数量')">
              <template #default="{ row }">
                {{ Format.number(row.count, 2) }}
              </template>
            </el-table-column>

            <el-table-column :label="t('价格')" align="center" min-width="170">
              <template #default="{ row }">
                <el-input-number
                  v-if="row.hrid !== COIN_HRID"
                  class="max-w-100%"
                  style="width: 100%"
                  v-model="row.price"
                  :min="-1"
                  :placeholder="getOriginPricePlaceholder(row)"
                  :controls="true"
                  controls-position="right"
                  @change="(value, oldValue) => onEnhancementCostPriceChange(row, value, oldValue)"
                />
              </template>
            </el-table-column>
          </ElTable>
          <el-divider class="mt-2 mb-2" />
          <ElTable :data="[currentItem]" :show-header="false" style="--el-table-border-color:none">
            <el-table-column min-width="160">
              <template #default="{ row }">
                <el-radio-group v-model="row.protection.hrid">
                  <el-radio
                    v-for="item in protectionList"
                    :key="item.hrid"
                    :value="item.hrid"
                    border
                    style="width: 50px; height: 50px; margin: 2px;"
                    @click="() => row.protection = item"
                  >
                    <ItemIcon
                      :hrid="item.hrid"
                    />
                  </el-radio>
                </el-radio-group>
              </template>
            </el-table-column>
            <el-table-column min-width="170" align="center">
              <template #default="{ row }">
                <el-input-number
                  class="max-w-100%"
                  style="width: 100%"
                  v-model="row.protection.price"
                  :min="-1"
                  :placeholder="getOriginPricePlaceholder(row.protection)"
                  :controls="true"
                  controls-position="right"
                  @change="(value, oldValue) => onProtectionPriceChange(row, value, oldValue)"
                />
              </template>
            </el-table-column>
          </ElTable>
          <el-divider class="mt-2 mb-2" />

          <ElTable :data="[currentItem]" :show-header="false" style="--el-table-border-color:none">
            <el-table-column>
              <template #default>
                {{ t('目标') }}:
              </template>
            </el-table-column>
            <el-table-column />
            <el-table-column min-width="120" align="center">
              <template #default>
                <el-input-number
                  class="max-w-100%"
                  :max="20"
                  :min="1"
                  v-model="enhancerStore.config.enhanceLevel"
                  :placeholder="Format.number(defaultConfig.enhanceLevel)"
                  controls-position="right"
                />
              </template>
            </el-table-column>
          </ElTable>
        </el-card>
      </el-col>
    </el-row>
    <el-card class="mx-auto" :style="{ width: `${tableWidth}px`, maxWidth: '100%' }">
      <ElTable
        ref="refTable"
        :data="results"
        size="large"
        border
        fit
        :header-cell-style="{ padding: '8px 0' }"
        :style="{ width: `${tableWidth}px` }"
        :row-style="rowStyle"
      >
        <el-table-column prop="protectLevel" :label="t('Prot')" :min-width="columnWidths.protectLevel" header-align="center" align="right" />
        <el-table-column prop="actionsFormatted" :label="t('次数')" :min-width="columnWidths.actionsFormatted" header-align="center" align="right" />
        <el-table-column prop="time" :label="t('时间')" :min-width="columnWidths.time" align="right" />
        <!-- <el-table-column prop="exp" :label="t('经验')" :min-width="100" align="right" /> -->
        <el-table-column prop="expPHFormat" :label="t('经验 / h')" :min-width="100" align="right" />

        <el-table-column v-for="item in enhancementCosts" :key="item.hrid" :min-width="100" header-align="center" align="right">
          <template #header>
            <ItemIcon class="mt-[8px]" :width="20" :height="20" :hrid="item.hrid" />
          </template>
          <template #default="{ row }">
            {{ Format.money(item.count * row.actions) }}
          </template>
        </el-table-column>

        <el-table-column prop="protectsFormatted" :label="t('保护')" :min-width="columnWidths.protectsFormatted" header-align="center" align="right" />
        <el-table-column prop="matCost" :label="t('材料费用')" :min-width="100" header-align="center" align="right" />
        <el-table-column prop="matCostPH" :label="t('损耗')" :min-width="120" header-align="center" align="right" />
        <el-table-column v-if="enhancerStore.config.tab === '1' && useGameStore().checkSecret()" prop="profitRateFormatted" :label="t('利润率')" :min-width="100" header-align="center" align="right" />
        <el-table-column v-if="enhancerStore.config.tab === '1' " prop="profitPPFormatted" :label="t('单个利润')" :min-width="100" header-align="center" align="right" />
        <el-table-column v-if="enhancerStore.config.tab === '1' " prop="hourlyCostFormatted" :label="t('工时费')" :min-width="100" header-align="center" align="right" />
        <el-table-column v-else prop="totalCostFormatted" :label="t('总费用')" :min-width="120" header-align="center" align="right" />
      </ElTable>
    </el-card>

    <el-dialog v-model="costGuideVisible" :title="t('成本指导价')" width="900px">
      <div v-loading="costGuideLoading">
        <template v-if="costGuideError">
          <div class="error">
            {{ costGuideError }}
          </div>
        </template>
        <template v-else>
          <div class="mb-2 flex items-center gap-2">
            <ItemIcon :hrid="currentItem.hrid" :width="28" :height="28" />
            <span>{{ t('从最低级物品开始制作链路') }}</span>
            <span class="ml-auto whitespace-nowrap">
              {{ t('总费用') }}:
              <strong>{{ getCostGuidePriceText(costGuideTotalCost) }}</strong>
            </span>
          </div>

          <div class="mb-2 flex flex-wrap items-center gap-2">
            <el-radio-group v-model="costGuideView" size="small">
              <el-radio-button label="leaf">
                {{ t('叶子材料汇总(推荐)') }}
              </el-radio-button>
              <el-radio-button label="tree">
                {{ t('完整链路') }}
              </el-radio-button>
            </el-radio-group>
            <el-input
              v-model="costGuideKeyword"
              style="width: 200px"
              :placeholder="t('搜索')"
              clearable
            />
            <el-checkbox v-model="costGuideOnlyUnknown">
              {{ t('仅显示无库存') }}
            </el-checkbox>
            <template v-if="costGuideView === 'tree'">
              <el-button size="small" @click="expandAllGuideRows">
                {{ t('展开全部') }}
              </el-button>
              <el-button size="small" @click="collapseAllGuideRows">
                {{ t('收起全部') }}
              </el-button>
            </template>
          </div>

          <template v-if="costGuideView === 'tree'">
            <ElTable
              :data="filteredCostGuideRows"
              row-key="id"
              :expand-row-keys="costGuideExpandedRowKeys"
              border
              :tree-props="{ children: 'children' }"
              class="mb-3"
            >
              <el-table-column :label="t('物品')" min-width="220">
                <template #default="{ row }">
                  <div class="flex items-center gap-2">
                    <ItemIcon :hrid="row.hrid" />
                    <span>{{ row.level ? `${t('等级')}+${row.level}` : "" }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="t('来源')" width="130" align="center">
                <template #default="{ row }">
                  {{ getCostGuideSourceLabel(row.source, row.project) }}
                </template>
              </el-table-column>
              <el-table-column prop="count" :label="t('数量')" width="120" align="right">
                <template #default="{ row }">
                  {{ Format.number(row.count, 4) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('价格')" width="150" align="right">
                <template #default="{ row }">
                  {{ getCostGuidePriceText(row.unitCost) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('成本')" width="150" align="right">
                <template #default="{ row }">
                  {{ getCostGuidePriceText(row.totalCost) }}
                </template>
              </el-table-column>
            </ElTable>
          </template>

          <template v-else>
            <ElTable :data="filteredCostGuideLeafRows" border>
              <el-table-column :label="t('物品')" min-width="220">
                <template #default="{ row }">
                  <div class="flex items-center gap-2">
                    <ItemIcon :hrid="row.hrid" />
                    <span>{{ row.level ? `${t('等级')}+${row.level}` : "" }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="count" :label="t('数量')" width="120" align="right">
                <template #default="{ row }">
                  {{ Format.number(row.count, 4) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('单价')" width="140" align="right">
                <template #default="{ row }">
                  {{ getLeafUnitCostText(row) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('成本')" width="150" align="right">
                <template #default="{ row }">
                  {{ getCostGuidePriceText(row.totalCost) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('占比')" width="110" align="right">
                <template #default="{ row }">
                  {{ getLeafShareText(row.totalCost) }}
                </template>
              </el-table-column>
            </ElTable>
          </template>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.error {
  color: #f56c6c;
}
.success {
  color: #67c23a;
}
.el-col {
  margin-bottom: 20px !important;
}

/* 隐藏单选框的圆形选择器 */
:deep(.el-radio__inner) {
  display: none;
}
:deep(.el-radio__label) {
  padding-left: 0;
  padding-top: 9px;
}
:deep(.el-radio.is-bordered) {
  padding: 9px;
}

.contextmenu {
  margin: 0;
  z-index: 3000;
  position: fixed;
  list-style-type: none;
  padding: 5px 0;
  border-radius: 4px;
  font-size: 12px;
  color: var(--v3-tagsview-contextmenu-text-color);
  background-color: var(--v3-tagsview-contextmenu-bg-color);
  box-shadow: var(--v3-tagsview-contextmenu-box-shadow);
  li {
    margin: 0;
    padding: 7px 16px;
    cursor: pointer;
    &:hover {
      color: var(--v3-tagsview-contextmenu-hover-text-color);
      background-color: var(--v3-tagsview-contextmenu-hover-bg-color);
    }
  }
}
</style>
