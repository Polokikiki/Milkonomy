<script lang="ts" setup>
import type { Sort } from "element-plus"
import type { SuperAlchemyMode, SuperAlchemyOptions, SuperAlchemyRow, SuperNode, SuperTreeResult } from "@/calculator/superAlchemy"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { useMemory } from "@@/composables/useMemory"
import { usePagination } from "@@/composables/usePagination"
import * as Format from "@@/utils/format"
import { Search, Setting } from "@element-plus/icons-vue"
import { ElMessage } from "element-plus"
import ColumnSettings, { type ColumnDef } from "../dashboard/components/ColumnSettings.vue"

const { t } = useI18n()

const search = useMemory("super-alchemy-search", "")
const actionFilter = ref("")
const catalystRank = useMemory("super-alchemy-catalyst-rank", -1)
const includeTax = useMemory("super-alchemy-include-tax", true)
const includeRare = useMemory("super-alchemy-include-rare", true)
const mode = useMemory("super-alchemy-mode", "smart" as SuperAlchemyMode)
const minSteps = useMemory("super-alchemy-min-steps", 1)
const minLevel = useMemory("super-alchemy-min-level", undefined as number | undefined)
const minProfitRate = useMemory("super-alchemy-min-profit-rate", undefined as number | undefined)
const minVolume = useMemory("super-alchemy-min-volume", undefined as number | undefined)
const banEquipment = useMemory("super-alchemy-ban-equipment", false)
const catalystSide = useMemory("super-alchemy-catalyst-side", "")

const { paginationData, handleCurrentChange, handleSizeChange } = usePagination({}, "super-alchemy-pagination")

const rows = ref<SuperAlchemyRow[]>([])
const loading = ref(false)
let lastOptions: SuperAlchemyOptions | null = null

function load() {
  if (!useGameStore().marketData) return
  loading.value = true
  setTimeout(() => {
    try {
      const ranks = catalystRank.value === -1 ? [0, 1, 2] : [catalystRank.value]
      const options: SuperAlchemyOptions = {
        catalystRanks: ranks,
        sellTaxFactor: includeTax.value ? SELL_TAX_FACTOR : NO_TAX_FACTOR,
        mode: mode.value,
        includeRare: includeRare.value
      }
      lastOptions = options
      const store = useGameStore()
      const cacheKey = `${store.marketData!.timestamp}-${includeTax.value ? "tax" : "noTax"}-r${includeRare.value ? "1" : "0"}-c${catalystRank.value}-${mode.value}-cat${catalystSide.value}-buy${store.buyStatus}-sell${store.sellStatus}-v${usePlayerStore().configVersion}`
      let list = store.getSuperAlchemyCache(cacheKey)
      if (!list || list.length === 0) {
        const startTime = Date.now()
        list = computeSuperAlchemy(options)
        store.setSuperAlchemyCache(list, cacheKey)
        ElMessage.success(t("计算完成，耗时{0}秒", [(Date.now() - startTime) / 1000]))
      }
      rows.value = list
    } catch (e) {
      console.error(e)
      ElMessage.error(t("计算失败或结果为空，请打开控制台查看错误"))
      rows.value = []
    } finally {
      loading.value = false
    }
  }, 50)
}

watch([
  () => catalystRank.value,
  () => includeTax.value,
  () => includeRare.value,
  () => mode.value,
  () => useGameStore().marketData,
  () => usePlayerStore().config,
  () => useGameStore().buyStatus,
  () => useGameStore().sellStatus
], load, { immediate: true })

const sortKey: Ref<Sort | undefined> = ref()
function handleSort(sort: Sort) {
  sortKey.value = sort
}

const filteredRows = computed(() => {
  let list = rows.value.filter((row) => {
    if (actionFilter.value && row.eval.action !== actionFilter.value) return false
    if (banEquipment.value && row.item.categoryHrid === "/item_categories/equipment") return false
    if (row.eval.mainPath.length < (minSteps.value || 1)) return false
    if (minLevel.value !== undefined && minLevel.value !== null && row.eval.reqLevel < minLevel.value) return false
    if (minProfitRate.value !== undefined && minProfitRate.value !== null && row.profitRate * 100 < minProfitRate.value) return false
    if (minVolume.value !== undefined && minVolume.value !== null && (row.volume1h ?? -1) < minVolume.value) return false
    if (search.value && !row.eval.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())) return false
    return true
  })
  const order = sortKey.value?.order === "ascending" ? 1 : -1
  const prop = sortKey.value?.prop
  if (prop === "profit") {
    list = [...list].sort((a, b) => (a.profit - b.profit) * order)
  } else if (prop === "profitRate") {
    list = [...list].sort((a, b) => (a.profitRate - b.profitRate) * order)
  } else if (prop === "profitPH") {
    list = [...list].sort((a, b) => (a.profitPH - b.profitPH) * order)
  }
  return list
})

const pagedRows = computed(() => {
  const start = (paginationData.currentPage - 1) * paginationData.pageSize
  return filteredRows.value.slice(start, start + paginationData.pageSize)
})

watch(filteredRows, () => {
  paginationData.total = filteredRows.value.length
  if (paginationData.currentPage > 1 && (paginationData.currentPage - 1) * paginationData.pageSize >= filteredRows.value.length) {
    paginationData.currentPage = 1
  }
}, { immediate: true })

const onPriceStatusChange = usePriceStatus("super-alchemy-price-status")

const ACTION_TAGS: Record<string, { label: () => string, type: "success" | "warning" | "danger" | "info" }> = {
  sell: { label: () => t("卖出"), type: "info" },
  decompose: { label: () => t("分解"), type: "warning" },
  transmute: { label: () => t("转化"), type: "success" },
  coinify: { label: () => t("点金"), type: "danger" }
}

function pathText(row: SuperAlchemyRow) {
  const counts: { action: string, n: number }[] = []
  for (const a of row.eval.mainPath) {
    const last = counts[counts.length - 1]
    if (last && last.action === a) last.n++
    else counts.push({ action: a, n: 1 })
  }
  return counts.map(c => t("{0}步{1}", [c.n, ACTION_TAGS[c.action].label()])).join("+")
}

function playerAlchemyLevel() {
  return getActionConfigOf("alchemy").playerLevel
}

function formatSec(sec: number) {
  if (sec <= 0) return "-"
  if (sec < 60) return `${sec.toFixed(1)}s`
  if (sec < 3600) return `${(sec / 60).toFixed(1)}m`
  return `${(sec / 3600).toFixed(2)}h`
}

const RANK1_CATALYSTS: Record<string, string> = {
  decompose: "catalyst_of_decomposition",
  transmute: "catalyst_of_transmutation",
  coinify: "catalyst_of_coinification"
}
function catalystHridOf(node: SuperNode) {
  return node.catalystRank >= 2 ? "prime_catalyst" : RANK1_CATALYSTS[node.action]
}

// 详情
const detailVisible = ref(false)
const tree = ref<SuperTreeResult | null>(null)
const startNode = computed(() => tree.value?.root ?? null)
const mainNodes = computed(() => tree.value?.mainNodes ?? [])
const sellIncomeTotal = computed(() => sellRows.value.reduce((s, n) => s + n.sellValue, 0))
const transformCostTotal = computed(() => {
  if (!tree.value) return 0
  let sum = 0
  const walk = (node: SuperNode) => {
    if (node.action !== "sell") sum += node.stepCost
    node.children.forEach(walk)
  }
  walk(tree.value.root)
  return sum
})

interface SellRow {
  hrid: string
  name: string
  count: number
  sellValue: number
  cycleCut: boolean
  priceInvalid: boolean
}
const sellRows = computed<SellRow[]>(() => {
  if (!tree.value) return []
  const map = new Map<string, SellRow>()
  const walk = (node: SuperNode) => {
    if (node.action === "sell") {
      const row = map.get(node.hrid)
      if (row) {
        row.count += node.count
        row.sellValue += node.sellValue
        row.cycleCut = row.cycleCut || node.cycleCut
        row.priceInvalid = row.priceInvalid && node.priceInvalid
      } else {
        map.set(node.hrid, { hrid: node.hrid, name: node.name, count: node.count, sellValue: node.sellValue, cycleCut: node.cycleCut, priceInvalid: node.priceInvalid })
      }
    }
    node.children.forEach(walk)
  }
  walk(tree.value.root)
  return [...map.values()].sort((a, b) => b.sellValue - a.sellValue)
})

/** 每件：继续炼比直接卖多赚多少——正数=卖掉就亏这么多，主线物品必为正 */
function chainAdvantageOf(node: SuperNode) {
  if (node.count <= 0) return 0
  return (node.chainIncome - node.sellValue) / node.count
}

function showDetail(row: SuperAlchemyRow) {
  if (!lastOptions) return
  tree.value = buildSuperTree(row.item, lastOptions)
  detailVisible.value = true
}
</script>

<template>
  <div class="app-container">
    <div class="game-info">
      <GameInfo />
      <div>
        <ActionConfig :actions="['alchemy']" />
      </div>
      <PriceStatusSelect @change="onPriceStatusChange" />
      <el-checkbox v-model="includeTax">
        {{ t('计算税率') }}
      </el-checkbox>
      <el-checkbox v-model="includeRare">
        {{ t('稀有发现') }}
      </el-checkbox>
    </div>

    <el-card>
      <template #header>
        <div class="flex items-center flex-wrap gap-2">
          <span class="title">{{ t('超级炼金排行') }}</span>
          <el-input v-model="search" :placeholder="t('搜索')" clearable size="small" style="width: 100px" />
          <el-select v-model="actionFilter" :placeholder="t('动作')" clearable size="small" style="width: 100px">
            <el-option :label="t('分解')" value="decompose" />
            <el-option :label="t('转化')" value="transmute" />
            <el-option :label="t('点金')" value="coinify" />
          </el-select>
          <span>{{ t('步数') }} ≥</span>
          <el-input-number v-model="minSteps" :min="1" :max="12" :controls="false" size="small" style="width: 64px" />
          <span>{{ t('要求等级') }} ≥</span>
          <el-input-number v-model="minLevel" :min="0" :max="200" :controls="false" size="small" style="width: 64px" />
          <span>{{ t('利润率') }} ≥</span>
          <el-input-number v-model="minProfitRate" :min="0" :controls="false" size="small" style="width: 64px" />&nbsp;%
          <span>{{ t('成交量(1h)') }} ≥</span>
          <el-input-number v-model="minVolume" :min="0" :controls="false" size="small" style="width: 64px" />
          <el-checkbox v-model="banEquipment">
            {{ t('排除装备') }}
          </el-checkbox>
          <span>{{ t('催化剂') }}</span>
          <el-radio-group v-model="catalystRank" size="small">
            <el-radio-button :label="-1">
              {{ t('自动') }}
            </el-radio-button>
            <el-radio-button :label="0">
              {{ t('无') }}
            </el-radio-button>
            <el-radio-button :label="1">
              1
            </el-radio-button>
            <el-radio-button :label="2">
              2
            </el-radio-button>
          </el-radio-group>
          <span>{{ t('催化剂价格') }}</span>
          <el-select v-model="catalystSide" size="small" style="width: 100px">
            <el-option :label="t('跟随')" value="" />
            <el-option :label="t('左价')" value="ask" />
            <el-option :label="t('右价')" value="bid" />
            <el-option :label="t('左低一档')" value="ask_low" />
            <el-option :label="t('右高一档')" value="bid_high" />
          </el-select>
          <span>{{ t('模式') }}</span>
          <el-radio-group v-model="mode" size="small">
            <el-radio-button label="smart">
              {{ t('智能') }}
              <el-tooltip :content="t('智能模式：每一步都取净收益最高的处置（继续炼或直接卖），整体利润最优')" placement="top">
                <el-icon style="cursor: help; vertical-align: middle;">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-radio-button>
            <el-radio-button label="longest">
              {{ t('最长链') }}
              <el-tooltip :content="t('最长链模式：只要继续炼不比直接卖亏就一直往深炼——链条更长、经验更多，利润可能略低')" placement="top">
                <el-icon style="cursor: help; vertical-align: middle;">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <template #default>
        <el-table :data="pagedRows" v-loading="loading" @sort-change="handleSort">
          <el-table-column width="54">
            <template #header>
              <ColumnSettings :columns="[
                { key: 'path', label: '路径' },
                { key: 'steps', label: '步数' },
                { key: 'reqLevel', label: '要求等级' },
                { key: 'profitPH', label: '利润 / h' },
                { key: 'profit', label: '利润 / 件' },
                { key: 'profitRate', label: '利润率' },
                { key: 'timePer', label: '耗时 / 件' },
                { key: 'buyPrice', label: '购入价' },
                { key: 'vol', label: '成交量(1h)' }
              ]" :visible="columnVisible" :order="columnOrder">
                <template #reference>
                  <el-icon :size="18" style="cursor: pointer" :title="t('列设置')">
                    <Setting />
                  </el-icon>
                </template>
              </ColumnSettings>
            </template>
            <template #default="{ row }">
              <ItemIcon :hrid="row.item.hrid" />
            </template>
          </el-table-column>
          <el-table-column prop="eval.name" :label="t('物品')" min-width="130" />
          <template v-for="colKey in columnOrder" :key="colKey">
            <el-table-column v-if="colKey === 'path' && columnVisible.path" :label="t('路径')" min-width="130">
              <template #default="{ row }">
                {{ pathText(row) }}
              </template>
            </el-table-column>
            <el-table-column v-if="colKey === 'steps' && columnVisible.steps" :label="t('步数')" align="center">
              <template #default="{ row }">
                {{ row.eval.mainPath.length }}
              </template>
            </el-table-column>
            <el-table-column v-if="colKey === 'reqLevel' && columnVisible.reqLevel" :label="t('要求等级')" align="center">
              <template #default="{ row }">
                <div :class="row.eval.reqLevel > playerAlchemyLevel() ? 'red' : ''">
                  {{ row.eval.reqLevel }}
                </div>
              </template>
            </el-table-column>
            <el-table-column v-if="colKey === 'profitPH' && columnVisible.profitPH" prop="profitPH" :label="t('利润 / h')" align="center" min-width="110" sortable="custom" :sort-orders="['descending', 'ascending', null]">
              <template #default="{ row }">
                <span :class="row.profit < 0 ? 'red' : ''">{{ Format.money(row.profitPH) }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="colKey === 'profit' && columnVisible.profit" prop="profit" :label="t('利润 / 件')" align="center" min-width="100" sortable="custom" :sort-orders="['descending', 'ascending', null]">
              <template #default="{ row }">
                <span :class="row.profit < 0 ? 'red' : ''">{{ Format.money(row.profit) }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="colKey === 'profitRate' && columnVisible.profitRate" prop="profitRate" :label="t('利润率')" align="center" sortable="custom" :sort-orders="['descending', 'ascending', null]">
              <template #default="{ row }">
                <span :class="row.profit < 0 ? 'red' : ''">{{ Format.percent(row.profitRate) }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="colKey === 'timePer' && columnVisible.timePer" :label="t('耗时 / 件')" align="center">
              <template #default="{ row }">
                {{ formatSec(row.eval.timePerUnit) }}
              </template>
            </el-table-column>
            <el-table-column v-if="colKey === 'buyPrice' && columnVisible.buyPrice" :label="t('购入价')" align="center" min-width="100">
              <template #default="{ row }">
                {{ Format.money(row.ask) }}
              </template>
            </el-table-column>
            <el-table-column v-if="colKey === 'vol' && columnVisible.vol" :label="t('成交量(1h)')" align="center" min-width="100">
              <template #default="{ row }">
                {{ row.volume1h >= 0 ? Format.number(row.volume1h) : "-" }}
              </template>
            </el-table-column>
          </template>
          <el-table-column :label="t('详情')" align="center" fixed="right">
            <template #default="{ row }">
              <el-link type="primary" :icon="Search" @click="showDetail(row)">
                {{ t('查看') }}
              </el-link>
            </template>
          </el-table-column>
        </el-table>
      </template>
      <template #footer>
        <div class="pager-wrapper">
          <el-pagination
            background
            :layout="paginationData.layout"
            :page-sizes="paginationData.pageSizes"
            :total="paginationData.total"
            :page-size="paginationData.pageSize"
            :current-page="paginationData.currentPage"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>
      </template>
    </el-card>

    <el-dialog v-model="detailVisible" :title="t('链条结构')" width="88%">
      <template v-if="tree">
        <el-row :gutter="12">
          <el-col :xs="24" :sm="8">
            <div class="flow-col">
              <div class="flow-head">{{ t('起始') }}</div>
              <div class="flow-body flow-scroll">
                <div v-if="startNode" class="flow-row">
                  <ItemIcon :hrid="startNode.hrid" :width="26" :height="26" />
                  <span class="flow-name">{{ startNode.name }}</span>
                  <span class="flow-count">×{{ Format.number(startNode.count, 2) }}</span>
                </div>
              </div>
              <div class="flow-foot">
                <span>{{ t('购入价') }}</span>
                <span class="flow-cost">−{{ Format.money(tree.total.ask) }}</span>
              </div>
            </div>
          </el-col>
          <el-col :xs="24" :sm="8">
            <div class="flow-col">
              <div class="flow-head">
                <el-tooltip :content="t('出现在此列的物品应继续转化（继续炼比直接卖更赚）；其余产物全部在卖出列直接卖掉')" placement="top">
                  <span>{{ t('中间产物') }}</span>
                </el-tooltip>
              </div>
              <div class="flow-grid-head">
                <span>{{ t('物品') }}</span>
                <span>{{ t('期望产出') }}</span>
                <span>{{ t('售出价格') }}</span>
                <span>{{ t('直卖亏') }}</span>
              </div>
              <div class="flow-body flow-scroll">
                <div
                  v-for="node in mainNodes"
                  :key="node.id"
                  class="flow-grid-row"
                  :title="`${t('耗时')} ${formatSec(node.stepTimeSec)} · ${t('该步成本')} ${Format.money(node.stepCost)}`"
                >
                  <div class="flow-item">
                    <el-tag size="small" :type="ACTION_TAGS[node.action].type">
                      {{ ACTION_TAGS[node.action].label() }}
                    </el-tag>
                    <el-tooltip v-if="node.catalystRank > 0" :content="`${t('催化剂')} Lv.${node.catalystRank}`" placement="top">
                      <ItemIcon :hrid="`/items/${catalystHridOf(node)}`" :width="16" :height="16" />
                    </el-tooltip>
                    <ItemIcon :hrid="node.hrid" :width="26" :height="26" />
                    <span class="flow-name">{{ node.name }}</span>
                  </div>
                  <span class="flow-count">{{ Format.number(node.count, node.count < 0.1 ? 3 : 2) }}</span>
                  <span class="flow-meta">{{ node.count > 0 ? Format.money(node.sellValue / node.count) : "-" }}</span>
                  <span v-if="chainAdvantageOf(node) > 0" class="flow-cost">{{ Format.money(chainAdvantageOf(node)) }}</span>
                  <span v-else class="flow-meta">-</span>
                </div>
              </div>
              <div class="flow-foot">
                <span>{{ t('附加成本') }}</span>
                <span class="flow-cost">−{{ Format.money(transformCostTotal) }}</span>
              </div>
            </div>
          </el-col>
          <el-col :xs="24" :sm="8">
            <div class="flow-col">
              <div class="flow-head">{{ t('卖出') }}</div>
              <div class="flow-grid-head">
                <span>{{ t('物品') }}</span>
                <el-tooltip :content="t('期望产出率 = 掉落率×成功率，多来源已合并')" placement="top">
                  <span>{{ t('期望产出') }}</span>
                </el-tooltip>
                <span>{{ t('售出价格') }}</span>
                <el-tooltip :content="t('工时 = 每小时期望利润：期望收入−购入价−全部附加成本，÷整链耗时×3600')" placement="top">
                  <span>{{ t('工时') }}</span>
                </el-tooltip>
              </div>
              <div class="flow-body flow-scroll">
                <div v-for="row in sellRows" :key="row.hrid" class="flow-row flow-grid-row">
                  <div class="flow-item">
                    <ItemIcon :hrid="row.hrid" :width="24" :height="24" />
                    <span class="flow-name">{{ row.name }}</span>
                  </div>
                  <span class="flow-count">{{ Format.number(row.count, row.count < 0.1 ? 3 : 2) }}</span>
                  <span v-if="row.priceInvalid" class="flow-meta">{{ t('无市价') }}</span>
                  <span v-else-if="row.count > 0" class="flow-meta">{{ Format.money(row.sellValue / row.count) }}</span>
                  <span v-else class="flow-meta">-</span>
                  <span :class="tree.total.profitPH >= 0 ? 'flow-gain' : 'flow-cost'">{{ Format.money(tree.total.profitPH) }}</span>
                </div>
              </div>
              <div class="flow-foot">
                <span>{{ t('工时') }}</span>
                <span :class="tree.total.profitPH >= 0 ? 'flow-gain' : 'flow-cost'">{{ Format.money(tree.total.profitPH) }}</span>
              </div>
            </div>
          </el-col>
        </el-row>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts">
import { computed, ref, watch } from "vue"
import { buildSuperTree, computeSuperAlchemy } from "@/calculator/superAlchemy"
import { getActionConfigOf } from "@/common/apis/player"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { NO_TAX_FACTOR, SELL_TAX_FACTOR } from "@/common/constants/market"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

const columnVisible = useMemory("super-alchemy-column-visible", {
  path: true,
  steps: true,
  reqLevel: true,
  profitPH: true,
  profit: true,
  profitRate: true,
  timePer: true,
  buyPrice: true,
  vol: true
})
const columnOrder = useMemory("super-alchemy-column-order", ["path", "steps", "reqLevel", "profitPH", "profit", "profitRate", "timePer", "buyPrice", "vol"])

export default { name: "SuperAlchemy" }
</script>

<style lang="scss" scoped>
.title {
  width: 100px;
}

.pager-wrapper {
  display: flex;
  justify-content: center;
}

.red {
  color: #f56c6c;
}

.flow-col {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
}

.flow-head {
  padding: 6px 10px;
  font-weight: 600;
  background: var(--el-fill-color-light);
}

.flow-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.flow-scroll {
  max-height: 340px;
  overflow-y: auto;
}

.flow-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-height: 26px;
}

.flow-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.flow-count,
.flow-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.flow-cost {
  color: #f56c6c;
  font-size: 12px;
}

.flow-gain {
  color: #16ab1b;
  font-size: 12px;
}

.flow-foot {
  margin-top: auto;
  padding: 6px 10px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
  font-size: 12px;
  display: flex;
  justify-content: space-between;
}

.flow-grid-head,
.flow-grid-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 52px 72px 84px;
  align-items: center;
  gap: 4px 6px;
}

.flow-grid-head {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.flow-grid-head span:not(:first-child),
.flow-grid-row span:not(.flow-item) {
  text-align: left;
}

.flow-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-left: calc(var(--depth, 0) * 14px);
}

.flow-item .flow-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 768px) {
  .flow-grid-head,
  .flow-grid-row {
    grid-template-columns: minmax(0, 1fr) 46px 58px 66px;
    gap: 2px 4px;
  }

  .flow-grid-head {
    font-size: 10px;
    padding: 3px 6px;
  }

  .flow-body {
    padding: 6px;
  }

  .flow-item {
    gap: 3px;
  }

  .flow-name {
    font-size: 12px;
  }
}
</style>
