<script lang="ts" setup>
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { useMemory } from "@@/composables/useMemory"
import { ElMessage } from "element-plus"
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { computeDecomposeChain, computeTransmuteChain } from "@/calculator/alchemyChain"
import { getGameDataApi, getItemDetailOf } from "@/common/apis/game"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { NO_TAX_FACTOR, SELL_TAX_FACTOR } from "@/common/constants/market"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

const { t } = useI18n()

const search = ref("")
const selectedHrid = ref("")
const chainType = useMemory("alchemy-chain-type", "decompose")
const mode = useMemory("alchemy-chain-mode", "smart")
const catalystRank = useMemory("alchemy-chain-catalyst-rank", 0)
const includeTax = useMemory("alchemy-chain-include-tax", true)
const includeRare = useMemory("alchemy-chain-include-rare", true)

const onPriceStatusChange = usePriceStatus("alchemy-chain-price-status")
function handlePriceStatusChange() {
  onPriceStatusChange()
  if (selectedHrid.value) compute()
}

// 只有可分解/可转化的物品才有链可走
const chainableItemList = computed(() => {
  const gameData = getGameDataApi()
  if (!gameData) return []
  return Object.values(gameData.itemDetailMap)
    .filter(item => item.isTradable && (item.alchemyDetail?.decomposeItems || item.alchemyDetail?.transmuteDropTable))
    .sort((a, b) => a.sortIndex - b.sortIndex)
})

const filteredItemList = computed(() => {
  const kw = search.value.toLowerCase()
  const list = chainableItemList.value
  if (!kw) return list.slice(0, 200)
  return list.filter(item => t(item.name).toLowerCase().includes(kw)).slice(0, 200)
})

function selectItem(hrid: string) {
  selectedHrid.value = hrid
}

const loading = ref(false)
const decomposeResult = ref<ReturnType<typeof computeDecomposeChain> | null>(null)
const transmuteResult = ref<ReturnType<typeof computeTransmuteChain> | null>(null)

const itemName = (hrid: string) => t(getItemDetailOf(hrid)?.name ?? hrid)

function fmtMoney(value: number) {
  if (value < 0) return t("无单")
  return Math.round(value).toLocaleString("en-US")
}

function compute() {
  if (!selectedHrid.value) {
    ElMessage.warning(t("请先选择物品"))
    return
  }
  loading.value = true
  setTimeout(() => {
    try {
      const opts = {
        mode: mode.value as "smart" | "all",
        catalystRank: catalystRank.value,
        sellTaxFactor: includeTax.value ? SELL_TAX_FACTOR : NO_TAX_FACTOR,
        includeRare: includeRare.value
      }
      decomposeResult.value = computeDecomposeChain(selectedHrid.value, opts)
      transmuteResult.value = computeTransmuteChain(selectedHrid.value, opts)
    } catch (e) {
      console.error(e)
      ElMessage.error(t("计算失败，请打开控制台查看错误"))
    } finally {
      loading.value = false
    }
  }, 50)
}

// 换物品/换设置后旧结果作废
watch([selectedHrid, mode, catalystRank, includeTax, includeRare], () => {
  decomposeResult.value = null
  transmuteResult.value = null
})

// 链条树打平为缩进行（el-table 树形在数据量小时也行，但打平可控性更好）
interface FlatRow {
  hrid: string
  depth: number
  count: number
  advice: string
  value: number
  profitPHFormat?: string
}

const flatDecomposeRows = computed<FlatRow[]>(() => {
  const result = decomposeResult.value
  if (!result) return []
  const rows: FlatRow[] = []
  const walk = (row: typeof result.rows[number]) => {
    rows.push({
      hrid: row.hrid,
      depth: row.depth,
      count: row.count,
      advice: row.advice,
      value: row.value,
      profitPHFormat: (row.calc?.result as { profitPHFormat?: string } | undefined)?.profitPHFormat
    })
    row.children.forEach(walk)
  }
  result.rows.forEach(walk)
  return rows
})

const chainDelta = computed(() => {
  const result = chainType.value === "decompose" ? decomposeResult.value : transmuteResult.value
  if (!result || result.directSellValue < 0) return null
  return result.totalValue - result.directSellValue
})
</script>

<template>
  <div class="app-container">
    <div class="game-info">
      <GameInfo />
      <div>
        <ActionConfig :actions="['alchemy']" />
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
        <el-card>
          <template #header>
            <span>{{ t('选择物品') }}</span>
          </template>
          <el-input v-model="search" :placeholder="t('搜索可分解/可转化物品')" clearable />
          <div class="flex flex-wrap mt-2" style="max-height: 420px; overflow-y: auto">
            <el-button
              v-for="item in filteredItemList"
              :key="item.hrid"
              class="item-cell"
              style="width: 50px; height: 50px; margin: 2px;"
              :type="selectedHrid === item.hrid ? 'primary' : ''"
              :plain="selectedHrid !== item.hrid"
              @click="selectItem(item.hrid)"
            >
              <ItemIcon :hrid="item.hrid" />
            </el-button>
            <div v-if="filteredItemList.length === 0" class="color-gray-500 font-size-13px" style="padding: 12px 4px">
              {{ t('无匹配物品') }}
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
        <el-card>
          <template #header>
            <div class="flex items-center justify-between">
              <span>{{ t('链条设置') }}</span>
              <PriceStatusSelect @change="handlePriceStatusChange" />
            </div>
          </template>
          <div class="flex flex-col gap-3">
            <div class="flex items-center flex-wrap gap-2">
              <span>{{ t('链条类型') }}</span>
              <el-radio-group v-model="chainType" size="small">
                <el-radio-button label="decompose">
                  {{ t('分解链') }}
                </el-radio-button>
                <el-radio-button label="transmute">
                  {{ t('转化链') }}
                </el-radio-button>
              </el-radio-group>
            </div>
            <div class="flex items-center flex-wrap gap-2">
              <span>{{ t('处置模式') }}</span>
              <el-radio-group v-model="mode" size="small">
                <el-radio-button label="smart">
                  {{ t('智能（只走更优的分支）') }}
                </el-radio-button>
                <el-radio-button label="all">
                  {{ t('强制到底') }}
                </el-radio-button>
              </el-radio-group>
            </div>
            <div class="flex items-center flex-wrap gap-2">
              <span>{{ t('催化剂') }}</span>
              <el-radio-group v-model="catalystRank" size="small">
                <el-radio-button :label="0">
                  {{ t('无') }}
                </el-radio-button>
                <el-radio-button :label="1">
                  {{ t('普通') }}
                </el-radio-button>
                <el-radio-button :label="2">
                  {{ t('至高') }}
                </el-radio-button>
              </el-radio-group>
            </div>
            <div class="flex items-center flex-wrap gap-4">
              <el-checkbox v-model="includeTax" :label="t('计税')" />
              <el-checkbox v-model="includeRare" :label="t('稀有掉落')" />
            </div>
            <el-button type="primary" :loading="loading" @click="compute">
              {{ t('计算链条') }}
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="decomposeResult || transmuteResult" class="mt-4">
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span>{{ t('链条结果') }}：{{ selectedHrid ? itemName(selectedHrid) : '' }}</span>
          <span v-if="chainDelta !== null" class="font-size-13px" :class="chainDelta >= 0 ? 'color-green' : 'color-red'">
            {{ t('链上增值') }}：{{ chainDelta >= 0 ? '+' : '' }}{{ fmtMoney(chainDelta) }}
          </span>
        </div>
      </template>

      <template v-if="chainType === 'decompose' && decomposeResult">
        <div class="mb-2 font-size-13px color-gray-500">
          {{ t('直接卖') }}：{{ fmtMoney(decomposeResult.directSellValue) }}
          ｜ {{ t('链上终值') }}：{{ fmtMoney(decomposeResult.totalValue) }}
          ｜ {{ t('链上总耗时') }}：{{ decomposeResult.totalSeconds.toFixed(1) }}s
        </div>
        <el-table :data="flatDecomposeRows" size="small">
          <el-table-column :label="t('物品')">
            <template #default="{ row }">
              <span :style="{ marginLeft: `${row.depth * 20}px` }" class="flex items-center gap-1">
                <ItemIcon :hrid="row.hrid" :width="20" :height="20" />
                {{ itemName(row.hrid) }}
                <span v-if="row.depth > 0" class="color-gray-500 font-size-12px">↳</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('数量')" align="center" width="90">
            <template #default="{ row }">
              {{ row.count < 1 ? row.count.toFixed(2) : Math.round(row.count).toLocaleString('en-US') }}
            </template>
          </el-table-column>
          <el-table-column :label="t('单层利润/时')" align="center" width="120">
            <template #default="{ row }">
              {{ row.profitPHFormat ?? '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('链上单件价值')" align="center" width="120">
            <template #default="{ row }">
              {{ fmtMoney(row.value) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('处置建议')" align="center" width="100">
            <template #default="{ row }">
              {{ row.advice }}
            </template>
          </el-table-column>
        </el-table>
      </template>

      <template v-else-if="chainType === 'transmute' && transmuteResult">
        <div class="mb-2 font-size-13px color-gray-500">
          {{ t('直接卖') }}：{{ fmtMoney(transmuteResult.directSellValue) }}
          ｜ {{ t('转化链终值') }}：{{ fmtMoney(transmuteResult.totalValue) }}
          ｜ {{ t('退出方式') }}：{{ transmuteResult.exitAdvice }}
        </div>
        <el-table :data="transmuteResult.hops" size="small">
          <el-table-column :label="t('步')" align="center" width="60">
            <template #default="{ $index }">
              {{ $index + 1 }}
            </template>
          </el-table-column>
          <el-table-column :label="t('从')" min-width="140">
            <template #default="{ row }">
              <span class="flex items-center gap-1">
                <ItemIcon :hrid="row.fromHrid" :width="20" :height="20" />
                {{ itemName(row.fromHrid) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('转化到')" min-width="140">
            <template #default="{ row }">
              <span class="flex items-center gap-1">
                <ItemIcon :hrid="row.toHrid" :width="20" :height="20" />
                {{ itemName(row.toHrid) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('期望数量')" align="center" width="100">
            <template #default="{ row }">
              {{ row.expectedCount.toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('单跳耗时')" align="center" width="100">
            <template #default="{ row }">
              {{ row.seconds.toFixed(1) }}s
            </template>
          </el-table-column>
        </el-table>
        <div v-if="transmuteResult.hops.length === 0" class="color-gray-500 font-size-13px" style="padding: 8px 4px">
          {{ t('当前设置下直接卖更优，无需转化') }}
        </div>
      </template>
    </el-card>
  </div>
</template>
