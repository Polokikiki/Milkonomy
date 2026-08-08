<script lang="ts" setup>
import type { Action, ItemDetail } from "~/game"
import ItemIcon from "@@/components/ItemIcon/index.vue"

import * as Format from "@@/utils/format"
import { Star, StarFilled } from "@element-plus/icons-vue"
import { ElTable } from "element-plus"
import { DecomposeCalculator } from "@/calculator/alchemy"
import { EnhanceCalculator } from "@/calculator/enhance"
import { ManufactureCalculator } from "@/calculator/manufacture"
import { getItemDetailOf, getMarketDataApi, getPriceOf, priceStepOf } from "@/common/apis/game"
import { getEquipmentList } from "@/common/apis/player"
import { useEnhancerStore } from "@/pinia/stores/enhancer"
import { COIN_HRID } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"

const enhancerStore = useEnhancerStore()
const { t } = useI18n()

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
const enhancementCosts = ref<Ingredient[]>([])
const protectionList = ref<Ingredient[]>([])

const currentDecompose = ref({
  ingredientList: [] as Ingredient[],
  productList: [] as Ingredient[],
  successRate: 0
})

const defaultConfig = {
  hourlyRate: 5000000,
  taxRate: 2,
  enhanceLevel: 10,
  originLevel: 0,
  escapeLevel: -1
}

onMounted(() => {
  enhancerStore.advancedConfig.hrid && onSelect(getItemDetailOf(enhancerStore.advancedConfig.hrid))
})

watch(
  () => enhancerStore.advancedConfig,
  () => {
    enhancerStore.saveAdvancedConfig()
  },
  { deep: true }
)

interface Ingredient {
  hrid: string
  count: number
  originPrice: number
  price?: number
  rate?: number
}
interface Item {
  hrid?: string
  originPrice: number
  price?: number
  escapePrice?: number
  whitePrice?: number
  productPrice?: number
  protection?: Ingredient
}

// Market tax rate: only 0% / 2%.
// Internally persist `ignoreTax` (0% => true, 2% => false).
const marketTaxRate = computed<number>({
  get: () => (enhancerStore.advancedConfig.ignoreTax ? 0 : 2),
  set: (value: number) => {
    enhancerStore.advancedConfig.ignoreTax = value === 0
  }
})
const sellTaxFactorComputed = computed(() => marketTaxRate.value === 0 ? 1 : 0.98)

function onSelect(item: ItemDetail) {
  if (!item) {
    return
  }
  enhancerStore.advancedConfig.hrid = item.hrid
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

  enhancementCosts.value = item.enhancementCosts!.map(item => ({
    hrid: item.itemHrid,
    count: item.count,
    originPrice: getPriceOf(item.itemHrid).ask
  }))

  protectionList.value = item.protectionItemHrids
    ? item.protectionItemHrids.map(hrid => ({
        hrid,
        count: 1,
        originPrice: getPriceOf(hrid).ask
      }))
    : []
  if (!protectionList.value.length) {
    protectionList.value.push({
      hrid: item.hrid,
      count: 1,
      originPrice: getPriceOf(item.hrid).ask
    })
  }

  protectionList.value.push({
    hrid: "/items/mirror_of_protection",
    count: 1,
    originPrice: getPriceOf("/items/mirror_of_protection").ask
  })

  // price最低的
  currentItem.value.protection = protectionList.value.reduce((acc: Ingredient, item) => {
    if (!acc) {
      return item
    }
    return acc.originPrice < item.originPrice ? acc : item
  })
  genDecompose()
}

function genDecompose() {
  if (!currentItem.value.hrid) {
    return
  }
  const decomposer = new DecomposeCalculator({
    hrid: currentItem.value.hrid,
    enhanceLevel: enhancerStore.advancedConfig.enhanceLevel ?? defaultConfig.enhanceLevel,
    catalystRank: 2
  })
  currentDecompose.value.ingredientList = decomposer.ingredientListWithPrice.slice(1, 3).map(item => ({
    ...item,
    originPrice: item.price,
    price: undefined
  }))
  currentDecompose.value.productList = decomposer.productListWithPrice.slice(0, -2).map(item => ({
    ...item,
    originPrice: item.price,
    price: undefined
  }))
  currentDecompose.value.successRate = decomposer.successRate
}

const currentItemOriginPrice = computed(() => {
  return getPriceOf(currentItem.value.hrid!, enhancerStore.advancedConfig.originLevel ?? defaultConfig.originLevel).ask
})

const currentItemWhitePrice = computed(() => {
  return getPriceOf(currentItem.value.hrid!).ask
})

const currentItemEscapePrice = computed(() => {
  return getPriceOf(currentItem.value.hrid!, Math.max(enhancerStore.advancedConfig.escapeLevel ?? defaultConfig.escapeLevel, 0)).ask
})

const currentDecomposePrice = computed(() => {
  const ing = currentDecompose.value.ingredientList.reduce((acc, item) => {
    const price = typeof item.price === "number" ? item.price : item.originPrice
    return acc + price * item.count * (item.rate || 1)
  }, 0)

  const pro = currentDecompose.value.productList.reduce((acc, item) => {
    const price = typeof item.price === "number" ? item.price : item.originPrice
    return acc + price * item.count * (item.rate || 1)
  }, 0)
  return (pro - ing) * currentDecompose.value.successRate
})

let _resultsRunCount = 0
const results = computed(() => {
  _resultsRunCount++
  if (!currentItem.value.hrid) {
    return []
  }

  console.time('[超级强化] results')
  const result = []
  const ignoreTax = !!enhancerStore.advancedConfig.ignoreTax
  const sellTaxFactor = ignoreTax ? 1 : 0.98
  const enhanceLevel = enhancerStore.advancedConfig.enhanceLevel ?? defaultConfig.enhanceLevel
  let protectLevel = Math.max(2, (enhancerStore.advancedConfig.escapeLevel ?? defaultConfig.escapeLevel) + 1)
  for (; protectLevel <= enhanceLevel; ++protectLevel) {
    const calc = new EnhanceCalculator({
      hrid: currentItem.value.hrid,
      enhanceLevel,
      protectLevel,
      originLevel: enhancerStore.advancedConfig.originLevel,
      escapeLevel: enhancerStore.advancedConfig.escapeLevel
    })
    if (!calc.available) {
      continue
    }

    const { actions, protects, targetRate, leapRate, escapeRate } = calc.enhancelate()
    const matCost
        = enhancementCosts.value.reduce((acc, item) => {
          const price = typeof item.price === "number" ? item.price : item.originPrice
          return acc + (price * item.count * actions)
        }, 0) + (typeof currentItem.value.protection?.price === "number"
          ? currentItem.value.protection!.price
          : currentItem.value.protection!.originPrice) * protects
    // 初始物品价格
    const curentItemPrice
          = typeof currentItem.value.price === "number"
            ? currentItem.value.price
            : currentItemOriginPrice.value
    const totalCostNoHourly = matCost + curentItemPrice
    let totalCost = totalCostNoHourly + (enhancerStore.advancedConfig.hourlyRate ?? defaultConfig.hourlyRate) * (actions / calc.actionsPH)
    if (!ignoreTax) {
      totalCost *= (1 + marketTaxRate.value / 100)
    }

    /**
     * tag = 0时，利用工时费计算指导价
        总成本 = 收入
        材料费用 + 总工时费 + 1个初始物品成本 = (成功率*指导价 + 逃逸率*逃逸价格或白板价格) * 98%
        因此 指导价 = (总成本 / 98% - 逃逸价格*逃逸率) / 成功率
     */

    const escapePrice = calc.realEscapeLevel === 0
      ? typeof currentItem.value.whitePrice === "number"
        ? currentItem.value.whitePrice
        : currentItemWhitePrice.value
      : (typeof currentItem.value.escapePrice === "number"
          ? currentItem.value.escapePrice
          : currentItemEscapePrice.value)

    // 逃逸损耗
    const fallingRate = (curentItemPrice - escapePrice * sellTaxFactor) / actions * calc.actionsPH

    /**
     * tag = 1时，利用指导价计算工时费
     *  总成本 = 收入
        材料费用 + 总工时费 + 1个初始物品成本 = (成功率*指导价 + 逃逸率*逃逸价格或白板价格) * 98%
        因此 总工时费 = (成功率*指导价 + 逃逸率*逃逸价格或白板价格) * 98% - 1个初始物品成本 - 材料费用
        每小时的工时费 = 总工时费  / actions * actionsPH
     */

    let productPrice = typeof currentItem.value.productPrice === "number"
      ? currentItem.value.productPrice
      : getPriceOf(currentItem.value.hrid, enhanceLevel).bid

    // 分解
    if (enhancerStore.advancedConfig.tab === "2") {
      productPrice = currentDecomposePrice.value
    }

    const hourlyCost = ((productPrice * (targetRate + leapRate) + escapePrice * escapeRate) * sellTaxFactor - totalCostNoHourly) / actions * calc.actionsPH

    // 单件利润
    const profitPP = (productPrice * (targetRate + leapRate) + escapePrice * escapeRate) * sellTaxFactor - totalCostNoHourly

    const guidePrice = (totalCost / sellTaxFactor - escapePrice * escapeRate) / (targetRate + leapRate)
    const seconds = actions / calc.actionsPH * 3600

    result.push({
      actions,
      actionsFormatted: Format.number(actions, 2),
      protects,
      protectsFormatted: Format.number(protects, 2),
      protectLevel,
      targetRateFormatted: Format.percent(targetRate + leapRate),
      leapRateFormatted: Format.percent(leapRate),
      escapeRateFormatted: Format.percent(escapeRate),
      realEscapeLevel: calc.realEscapeLevel,
      time: Format.costTime(seconds * 1000000000),
      successTime: Format.costTime(seconds * 1000000000 / (targetRate + leapRate)),
      expPHFormat: Format.money(calc.exp * calc.actionsPH),
      matCost: Format.money(matCost),
      totalCostFormatted: Format.money(guidePrice),
      profitPPFormatted: Format.money(profitPP),
      profitRate: profitPP / totalCostNoHourly,
      profitRateFormatted: Format.percent(profitPP / totalCostNoHourly),
      totalCost: guidePrice,
      totalCostNoHourly,
      matCostPH: `${Format.money(matCost / seconds * 3600)} / h`,
      fallingRatePH: `${Format.money(fallingRate)} / h`,
      hourlyCost,
      hourlyCostFormatted: Format.money(hourlyCost)
    })
  }
  console.timeEnd('[超级强化] results')
  console.log('[超级强化] #' + _resultsRunCount, '强化等级:', enhanceLevel, '行数:', result.length)
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
], () => enhancerStore.advancedConfig.hrid && onSelect(getItemDetailOf(enhancerStore.advancedConfig.hrid)), { immediate: false })

let _syncingProductPriceTier = false
let _syncingItemPriceTier = false
let _syncingEscapePriceTier = false
let _syncingWhitePriceTier = false
let _syncingEnhancementCostPriceTier = false
let _syncingProtectionPriceTier = false

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
    // 从 -1 向上恢复时，先回到 1，避免出现异常大跳
    return 1
  } else if (isOldNumber && Math.abs(Math.abs(delta) - 1) < 1e-9) {
    high = delta > 0
    base = oldValue
  } else if (!isOldNumber && (value === -1 || value === 0 || value === 1)) {
    // 空值状态点 +/-：以市场价为基准做档位跳价
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

function onProductPriceChange(value: number | undefined, oldValue: number | undefined) {
  if (_syncingProductPriceTier || !currentItem.value.hrid) return
  const marketPrice = getPriceOf(currentItem.value.hrid, enhancerStore.advancedConfig.enhanceLevel ?? defaultConfig.enhanceLevel).bid
  const next = resolveTierStep(value, oldValue, marketPrice)
  if (!next) return
  _syncingProductPriceTier = true
  currentItem.value.productPrice = next
  nextTick(() => {
    _syncingProductPriceTier = false
  })
}

function onItemPriceChange(value: number | undefined, oldValue: number | undefined) {
  if (_syncingItemPriceTier || !currentItem.value.hrid) return
  const marketPrice = currentItemOriginPrice.value
  const next = resolveTierStep(value, oldValue, marketPrice)
  if (!next) return
  _syncingItemPriceTier = true
  currentItem.value.price = next
  nextTick(() => {
    _syncingItemPriceTier = false
  })
}

function onEscapePriceChange(value: number | undefined, oldValue: number | undefined) {
  if (_syncingEscapePriceTier || !currentItem.value.hrid) return
  const next = resolveTierStep(value, oldValue, currentItemEscapePrice.value)
  if (!next) return
  _syncingEscapePriceTier = true
  currentItem.value.escapePrice = next
  nextTick(() => {
    _syncingEscapePriceTier = false
  })
}

function onWhitePriceChange(value: number | undefined, oldValue: number | undefined) {
  if (_syncingWhitePriceTier || !currentItem.value.hrid) return
  const next = resolveTierStep(value, oldValue, currentItemWhitePrice.value)
  if (!next) return
  _syncingWhitePriceTier = true
  currentItem.value.whitePrice = next
  nextTick(() => {
    _syncingWhitePriceTier = false
  })
}

function onEnhancementCostPriceChange(row: Ingredient, value: number | undefined, oldValue: number | undefined) {
  if (_syncingEnhancementCostPriceTier || row.hrid === COIN_HRID) return
  const next = resolveTierStep(value, oldValue, row.originPrice)
  if (!next) return
  _syncingEnhancementCostPriceTier = true
  row.price = next
  nextTick(() => {
    _syncingEnhancementCostPriceTier = false
  })
}

function onProtectionPriceChange(row: Item, value: number | undefined, oldValue: number | undefined) {
  if (_syncingProtectionPriceTier || !row.protection) return
  const next = resolveTierStep(value, oldValue, row.protection.originPrice)
  if (!next) return
  _syncingProtectionPriceTier = true
  row.protection.price = next
  nextTick(() => {
    _syncingProtectionPriceTier = false
  })
}

function rowStyle({ row }: { row: any }) {
  // 利润率最高的为绿色，工时费最高的为蓝色

  if (row.profitRate === Math.max(...results.value.map(item => item.profitRate))) {
    return { background: "rgb(34, 68, 34)" }
  }
  if (row.hourlyCost === Math.max(...results.value.map(item => item.hourlyCost))) {
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
      <li v-if="!enhancerStore.hasAdvancedFavorite(selectedTag)" @click="enhancerStore.addAdvancedFavorite(selectedTag)">
        收藏
      </li>
      <li v-else @click="enhancerStore.removeAdvancedFavorite(selectedTag)">
        取消收藏
      </li>
    </ul>
    <div class="game-info">
      <GameInfo />
      <div>
        <ActionConfig :actions="['enhancing', 'alchemy']" :equipments="['hands', 'neck', 'earrings', 'ring', 'pouch']" />
      </div>
    </div>
    <el-row :gutter="20" class="row max-w-1100px mx-auto!">
      <el-col :xs="24" :sm="24" :md="10" :lg="8" :xl="8" class="max-w-400px mx-auto">
        <el-card>
          <template #header>
            <div class="flex justify-between items-center">
              <span>{{ t('装备成本') }}</span>
            </div>
          </template>

          <ElTable :data="[currentItem]" :show-header="false" style="--el-table-border-color:none">
            <el-table-column>
              <template #default="{ row }">
                <ItemIcon :hrid="row.hrid" />
              </template>
            </el-table-column>
            <el-table-column min-width="120" align="center">
              <template #default="{ row }">
                <el-input-number
                  class="max-w-100%"
                  v-model="row.price"
                  :min="-1"
                  :placeholder="Format.number(currentItemOriginPrice)"
                  :controls="true"
                  controls-position="right"
                  @change="onItemPriceChange"
                />
              </template>
            </el-table-column>
          </ElTable>

          <ElTable :data="[currentItem]" :show-header="false" style="--el-table-border-color:none">
            <el-table-column>
              <template #default>
                {{ t('初始等级') }}:
              </template>
            </el-table-column>
            <el-table-column min-width="120" align="center">
              <template #default>
                <el-input-number
                  class="max-w-100%"
                  :max="(enhancerStore.advancedConfig.enhanceLevel ?? defaultConfig.enhanceLevel) - 1"
                  :min="0"
                  v-model="enhancerStore.advancedConfig.originLevel"
                  :placeholder="Format.number(defaultConfig.originLevel)"
                  controls-position="right"
                />
              </template>
            </el-table-column>
          </ElTable>

          <ElTable :data="[currentItem]" :show-header="false" style="--el-table-border-color:none">
            <el-table-column>
              <template #default>
                <el-tooltip placement="top" effect="light">
                  <template #content>
                    {{ t('#逃逸等级提示') }}
                  </template>
                  <div class="flex items-center">
                    <el-icon>
                      <Warning />
                    </el-icon>
                    <div class="w-200px">
                      {{ t('逃逸等级') }}:
                    </div>
                  </div>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column min-width="120" align="center">
              <template #default>
                <el-input-number
                  class="max-w-100%"
                  :max="(enhancerStore.advancedConfig.originLevel ?? defaultConfig.originLevel) - 1"
                  :min="-1"
                  v-model="enhancerStore.advancedConfig.escapeLevel"
                  :placeholder="Format.number(defaultConfig.escapeLevel)"
                  controls-position="right"
                />
              </template>
            </el-table-column>
          </ElTable>

          <ElTable :data="[currentItem]" :show-header="false" style="--el-table-border-color:none">
            <el-table-column>
              <template #default>
                <el-tooltip placement="top" effect="light">
                  <template #content>
                    {{ t('#逃逸价格提示') }}
                  </template>
                  <div class="flex items-center">
                    <el-icon>
                      <Warning />
                    </el-icon>
                    <div class="w-200px">
                      {{ t('逃逸价格') }}:
                    </div>
                  </div>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column min-width="120" align="center">
              <template #default="{ row }">
                <el-input-number
                  class="max-w-100%"
                  v-model="row.escapePrice"
                  :min="-1"
                  :placeholder="Format.number(currentItemEscapePrice)"
                  :controls="true"
                  controls-position="right"
                  @change="onEscapePriceChange"
                />
              </template>
            </el-table-column>
          </ElTable>

          <ElTable :data="[currentItem]" :show-header="false" style="--el-table-border-color:none">
            <el-table-column>
              <template #default>
                <el-tooltip placement="top" effect="light">
                  <template #content>
                    {{ t('#白板价格提示') }}
                  </template>
                  <div class="flex items-center">
                    <el-icon>
                      <Warning />
                    </el-icon>
                    <div class="w-200px">
                      {{ t('白板价格') }}:
                    </div>
                  </div>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column min-width="120" align="center">
              <template #default="{ row }">
                <el-input-number
                  class="max-w-100%"
                  v-model="row.whitePrice"
                  :min="-1"
                  :placeholder="Format.number(currentItemWhitePrice)"
                  :controls="true"
                  controls-position="right"
                  @change="onWhitePriceChange"
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
              <el-link v-if="!enhancerStore.hasAdvancedFavorite(currentItem.hrid)" :underline="false" type="info" :icon="Star" @click="enhancerStore.addAdvancedFavorite(currentItem.hrid)" style="font-size:42px" />
              <el-link v-else :underline="false" :icon="StarFilled" type="primary" @click="enhancerStore.removeAdvancedFavorite(currentItem.hrid)" style="font-size:42px" />
            </div>
            <el-dialog
              v-model="dialogVisible"
              :show-close="false"
            >
              <el-input v-model="search" :placeholder="t('搜索')" />
              <template v-if="enhancerStore.advancedFavorite.length && !search">
                <el-divider class="mt-2 mb-2" />
                <div class="mb-2 color-gray-500">
                  {{ t('收藏') }}
                  <span color-gray-600>
                    ({{ t('右键/长按取消收藏') }})</span>
                </div>
                <div class="flex flex-wrap">
                  <el-button
                    v-for="hrid in enhancerStore.advancedFavorite"
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

                  <div v-if="enhancerStore.hasAdvancedFavorite(item.hrid)" class="absolute bottom-0 right-0">
                    <el-link :underline="false" :icon="StarFilled" type="primary" style="font-size:16px" />
                  </div>
                </el-button>
              </div>
            </el-dialog>
          </div>
        </el-card>

        <el-card class="mt-2">
          <el-tabs v-model="enhancerStore.advancedConfig.tab" type="border-card" stretch>
            <el-tab-pane :label="t('工时费')">
              <div class="flex justify-between items-center">
                <div class="font-size-14px">
                  {{ t('工时费/h') }}
                </div>
                <el-input-number
                  class="w-120px"
                  v-model="enhancerStore.advancedConfig.hourlyRate"
                  :step="1"
                  :min="0"
                  :max="500000000"
                  :placeholder="defaultConfig.hourlyRate.toString()"
                  :controls="false"
                />
              </div>

              <div class="flex justify-between items-center">
                <div class="font-size-14px">
                  {{ t('溢价率%') }}
                </div>
                <el-input-number
                  class="w-120px"
                  v-model="marketTaxRate"
                  :step="2"
                  :step-strictly="true"
                  :min="0"
                  :max="2"
                  controls-position="right"
                  :controls="true"
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
                  :placeholder="Format.number(getPriceOf(currentItem.hrid!, enhancerStore.advancedConfig.enhanceLevel ?? defaultConfig.enhanceLevel).bid)"
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

            <el-tab-pane :label="t('分解')">
              <div v-for="item in currentDecompose.ingredientList" :key="item.hrid" class="flex justify-between items-center">
                <div class="font-size-14px flex items-center justify-between">
                  <div>
                    <ItemIcon :hrid="item.hrid" class="inline-block mr-1" />
                  </div>
                  <div>{{ Format.number(item.count * (item.rate || 1), 2) }}</div>
                </div>
                <el-input-number
                  class="w-100px"
                  v-model="item.price"
                  :placeholder="Format.number(item.originPrice)"
                  :controls="false"
                  :disabled="item.hrid === COIN_HRID"
                />
              </div>

              <!-- 分割线 -->
              <el-divider class="mt-5px mb-5px" />

              <div v-for="item in currentDecompose.productList" :key="item.hrid" class="flex justify-between items-center">
                <div class="font-size-14px flex items-center justify-between">
                  <div>
                    <ItemIcon :hrid="item.hrid" class="inline-block mr-1" />
                  </div>
                  <div>{{ Format.number(item.count * (item.rate || 1), 2) }}</div>
                </div>
                <el-input-number
                  class="w-100px"
                  v-model="item.price"
                  :placeholder="Format.number(item.originPrice)"
                  :controls="false"
                />
              </div>

              <div class="flex mt-1px mb-2px justify-between items-center">
                <div class="font-size-14px">
                  {{ t('成功率') }}
                </div>

                <el-tag class="w-100px " type="success" size="large">
                  {{ currentDecompose.successRate && Format.percent(currentDecompose.successRate) }}
                </el-tag>
              </div>
              <div class="flex justify-between items-center">
                <div class="font-size-14px w-100px">
                  {{ t('分解税后收益') }}
                </div>

                <el-tag class="w-100px " type="success" size="large">
                  {{ currentDecomposePrice && Format.money(currentDecomposePrice * sellTaxFactorComputed) }}
                </el-tag>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="10" :lg="8" :xl="8" class="max-w-400px mx-auto">
        <el-card :header="t('强化消耗')">
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
            <el-table-column :label="t('价格')" align="center" min-width="120">
              <template #default="{ row }">
                <el-input-number
                  v-if="row.hrid !== COIN_HRID"
                  class="max-w-100%"
                  v-model="row.price"
                  :min="-1"
                  :placeholder="Format.number(row.originPrice)"
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
            <el-table-column min-width="120" align="center">
              <template #default="{ row }">
                <el-input-number
                  class="max-w-100%"
                  v-model="row.protection.price"
                  :min="-1"
                  :placeholder="Format.number(row.protection.originPrice)"
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
                  v-model="enhancerStore.advancedConfig.enhanceLevel"
                  :placeholder="Format.number(defaultConfig.enhanceLevel)"
                  @change="genDecompose"
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
        <!-- <el-table-column prop="matCost" :label="t('材料费用')" :min-width="100" header-align="center" align="right" /> -->
        <el-table-column prop="matCostPH" :label="t('材料损耗')" :min-width="120" header-align="center" align="right" />
        <el-table-column prop="fallingRatePH" :label="t('逃逸损耗')" :min-width="120" header-align="center" align="right">
          <template #header>
            <div style="display: flex; justify-content: center; align-items: center; gap: 5px">
              <div>{{ t('逃逸损耗') }}</div>
              <el-tooltip placement="top" effect="light">
                <template #content>
                  {{ t('#逃逸损耗提示') }}
                </template>
                <el-icon>
                  <Warning />
                </el-icon>
              </el-tooltip>
            </div>
          </template>
          <template #default="{ row }">
            {{ row.fallingRatePH }}
          </template>
        </el-table-column>
        <template v-if="enhancerStore.advancedConfig.tab !== '0'">
          <el-table-column prop="profitPPFormatted" :label="t('利润 / 件')" :min-width="100" header-align="center" align="right">
            <template #header>
              <div style="display: flex; justify-content: center; align-items: center; gap: 5px">
                <div>{{ t('利润 / 件') }}</div>
                <el-tooltip placement="top" effect="light">
                  <template #content>
                    {{ t('#超级强化利润/件提示') }}
                  </template>
                  <el-icon>
                    <Warning />
                  </el-icon>
                </el-tooltip>
              </div>
            </template>

            <template #default="{ row }">
              {{ row.profitPPFormatted }}
            </template>
          </el-table-column>
          <el-table-column prop="hourlyCostFormatted" :label="t('工时费')" :min-width="100" header-align="center" align="right" />
          <el-table-column prop="profitRateFormatted" :label="t('利润率')" :min-width="100" header-align="center" align="right" />
        </template>
        <el-table-column v-else prop="totalCostFormatted" :label="t('指导价')" :min-width="120" header-align="center" align="right">
          <template #header>
            <div style="display: flex; justify-content: center; align-items: center; gap: 5px">
              <div>{{ t('指导价') }}</div>
              <el-tooltip placement="top" effect="light">
                <template #content>
                  总成本 = 材料费用 + 工时费 + 1个初始物品成本
                  <br>
                  总收入 = (成功率*指导价 + 逃逸率*逃逸价格或白板价格) * 98%
                  <br>
                  总成本 = 总收入
                  <br>
                  ∴ 指导价 = (总成本 / 98% - 逃逸率*逃逸价格或白板价格) / 成功率
                </template>
                <el-icon>
                  <Warning />
                </el-icon>
              </el-tooltip>
            </div>
          </template>
          <template #default="{ row }">
            {{ row.totalCostFormatted }}
          </template>
        </el-table-column>
        <el-table-column prop="targetRateFormatted" :label="t('成功率')" :min-width="80" header-align="center" align="right" />
        <!-- <el-table-column prop="leapRateFormatted" :label="t('祝福率')" :min-width="80" header-align="center" align="right" /> -->
        <!-- <el-table-column prop="escapeRateFormatted" :label="t('逃逸率')" :min-width="80" header-align="center" align="right" /> -->
        <el-table-column prop="successTime" :label="t('期望耗时')" :min-width="columnWidths.successTime" header-align="center" align="right" />
        <el-table-column prop="realEscapeLevel" :label="t('逃逸等级')" :min-width="90" header-align="center" align="right" />
      </ElTable>
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
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
