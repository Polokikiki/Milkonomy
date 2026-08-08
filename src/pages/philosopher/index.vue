<script lang="ts" setup>
import type { Action, ItemDetail } from "~/game"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import TieredPriceInput from "@@/components/TieredPriceInput/index.vue"
import * as Format from "@@/utils/format"
import { Star, StarFilled } from "@element-plus/icons-vue"
import { calculatePhilosopherEnhanceFlow, EnhanceCalculator } from "@/calculator/enhance"
import { ManufactureCalculator } from "@/calculator/manufacture"
import { getStorageCalculatorItem } from "@/calculator/utils"
import { WorkflowCalculator } from "@/calculator/workflow"
import { getItemDetailOf, getPriceOf } from "@/common/apis/game"
import { getEquipmentList } from "@/common/apis/player"
import { useMemory } from "@/common/composables/useMemory"
import { getEquipmentTypeOf } from "@/common/utils/game"
import { useEnhancerStore } from "@/pinia/stores/enhancer"
import { COIN_HRID } from "@/pinia/stores/game"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"

interface IngredientRow {
  hrid: string
  count: number
  level?: number
  originPrice: number
  price?: number
  fromWorkflow?: boolean
}

interface CurrentItemState {
  hrid?: string
  originPrice: number
  price?: number
  protection?: IngredientRow
}

interface NormalPlanRow {
  protectLevel: number
  actions: number
  protects: number
  matCost: number
  totalCostNoHourly: number
  totalCost: number
  seconds: number
  actionsFormatted: string
  protectsFormatted: string
  matCostFormatted: string
  totalCostFormatted: string
  time: string
}

interface NodeMaterialRow {
  key: string
  hrid: string
  count: number
  unitCost: number
  totalCost: number
}

interface NodeStepRow {
  level: number
  mode: "normal" | "philosopher"
  actions: number
  secondaryInputCount: number
  protectionCount: number
}

interface PhilosopherPlan {
  targetLevel: number
  protectLevel: number
  philosopherProtectLevel: number
  baseItemCount: number
  mirrorCount: number
  protectionCount: number
  totalActions: number
  totalCostNoHourly: number
  totalCost: number
  seconds: number
  materialRows: NodeMaterialRow[]
  stepRows: NodeStepRow[]
  childRequirements: Array<{ targetLevel: number, count: number }>
}

interface PlanNode {
  id: string
  depth: number
  hrid: string
  targetLevel: number
  requiredCount: number
  mode: "normal" | "philosopher"
  totalCostNoHourly: number
  totalCost: number
  seconds: number
  actions: number
  mirrorCount: number
  protectCount: number
  protectLevel?: number
  philosopherProtectLevel?: number
  perItemMaterialRows: NodeMaterialRow[]
  perItemStepRows: NodeStepRow[]
  perItemNormalRows: NormalPlanRow[]
  materialRows: NodeMaterialRow[]
  stepRows: NodeStepRow[]
  normalRows: NormalPlanRow[]
  children?: PlanNode[]
}

const { t } = useI18n()
const enhancerStore = useEnhancerStore()

const dialogVisible = ref(false)
const search = ref("")
const targetLevel = useMemory("philosopher-target-level", 18)
const useBlessedInPhilosopher = useMemory("philosopher-use-blessed-in-philosopher", false)
const hourlyRate = useMemory("philosopher-hourly-rate", 5000000)
const taxRate = useMemory("philosopher-tax-rate", 2)
const ignoreTax = useMemory("philosopher-ignore-tax", false)
const currentItem = ref<CurrentItemState>({
  protection: {} as IngredientRow,
  originPrice: 0
})
const enhancementCosts = ref<IngredientRow[]>([])
const protectionList = ref<IngredientRow[]>([])
const mirrorCost = ref<number | undefined>()
const gearManufacture = ref(false)
const bestManufacture = ref(false)
const manufactureIngredients = ref<IngredientRow[]>([])
const manufactureStepList = ref<{ title: string, ingredients: IngredientRow[] }[]>([])
const equipmentList = computed(() => {
  return getEquipmentList()
    .filter(item => t(item.name).toLocaleLowerCase().includes(search.value.toLowerCase()))
    .sort((a, b) => a.sortIndex - b.sortIndex)
})

const marketTaxRate = computed<number>({
  get: () => ignoreTax.value ? 0 : 2,
  set: (value: number) => {
    ignoreTax.value = value === 0
    taxRate.value = value
  }
})

function getBaseItemUnitCost() {
  if (!currentItem.value.hrid) return -1
  if (gearManufacture.value) return currentItem.value.originPrice
  return typeof currentItem.value.price === "number"
    ? currentItem.value.price
    : currentItem.value.originPrice
}

function getProtectionUnitCost() {
  return typeof currentItem.value.protection?.price === "number"
    ? currentItem.value.protection.price
    : (currentItem.value.protection?.originPrice ?? -1)
}

function getMirrorUnitCost() {
  const origin = getPriceOf("/items/philosophers_mirror").ask
  return typeof mirrorCost.value === "number" ? mirrorCost.value : origin
}

function getEnhancementUnitCostPerAction() {
  let total = 0
  for (const item of enhancementCosts.value) {
    const unit = typeof item.price === "number" ? item.price : item.originPrice
    if (unit < 0) return -1
    total += unit * item.count
  }
  return total
}

function isDrink(hrid: string) {
  return getItemDetailOf(hrid).categoryHrid === "/item_categories/drink"
}

function getGearCostOriginPrice(hrid: string, level?: number) {
  return getPriceOf(hrid, level).ask
}

function calcSingleStepIngredients(hrid: string) {
  const projects: [string, Action][] = [
    [t("锻造"), "cheesesmithing"],
    [t("制造"), "crafting"],
    [t("裁缝"), "tailoring"]
  ]
  let calc: ManufactureCalculator | undefined
  for (const [project, action] of projects) {
    const c = new ManufactureCalculator({ hrid, project, action })
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
      if (!manual.available) continue

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
        if (!nextManual.available) break
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
        if (!outputPH || outputPH <= 1e-12) continue

        let invalid = false
        const costPH = wf.ingredientListWithPrice
          .filter(ing => !isDrink(ing.hrid))
          .reduce((acc, ing) => {
            const countPH = ing.countPH || 0
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
        if (invalid) continue
        const costPerItem = costPH / outputPH

        if (!best || costPerItem < best.costPerItem) {
          best = { workflow: wf, outputPH, costPerItem }
        }
      }
    }
  }

  if (!best) return undefined

  const { workflow: wf, outputPH } = best
  const keyOf = (hrid2: string, level2?: number) => `${hrid2}|${level2 ?? ""}`

  const totalIngredients: IngredientRow[] = wf.ingredientListWithPrice
    .filter(ing => !isDrink(ing.hrid))
    .filter(ing => (ing.countPH || 0) > 1e-12)
    .map(ing => ({
      hrid: ing.hrid,
      count: (ing.countPH || 0) / outputPH,
      level: ing.level,
      originPrice: getGearCostOriginPrice(ing.hrid, ing.level)
    }))

  const stepList: { title: string, ingredients: IngredientRow[] }[] = []
  const producedBefore = new Set<string>()
  for (let i = 0; i < wf.calculatorList.length; i++) {
    const cal = wf.calculatorList[i]
    if (Array.isArray(cal)) continue

    const wm = wf.workMultiplier[i] as number
    const stepIngredients: IngredientRow[] = cal.ingredientListWithPrice
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

    for (const p of cal.productListWithPrice) {
      producedBefore.add(p.hrid)
      producedBefore.add(keyOf(p.hrid, p.level))
    }
  }

  return { totalIngredients, stepList }
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
    currentItem.value.originPrice = getGearCostOriginPrice(hrid)
    return
  }

  if (!bestManufacture.value) {
    manufactureIngredients.value = calcSingleStepIngredients(hrid)
    manufactureStepList.value = []
  } else {
    const bestPlan = calcBestManufacturePlan(hrid)
    if (!bestPlan) {
      manufactureIngredients.value = calcSingleStepIngredients(hrid)
      manufactureStepList.value = []
    } else {
      manufactureIngredients.value = bestPlan.totalIngredients
      manufactureStepList.value = bestPlan.stepList
    }
  }

  currentItem.value.originPrice = manufactureIngredients.value.length
    ? manufactureIngredients.value.reduce((acc, item) => {
        const price = typeof item.price === "number" ? item.price : item.originPrice
        return acc + price * item.count
      }, 0)
    : getGearCostOriginPrice(hrid)
}

function buildNormalRows(target: number) {
  const hrid = currentItem.value.hrid
  if (!hrid) return []
  const baseCost = getBaseItemUnitCost()
  const protectionCost = getProtectionUnitCost()
  if (baseCost < 0 || protectionCost < 0) return []

  const rows: NormalPlanRow[] = []
  for (let protectLevel = 1; protectLevel <= target; protectLevel++) {
    const calc = new EnhanceCalculator({
      hrid,
      enhanceLevel: target,
      protectLevel
    })
    if (!calc.available) continue

    const { actions, protects } = calc.enhancelate()
    const matCost = enhancementCosts.value.reduce((acc, item) => {
      const unit = typeof item.price === "number" ? item.price : item.originPrice
      return acc + unit * item.count * actions
    }, 0) + protectionCost * protects
    const totalCostNoHourly = baseCost + matCost
    let totalCost = totalCostNoHourly + hourlyRate.value * (actions / calc.actionsPH)
    if (!ignoreTax.value) {
      totalCost *= (1 + taxRate.value / 100)
    }
    const seconds = actions / calc.actionsPH * 3600
    rows.push({
      protectLevel,
      actions,
      protects,
      matCost,
      totalCostNoHourly,
      totalCost,
      seconds,
      actionsFormatted: Format.number(actions, 4),
      protectsFormatted: Format.number(protects, 4),
      matCostFormatted: Format.money(matCost),
      totalCostFormatted: Format.money(totalCost),
      time: Format.costTime(seconds * 1000000000)
    })
  }
  return rows
}

function buildDeterministicPhilosopherChildMap(target: number, philosopherProtectLevel: number) {
  const needs = new Map<number, number>()
  needs.set(target, 1)

  for (let level = target - 1; level >= philosopherProtectLevel; level--) {
    const actions = needs.get(level + 1) || 0
    if (actions <= 1e-10) continue
    needs.set(level, (needs.get(level) || 0) + actions)
    if (level - 1 > 0) {
      needs.set(level - 1, (needs.get(level - 1) || 0) + actions)
    }
  }

  needs.delete(target)
  for (const level of Array.from(needs.keys())) {
    if (level > philosopherProtectLevel || level <= 0) {
      needs.delete(level)
    }
  }
  return needs
}

function getBestPhilosopherPlan(target: number): PhilosopherPlan | null {
  const hrid = currentItem.value.hrid
  if (!hrid || target <= 1) return null

  const baseCost = getBaseItemUnitCost()
  const protectionCost = getProtectionUnitCost()
  const mirrorUnitCost = getMirrorUnitCost()
  const enhancementUnitCost = getEnhancementUnitCostPerAction()
  if (baseCost < 0 || mirrorUnitCost < 0 || enhancementUnitCost < 0) return null

  const normalRows = buildNormalRows(target)
  if (!normalRows.length) return null
  const bestNormalCost = Math.min(...normalRows.map(row => row.totalCost))
  const speedCalc = new EnhanceCalculator({ hrid, enhanceLevel: target, protectLevel: 1 })
  const actionsPH = speedCalc.actionsPH

  let best: PhilosopherPlan | null = null
  for (let philosopherProtectLevel = 1; philosopherProtectLevel < target; philosopherProtectLevel++) {
    for (let protectLevel = 1; protectLevel <= philosopherProtectLevel; protectLevel++) {
      const flow = calculatePhilosopherEnhanceFlow({
        hrid,
        targetLevel: target,
        protectLevel,
        philosopherProtectLevel,
        useBlessedInPhilosopher: useBlessedInPhilosopher.value
      })
      if (!flow) continue
      if (flow.protectionCount > 1e-10 && protectionCost < 0) continue

      const totalCostNoHourly = flow.baseItemCount * baseCost
        + flow.totalActions * enhancementUnitCost
        + flow.protectionCount * protectionCost
        + flow.mirrorCount * mirrorUnitCost
      const seconds = flow.totalActions / actionsPH * 3600
      let totalCost = totalCostNoHourly + hourlyRate.value * (flow.totalActions / actionsPH)
      if (!ignoreTax.value) {
        totalCost *= (1 + taxRate.value / 100)
      }

      const materialRows: NodeMaterialRow[] = [{
        key: `${hrid}|0`,
        hrid,
        count: flow.baseItemCount,
        unitCost: baseCost,
        totalCost: flow.baseItemCount * baseCost
      }, {
        key: "/items/philosophers_mirror",
        hrid: "/items/philosophers_mirror",
        count: flow.mirrorCount,
        unitCost: mirrorUnitCost,
        totalCost: flow.mirrorCount * mirrorUnitCost
      }]

      if (flow.protectionCount > 1e-10 && currentItem.value.protection?.hrid) {
        materialRows.push({
          key: `${currentItem.value.protection.hrid}|0`,
          hrid: currentItem.value.protection.hrid,
          count: flow.protectionCount,
          unitCost: protectionCost,
          totalCost: flow.protectionCount * protectionCost
        })
      }

      for (const item of enhancementCosts.value) {
        const unit = typeof item.price === "number" ? item.price : item.originPrice
        materialRows.push({
          key: `${item.hrid}|0`,
          hrid: item.hrid,
          count: flow.totalActions * item.count,
          unitCost: unit,
          totalCost: flow.totalActions * item.count * unit
        })
      }

      const childMap = buildDeterministicPhilosopherChildMap(target, philosopherProtectLevel)

      const candidate: PhilosopherPlan = {
        targetLevel: target,
        protectLevel,
        philosopherProtectLevel,
        baseItemCount: flow.baseItemCount,
        mirrorCount: flow.mirrorCount,
        protectionCount: flow.protectionCount,
        totalActions: flow.totalActions,
        totalCostNoHourly,
        totalCost,
        seconds,
        materialRows: materialRows.filter(row => row.count > 1e-10),
        stepRows: flow.steps.filter(step => step.actions > 1e-10),
        childRequirements: Array.from(childMap.entries())
          .map(([targetLevel2, count]) => ({ targetLevel: targetLevel2, count }))
          .sort((a, b) => a.targetLevel - b.targetLevel)
      }

      if (!best || candidate.totalCost < best.totalCost) {
        best = candidate
      }
    }
  }

  if (!best || best.totalCost >= bestNormalCost) {
    return null
  }
  return best
}

function scaleMaterialRows(rows: NodeMaterialRow[], multiplier: number) {
  return rows.map(row => ({
    ...row,
    count: row.count * multiplier,
    totalCost: row.totalCost * multiplier
  }))
}

function scaleStepRows(rows: NodeStepRow[], multiplier: number) {
  return rows.map(row => ({
    ...row,
    actions: row.actions * multiplier,
    secondaryInputCount: row.secondaryInputCount * multiplier,
    protectionCount: row.protectionCount * multiplier
  }))
}

function scaleNormalRows(rows: NormalPlanRow[], multiplier: number) {
  return rows.map(row => ({
    ...row,
    actions: row.actions * multiplier,
    protects: row.protects * multiplier,
    matCost: row.matCost * multiplier,
    totalCostNoHourly: row.totalCostNoHourly * multiplier,
    totalCost: row.totalCost * multiplier,
    seconds: row.seconds * multiplier,
    actionsFormatted: Format.number(row.actions * multiplier, 4),
    protectsFormatted: Format.number(row.protects * multiplier, 4),
    matCostFormatted: Format.money(row.matCost * multiplier),
    totalCostFormatted: Format.money(row.totalCost * multiplier),
    time: Format.costTime(row.seconds * multiplier * 1000000000)
  }))
}

function buildNormalMaterialRows(bestNormal: NormalPlanRow, multiplier: number): NodeMaterialRow[] {
  const rows: NodeMaterialRow[] = []
  const baseCost = getBaseItemUnitCost()
  if (currentItem.value.hrid) {
    rows.push({
      key: `${currentItem.value.hrid}|0`,
      hrid: currentItem.value.hrid,
      count: multiplier,
      unitCost: baseCost,
      totalCost: baseCost * multiplier
    })
  }
  if (bestNormal.protects > 1e-10 && currentItem.value.protection?.hrid) {
    const protectionCost = getProtectionUnitCost()
    rows.push({
      key: `${currentItem.value.protection.hrid}|normal`,
      hrid: currentItem.value.protection.hrid,
      count: bestNormal.protects * multiplier,
      unitCost: protectionCost,
      totalCost: protectionCost * bestNormal.protects * multiplier
    })
  }
  for (const item of enhancementCosts.value) {
    const unit = typeof item.price === "number" ? item.price : item.originPrice
    rows.push({
      key: `${item.hrid}|normal`,
      hrid: item.hrid,
      count: item.count * bestNormal.actions * multiplier,
      unitCost: unit,
      totalCost: unit * item.count * bestNormal.actions * multiplier
    })
  }
  return rows.filter(row => row.count > 1e-10)
}

let nodeId = 0
function nextNodeId() {
  nodeId++
  return `philosopher-node-${nodeId}`
}

function buildPlanNode(target: number, multiplier: number, depth: number): PlanNode | null {
  const normalRows = buildNormalRows(target)
  if (!normalRows.length) return null
  const bestNormal = normalRows.reduce((best, row) => row.totalCost < best.totalCost ? row : best, normalRows[0])
  const philosopherPlan = getBestPhilosopherPlan(target)

  if (philosopherPlan) {
    return {
      id: nextNodeId(),
      depth,
      hrid: currentItem.value.hrid!,
      targetLevel: target,
      requiredCount: multiplier,
      mode: "philosopher",
      totalCostNoHourly: philosopherPlan.totalCostNoHourly * multiplier,
      totalCost: philosopherPlan.totalCost * multiplier,
      seconds: philosopherPlan.seconds * multiplier,
      actions: philosopherPlan.totalActions * multiplier,
      mirrorCount: philosopherPlan.mirrorCount * multiplier,
      protectCount: philosopherPlan.protectionCount * multiplier,
      protectLevel: philosopherPlan.protectLevel,
      philosopherProtectLevel: philosopherPlan.philosopherProtectLevel,
      perItemMaterialRows: philosopherPlan.materialRows,
      perItemStepRows: philosopherPlan.stepRows,
      perItemNormalRows: normalRows,
      materialRows: scaleMaterialRows(philosopherPlan.materialRows, multiplier),
      stepRows: scaleStepRows(philosopherPlan.stepRows, multiplier),
      normalRows: scaleNormalRows(normalRows, multiplier),
      children: philosopherPlan.childRequirements
        .map(child => buildPlanNode(child.targetLevel, child.count * multiplier, depth + 1))
        .filter((node): node is PlanNode => !!node)
    }
  }

  return {
    id: nextNodeId(),
    depth,
    hrid: currentItem.value.hrid!,
    targetLevel: target,
    requiredCount: multiplier,
    mode: "normal",
    totalCostNoHourly: bestNormal.totalCostNoHourly * multiplier,
    totalCost: bestNormal.totalCost * multiplier,
    seconds: bestNormal.seconds * multiplier,
    actions: bestNormal.actions * multiplier,
    mirrorCount: 0,
    protectCount: bestNormal.protects * multiplier,
    protectLevel: bestNormal.protectLevel,
    perItemMaterialRows: buildNormalMaterialRows(bestNormal, 1),
    perItemStepRows: [],
    perItemNormalRows: normalRows,
    materialRows: buildNormalMaterialRows(bestNormal, multiplier),
    stepRows: [],
    normalRows: scaleNormalRows(normalRows, multiplier)
  }
}

const planRoot = computed(() => {
  const hrid = currentItem.value.hrid
  if (!hrid) return null
  if (targetLevel.value <= 0) return null
  nodeId = 0
  const root = buildPlanNode(targetLevel.value, 1, 0)
  if (!root || root.mode !== "philosopher") {
    return null
  }
  return root
})

function onSelect(item: ItemDetail) {
  enhancerStore.config.hrid = item.hrid
  currentItem.value = {
    hrid: item.hrid,
    originPrice: getGearCostOriginPrice(item.hrid)
  }
  enhancementCosts.value = item.enhancementCosts!.map(cost => ({
    hrid: cost.itemHrid,
    count: cost.count,
    originPrice: getPriceOf(cost.itemHrid).ask
  }))
  protectionList.value = item.protectionItemHrids
    ? item.protectionItemHrids.map(hrid => ({
        hrid,
        count: 1,
        originPrice: getPriceOf(hrid).ask
      }))
    : [{
        hrid: item.hrid,
        count: 1,
        originPrice: getPriceOf(item.hrid).ask
      }]

  protectionList.value.push({
    hrid: "/items/mirror_of_protection",
    count: 1,
    originPrice: getPriceOf("/items/mirror_of_protection").ask
  })

  currentItem.value.protection = protectionList.value.reduce((acc, item2) => acc.originPrice < item2.originPrice ? acc : item2)
  mirrorCost.value = undefined
  recalcManufacturePlan()
  dialogVisible.value = false
}

onMounted(() => {
  if (enhancerStore.hrid) {
    onSelect(getItemDetailOf(enhancerStore.hrid))
  }
})

watch([gearManufacture, bestManufacture], () => {
  recalcManufacturePlan()
})

watch(manufactureIngredients, () => {
  if (!gearManufacture.value) return
  currentItem.value.originPrice = manufactureIngredients.value.length
    ? manufactureIngredients.value.reduce((acc, item) => {
        const price = typeof item.price === "number" ? item.price : item.originPrice
        return acc + price * item.count
      }, 0)
    : getGearCostOriginPrice(currentItem.value.hrid!)
}, { deep: true })

watch(targetLevel, (value) => {
  if (value < 1) {
    targetLevel.value = 1
  }
  if (value > 20) {
    targetLevel.value = 20
  }
})

function getModeText(mode: PlanNode["mode"] | NodeStepRow["mode"]) {
  return mode === "philosopher" ? t("贤者镜") : t("普通强化")
}

function getRowClass({ row }: { row: PlanNode }) {
  return row.mode === "philosopher" ? "philosopher-row" : ""
}

function getPerItemActions(row: PlanNode) {
  if (row.mode === "philosopher") {
    return row.perItemStepRows.reduce((sum: number, step: NodeStepRow) => sum + step.actions, 0)
  }
  return row.perItemNormalRows[0]?.actions || 0
}

function normalCompareRowStyle(rows: NormalPlanRow[], current: NormalPlanRow) {
  const minTotalCost = Math.min(...rows.map(row => row.totalCost))
  const minMaterialCost = Math.min(...rows.map(row => row.totalCostNoHourly))
  if (current.totalCost === minTotalCost) {
    return { background: "rgb(34, 68, 34)" }
  }
  if (current.totalCostNoHourly === minMaterialCost) {
    return { background: "rgb(34, 51, 85)" }
  }
  return undefined
}

function mergeMaterialRows(rows: NodeMaterialRow[]) {
  const map = new Map<string, NodeMaterialRow>()
  for (const row of rows) {
    const current = map.get(row.hrid)
    if (current) {
      current.count += row.count
      current.totalCost += row.totalCost
    } else {
      map.set(row.hrid, { ...row })
    }
  }
  return Array.from(map.values())
}

function mergeStepRows(rows: NodeStepRow[]) {
  const map = new Map<string, NodeStepRow>()
  for (const row of rows) {
    const key = `${row.level}|${row.mode}`
    const current = map.get(key)
    if (current) {
      current.actions += row.actions
      current.secondaryInputCount += row.secondaryInputCount
      current.protectionCount += row.protectionCount
    } else {
      map.set(key, { ...row })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.level - b.level)
}

function mergeNormalRows(rows: NormalPlanRow[]) {
  const map = new Map<number, NormalPlanRow>()
  for (const row of rows) {
    const current = map.get(row.protectLevel)
    if (current) {
      current.actions += row.actions
      current.protects += row.protects
      current.matCost += row.matCost
      current.totalCostNoHourly += row.totalCostNoHourly
      current.totalCost += row.totalCost
      current.seconds += row.seconds
      current.actionsFormatted = Format.number(current.actions, 4)
      current.protectsFormatted = Format.number(current.protects, 4)
      current.matCostFormatted = Format.money(current.matCost)
      current.totalCostFormatted = Format.money(current.totalCost)
      current.time = Format.costTime(current.seconds * 1000000000)
    } else {
      map.set(row.protectLevel, { ...row })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.protectLevel - b.protectLevel)
}

function mergePlanNodes(nodes: PlanNode[]) {
  const first = nodes[0]
  return {
    ...first,
    id: `${first.id}-merged`,
    requiredCount: nodes.reduce((sum, node) => sum + node.requiredCount, 0),
    totalCostNoHourly: nodes.reduce((sum, node) => sum + node.totalCostNoHourly, 0),
    totalCost: nodes.reduce((sum, node) => sum + node.totalCost, 0),
    seconds: nodes.reduce((sum, node) => sum + node.seconds, 0),
    actions: nodes.reduce((sum, node) => sum + node.actions, 0),
    mirrorCount: nodes.reduce((sum, node) => sum + node.mirrorCount, 0),
    protectCount: nodes.reduce((sum, node) => sum + node.protectCount, 0),
    perItemMaterialRows: first.perItemMaterialRows,
    perItemStepRows: first.perItemStepRows,
    perItemNormalRows: first.perItemNormalRows,
    materialRows: mergeMaterialRows(nodes.flatMap(node => node.materialRows)),
    stepRows: mergeStepRows(nodes.flatMap(node => node.stepRows)),
    normalRows: mergeNormalRows(nodes.flatMap(node => node.normalRows)),
    children: nodes.flatMap(node => node.children || [])
  } as PlanNode
}

const planChildren = computed(() => {
  const root = planRoot.value
  if (!root?.children?.length) return []
  const threshold = root.philosopherProtectLevel ?? root.targetLevel
  const collected: PlanNode[] = []

  function dfs(node: PlanNode) {
    if (node.targetLevel <= threshold || !node.children?.length) {
      collected.push(node)
      return
    }
    node.children.forEach(dfs)
  }

  root.children.forEach(dfs)

  const grouped = new Map<string, PlanNode[]>()
  for (const node of collected) {
    const key = `${node.hrid}|${node.targetLevel}|${node.mode}|${node.protectLevel ?? ""}|${node.philosopherProtectLevel ?? ""}`
    const list = grouped.get(key) || []
    list.push(node)
    grouped.set(key, list)
  }

  return Array.from(grouped.values())
    .map(group => mergePlanNodes(group))
    .sort((a, b) => a.targetLevel - b.targetLevel)
})
</script>

<template>
  <div class="app-container">
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
              <span>{{ t('装备成本') }}</span>
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <el-checkbox v-model="gearManufacture">
                  {{ t('制作装备') }}
                </el-checkbox>
                <el-checkbox v-model="bestManufacture" :disabled="!gearManufacture">
                  {{ t('最佳制作方案') }}
                </el-checkbox>
              </div>
            </div>
          </template>
          <template v-if="gearManufacture && manufactureIngredients.length">
            <el-table :data="manufactureIngredients" style="--el-table-border-color:none" :cell-style="{ padding: '0' }">
              <el-table-column :label="t('物品')">
                <template #default="{ row }">
                  <ItemIcon :hrid="row.hrid" />
                </template>
              </el-table-column>
              <el-table-column :label="t('数量')">
                <template #default="{ row }">
                  {{ Format.number(row.count, 2) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('价格')" align="center" min-width="170">
                <template #default="{ row }">
                  <TieredPriceInput
                    v-if="row.hrid !== COIN_HRID"
                    class="max-w-100%"
                    v-model="row.price"
                    :min="-1"
                    :placeholder="Format.number(row.originPrice)"
                    :fallback-base="row.originPrice > 0 ? row.originPrice : 1"
                    width="100%"
                  />
                </template>
              </el-table-column>
            </el-table>
            <el-divider class="mt-2 mb-2" />
          </template>

          <template v-if="gearManufacture && bestManufacture && manufactureStepList.length">
            <div v-for="step in manufactureStepList" :key="step.title" class="mb-3">
              <div class="text-xs color-gray-500 mb-1">
                {{ step.title }}
              </div>
              <el-table :data="step.ingredients" style="--el-table-border-color:none" :cell-style="{ padding: '0' }" size="small">
                <el-table-column :label="t('物品')">
                  <template #default="{ row }">
                    <ItemIcon :hrid="row.hrid" />
                  </template>
                </el-table-column>
                <el-table-column :label="t('数量')">
                  <template #default="{ row }">
                    {{ Format.number(row.count, 4) }}
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <el-divider class="mt-2 mb-2" />
          </template>
          <el-table :data="[currentItem]" :show-header="false" style="--el-table-border-color:none">
            <el-table-column>
              <template #default="{ row }">
                <ItemIcon :hrid="row.hrid" />
              </template>
            </el-table-column>
            <el-table-column prop="count" />
            <el-table-column min-width="170" align="center">
              <template #default="{ row }">
                <TieredPriceInput
                  class="max-w-100%"
                  v-model="row.price"
                  :min="-1"
                  :placeholder="Format.number(row.originPrice)"
                  :fallback-base="row.originPrice > 0 ? row.originPrice : 1"
                  width="100%"
                  :disabled="gearManufacture"
                />
              </template>
            </el-table-column>
          </el-table>
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
          </div>
        </el-card>

        <el-card class="mt-2">
          <div class="flex justify-between items-center">
            <div class="font-size-14px">
              {{ t('工时费/h') }}
            </div>
            <TieredPriceInput
              class="w-120px"
              v-model="hourlyRate"
              :min="0"
              :max="5000000000"
              :placeholder="Format.number(5000000)"
              :fallback-base="5000000"
              width="120px"
            />
          </div>

          <div class="flex justify-between items-center mt-2">
            <div class="font-size-14px">
              {{ t('税率%') }}
            </div>
            <el-input-number
              class="w-120px"
              v-model="marketTaxRate"
              :min="0"
              :max="2"
              :step="2"
              :step-strictly="true"
              controls-position="right"
            />
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="24" :md="10" :lg="8" :xl="8" class="max-w-400px mx-auto">
        <el-card>
          <template #header>
            <span>{{ t('强化消耗') }}</span>
          </template>

          <el-table :data="enhancementCosts" style="--el-table-border-color:none;" :cell-style="{ padding: '0' }">
            <el-table-column :label="t('物品')" width="72">
              <template #default="{ row }">
                <ItemIcon :hrid="row.hrid" />
              </template>
            </el-table-column>
            <el-table-column :label="t('数量')" width="90" align="right">
              <template #default="{ row }">
                {{ Format.number(row.count, 2) }}
              </template>
            </el-table-column>
            <el-table-column :label="t('价格')" min-width="150" align="right">
              <template #default="{ row }">
                <TieredPriceInput
                  v-if="row.hrid !== COIN_HRID"
                  v-model="row.price"
                  :min="-1"
                  :placeholder="Format.number(row.originPrice)"
                  :fallback-base="row.originPrice > 0 ? row.originPrice : 1"
                  width="100%"
                />
              </template>
            </el-table-column>
          </el-table>

          <el-divider class="mt-2 mb-2" />

          <el-table :data="[{ hrid: '/items/philosophers_mirror', price: mirrorCost, originPrice: getPriceOf('/items/philosophers_mirror').ask }]" :show-header="false" style="--el-table-border-color:none">
            <el-table-column width="72">
              <template #default="{ row }">
                <ItemIcon :hrid="row.hrid" />
              </template>
            </el-table-column>
            <el-table-column />
            <el-table-column min-width="170" align="center">
              <template #default="{ row }">
                <TieredPriceInput
                  class="max-w-100%"
                  v-model="mirrorCost"
                  :min="-1"
                  :placeholder="Format.number(row.originPrice)"
                  :fallback-base="row.originPrice > 0 ? row.originPrice : 1"
                  width="100%"
                />
              </template>
            </el-table-column>
          </el-table>

          <el-divider class="mt-2 mb-2" />

          <el-table :data="[currentItem]" :show-header="false" style="--el-table-border-color:none">
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
                    <ItemIcon :hrid="item.hrid" />
                  </el-radio>
                </el-radio-group>
              </template>
            </el-table-column>
            <el-table-column min-width="170" align="center">
              <template #default="{ row }">
                <TieredPriceInput
                  class="max-w-100%"
                  v-model="row.protection.price"
                  :min="-1"
                  :placeholder="Format.number(row.protection?.originPrice || -1)"
                  :fallback-base="(row.protection?.originPrice || -1) > 0 ? (row.protection?.originPrice || -1) : 1"
                  width="100%"
                />
              </template>
            </el-table-column>
          </el-table>

          <el-divider class="mt-2 mb-2" />

          <el-table :data="[currentItem]" :show-header="false" style="--el-table-border-color:none">
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
                  :min="1"
                  :max="20"
                  v-model="targetLevel"
                  controls-position="right"
                />
              </template>
            </el-table-column>
          </el-table>

          <el-divider class="mt-2 mb-2" />

          <div class="flex items-center justify-between">
            <span>{{ t('贤者镜触发福气') }}</span>
            <el-switch v-model="useBlessedInPhilosopher" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="mx-auto mt-4 max-w-1200px">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <span>{{ t('贤者镜方案树') }}</span>
          <span v-if="planRoot" class="text-sm color-green-500">
            {{ t('总费用') }}: {{ Format.money(planRoot.totalCost) }}
          </span>
        </div>
      </template>

      <template v-if="!currentItem.hrid">
        <el-empty :description="t('请先选择装备')" />
      </template>
      <template v-else-if="!planRoot">
        <el-empty :description="t('当前价格下，未找到比普通强化更便宜的贤者镜方案')" />
      </template>
      <template v-else>
        <div class="mb-4 rounded border border-solid border-[var(--el-border-color)] p-4">
          <div class="mb-3 flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2">
              <ItemIcon :hrid="planRoot.hrid" />
              <strong>{{ t(getItemDetailOf(planRoot.hrid).name) }} +{{ planRoot.targetLevel }}</strong>
            </div>
            <div>{{ t('方案') }}: {{ getModeText(planRoot.mode) }}</div>
            <div>{{ t('普通保护起点') }}: {{ planRoot.protectLevel ? `+${planRoot.protectLevel}` : '-' }}</div>
            <div>{{ t('贤者镜起点') }}: {{ planRoot.philosopherProtectLevel ? `+${planRoot.philosopherProtectLevel}` : '-' }}</div>
            <div>{{ t('贤者镜数量') }}: {{ Format.number(planRoot.mirrorCount, 4) }}</div>
            <div>{{ t('期望耗时') }}: {{ Format.costTime(planRoot.seconds * 1000000000) }}</div>
            <div>{{ t('材料费用') }}: {{ Format.money(planRoot.totalCostNoHourly) }}</div>
            <div>{{ t('总费用') }}: {{ Format.money(planRoot.totalCost) }}</div>
          </div>

          <el-table :data="planRoot.materialRows" border>
            <el-table-column :label="t('主方案材料')" min-width="220">
              <template #default="{ row }">
                <div class="flex items-center gap-2">
                  <ItemIcon :hrid="row.hrid" />
                  <span>{{ t(getItemDetailOf(row.hrid).name) }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="t('数量')" width="140" align="right">
              <template #default="{ row }">
                {{ Format.number(row.count, 4) }}
              </template>
            </el-table-column>
            <el-table-column :label="t('成本')" width="160" align="right">
              <template #default="{ row }">
                {{ Format.money(row.totalCost) }}
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="mb-2 text-sm color-gray-500">
          {{ t('下方只展示目标物品直接需要的低级成品。展开后再看该等级的强化明细。') }}
        </div>

        <el-table
          :data="planChildren"
          row-key="id"
          border
          :row-class-name="getRowClass"
        >
          <el-table-column type="expand" width="48">
            <template #default="{ row }">
              <div class="p-3">
                <div class="mb-3 grid gap-2 text-sm md:grid-cols-3">
                  <div>{{ t('方案') }}: {{ getModeText(row.mode) }}</div>
                  <div>{{ t('单件期望次数') }}: {{ Format.number(getPerItemActions(row), 4) }}</div>
                  <div>{{ t('单件期望耗时') }}: {{ Format.costTime((row.requiredCount > 0 ? row.seconds / row.requiredCount : row.seconds) * 1000000000) }}</div>
                  <div>{{ t('普通保护起点') }}: {{ row.protectLevel ? `+${row.protectLevel}` : '-' }}</div>
                  <div>{{ t('贤者镜起点') }}: {{ row.philosopherProtectLevel ? `+${row.philosopherProtectLevel}` : '-' }}</div>
                  <div>{{ t('贤者镜数量') }}: {{ row.mode === 'philosopher' ? Format.number(row.mirrorCount, 4) : '-' }}</div>
                </div>

                <div class="mb-2 text-sm color-gray-500">
                  {{ t('以下详情按单个该等级物品计算；上方列表中的需求数量是总需求。') }}
                </div>

                <template v-if="row.children?.length">
                  <div class="mb-2 text-sm color-gray-500">
                    {{ t('该等级继续拆分后，还需要以下低级成品') }}
                  </div>
                  <el-table :data="row.children" border class="mb-4 w-full">
                    <el-table-column :label="t('物品')" min-width="200">
                      <template #default="{ row: child }">
                        <div class="flex items-center gap-2">
                          <ItemIcon :hrid="child.hrid" />
                          <span>{{ t(getItemDetailOf(child.hrid).name) }} +{{ child.targetLevel }}</span>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column :label="t('需求数量')" min-width="120" align="right">
                      <template #default="{ row: child }">
                        {{ Format.number(child.requiredCount, 4) }}
                      </template>
                    </el-table-column>
                    <el-table-column :label="t('方案')" min-width="110" align="center">
                      <template #default="{ row: child }">
                        {{ getModeText(child.mode) }}
                      </template>
                    </el-table-column>
                    <el-table-column :label="t('总费用')" min-width="140" align="right">
                      <template #default="{ row: child }">
                        {{ Format.money(child.totalCost) }}
                      </template>
                    </el-table-column>
                    <el-table-column :label="t('材料费用')" min-width="140" align="right">
                      <template #default="{ row: child }">
                        {{ Format.money(child.totalCostNoHourly) }}
                      </template>
                    </el-table-column>
                  </el-table>
                </template>

                <el-table :data="row.perItemMaterialRows" border class="mb-4 w-full">
                  <el-table-column :label="t('材料')" min-width="220">
                    <template #default="{ row: material }">
                      <div class="flex items-center gap-2">
                        <ItemIcon :hrid="material.hrid" />
                        <span>{{ t(getItemDetailOf(material.hrid).name) }}</span>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('数量')" min-width="120" align="right">
                    <template #default="{ row: material }">
                      {{ Format.number(material.count, 4) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('单价')" min-width="120" align="right">
                    <template #default="{ row: material }">
                      {{ Format.money(material.unitCost) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('成本')" min-width="140" align="right">
                    <template #default="{ row: material }">
                      {{ Format.money(material.totalCost) }}
                    </template>
                  </el-table-column>
                </el-table>

                <el-table v-if="row.perItemStepRows.length" :data="row.perItemStepRows" border class="mb-4 w-full">
                  <el-table-column :label="t('等级段')" min-width="120" align="center">
                    <template #default="{ row: step }">
                      +{{ step.level }} -> +{{ step.level + 1 }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('方式')" min-width="110" align="center">
                    <template #default="{ row: step }">
                      {{ getModeText(step.mode) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('期望次数')" min-width="120" align="right">
                    <template #default="{ row: step }">
                      {{ Format.number(step.actions, 4) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('额外低一级物品')" min-width="160" align="right">
                    <template #default="{ row: step }">
                      {{ step.mode === 'philosopher' ? Format.number(step.secondaryInputCount, 4) : '-' }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('保护消耗')" min-width="120" align="right">
                    <template #default="{ row: step }">
                      {{ step.protectionCount > 1e-10 ? Format.number(step.protectionCount, 4) : '-' }}
                    </template>
                  </el-table-column>
                </el-table>

                <div class="mb-2 text-sm color-gray-500">
                  {{ t('普通强化对比') }}
                </div>
                <el-table :data="row.perItemNormalRows" border class="w-full" :row-style="({ row: normalRow }) => normalCompareRowStyle(row.perItemNormalRows, normalRow)">
                  <el-table-column prop="protectLevel" :label="t('Prot')" min-width="80" align="right" />
                  <el-table-column prop="actionsFormatted" :label="t('次数')" min-width="110" align="right" />
                  <el-table-column prop="protectsFormatted" :label="t('保护')" min-width="110" align="right" />
                  <el-table-column prop="matCostFormatted" :label="t('材料费用')" min-width="120" align="right" />
                  <el-table-column prop="time" :label="t('时间')" min-width="130" align="right" />
                  <el-table-column prop="totalCostFormatted" :label="t('总费用')" min-width="150" align="right" />
                </el-table>
              </div>
            </template>
          </el-table-column>

          <el-table-column :label="t('低级成品')" min-width="240">
            <template #default="{ row }">
              <div class="flex items-center gap-2">
                <ItemIcon :hrid="row.hrid" />
                <span>{{ t(getItemDetailOf(row.hrid).name) }}</span>
                <span class="text-xs color-gray-500">+{{ row.targetLevel }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('需求数量')" width="130" align="right">
            <template #default="{ row }">
              {{ Format.number(row.requiredCount, 4) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('方案')" width="120" align="center">
            <template #default="{ row }">
              {{ getModeText(row.mode) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('最佳保护')" width="120" align="right">
            <template #default="{ row }">
              {{ row.protectLevel ? `+${row.protectLevel}` : '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('次数')" width="120" align="right">
            <template #default="{ row }">
              {{ Format.number(row.actions, 4) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('保护')" width="120" align="right">
            <template #default="{ row }">
              {{ row.protectCount > 1e-10 ? Format.number(row.protectCount, 4) : '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('时间')" width="160" align="right">
            <template #default="{ row }">
              {{ Format.costTime(row.seconds * 1000000000) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('总费用')" min-width="160" align="right">
            <template #default="{ row }">
              {{ Format.money(row.totalCost) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('材料费用')" min-width="160" align="right">
            <template #default="{ row }">
              {{ Format.money(row.totalCostNoHourly) }}
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-card>

    <el-dialog v-model="dialogVisible" :show-close="false">
      <el-input v-model="search" :placeholder="t('搜索')" />
      <div style="display:flex;flex-wrap:wrap;margin-top:10px">
        <el-button
          v-for="item in equipmentList"
          :key="item.hrid"
          style="width:50px;height:50px;margin:2px;"
          @click="onSelect(item)"
        >
          <ItemIcon :hrid="item.hrid" />
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
:deep(.philosopher-row) {
  --el-table-tr-bg-color: rgb(28 64 45 / 0.42);
}

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
</style>
