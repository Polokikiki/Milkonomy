<script lang="ts" setup>
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { useMemory } from "@@/composables/useMemory"
import { ElMessage } from "element-plus"
import { computed, ref } from "vue"
import { useI18n } from "vue-i18n"
import { CoinifyCalculator, DecomposeCalculator, TransmuteCalculator } from "@/calculator/alchemy"
import { getGameDataApi, getItemDetailOf, getPriceOf } from "@/common/apis/game"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { NO_TAX_FACTOR, SELL_TAX_FACTOR } from "@/common/constants/market"
import GameInfo from "../dashboard/components/GameInfo.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

const { t } = useI18n()

const importText = ref("")
// warehouseMap：物品 hrid → 数量（来自新版 MK助手导出的 warehouseMap 字段）
const warehouseMap = useMemory("warehouse-map", {} as Record<string, number>)
const warehouseImportedAt = useMemory("warehouse-imported-at", "")

const catalystRank = useMemory("warehouse-catalyst-rank", -1)
const includeTax = useMemory("warehouse-include-tax", true)
const includeRare = useMemory("warehouse-include-rare", true)

const onPriceStatusChange = usePriceStatus("warehouse-price-status")

const loading = ref(false)

function doImport() {
  const text = importText.value.trim()
  if (!text) {
    ElMessage.warning(t("请先粘贴 MK助手 复制的 JSON"))
    return
  }
  try {
    const data = JSON.parse(text)
    if (!data.warehouseMap || typeof data.warehouseMap !== "object") {
      ElMessage.error(t("未找到 warehouseMap 字段：需要 3.1 及以上版本的 MK助手 导出"))
      return
    }
    const cleaned: Record<string, number> = {}
    for (const [hrid, count] of Object.entries(data.warehouseMap) as [string, number][]) {
      const gameData = getGameDataApi()
      if (count > 0 && gameData?.itemDetailMap?.[hrid]) {
        cleaned[hrid] = count
      }
    }
    const total = Object.values(cleaned).reduce((acc, n) => acc + n, 0)
    if (!Object.keys(cleaned).length) {
      ElMessage.error(t("导入的物品均不在当前数据中，请检查数据是否已加载"))
      return
    }
    warehouseMap.value = cleaned
    warehouseImportedAt.value = new Date().toLocaleString()
    ElMessage.success(t("已导入 {0} 种物品，共 {1} 件", [Object.keys(cleaned).length, total]))
    importText.value = ""
  } catch {
    ElMessage.error(t("请输入正确的JSON格式"))
  }
}

function clearWarehouse() {
  warehouseMap.value = {}
  warehouseImportedAt.value = ""
}

/** 资产总览：全部持有物品 × 右价估值（机会成本口径） */
interface AssetRow {
  hrid: string
  count: number
  bid: number
  subtotal: number
}

const assetRows = computed<AssetRow[]>(() => {
  const rows: AssetRow[] = []
  for (const [hrid, count] of Object.entries(warehouseMap.value as Record<string, number>)) {
    const bid = getPriceOf(hrid).bid
    rows.push({ hrid, count, bid, subtotal: bid > 0 ? bid * count : -1 })
  }
  rows.sort((a, b) => b.subtotal - a.subtotal)
  return rows
})

const totalAssetValue = computed(() => assetRows.value.reduce((acc, r) => acc + (r.subtotal > 0 ? r.subtotal : 0), 0))

function fmtMoney(value: number) {
  if (value < 0) return t("无单")
  return Math.round(value).toLocaleString("en-US")
}

const itemName = (hrid: string) => t(getItemDetailOf(hrid)?.name ?? hrid)

/** 齐料炼金表：仓库里有的物品 × 可用炼金方式（原料已备，只差金币/催化剂） */
interface ReadyRow {
  hrid: string
  project: string
  count: number
  profitPH: number
  profitPP: number
  startCost: number
  /** 资金效率 = 单次利润 ÷ 单次启动成本 */
  capitalEfficiency: number
  catalystRankUsed: number
}

const readyRows = ref<ReadyRow[]>([])

function computeReady() {
  const owned = Object.entries(warehouseMap.value as Record<string, number>)
  if (!owned.length) {
    ElMessage.warning(t("请先导入仓库数据"))
    return
  }
  loading.value = true
  setTimeout(() => {
    try {
      const sellTaxFactor = includeTax.value ? SELL_TAX_FACTOR : NO_TAX_FACTOR
      const ranks = catalystRank.value === -1 ? [0, 1, 2] : [catalystRank.value]
      const ctors = [TransmuteCalculator, DecomposeCalculator, CoinifyCalculator]
      const rows: ReadyRow[] = []
      for (const [hrid, count] of owned) {
        const item = getGameDataApi()?.itemDetailMap?.[hrid]
        if (!item?.alchemyDetail) continue
        for (const Ctor of ctors) {
          let best: ReadyRow | null = null
          for (const rank of ranks) {
            try {
              const calc = new Ctor({ hrid, catalystRank: rank, includeRare: includeRare.value })
              calc.setSellTaxFactor(sellTaxFactor)
              if (!calc.available || !calc.run().result) continue
              const ingredients = calc.ingredientListWithPrice
              if (ingredients[0]?.price === -1) continue
              const startCost = calc.cost - ingredients[0].count * ingredients[0].price
              const { profitPH, profitPP } = calc.result as { profitPH: number, profitPP: number }
              if (profitPH <= 0) continue
              const row: ReadyRow = {
                hrid,
                project: (calc as unknown as { project: string }).project,
                count,
                profitPH,
                profitPP,
                startCost,
                capitalEfficiency: startCost > 0 ? profitPP / startCost : profitPP > 0 ? Infinity : 0,
                catalystRankUsed: rank
              }
              if (!best || row.profitPH > best.profitPH) best = row
            } catch {
              // 单个方式失败不影响其余
            }
          }
          if (best) rows.push(best)
        }
      }
      rows.sort((a, b) => b.profitPH - a.profitPH)
      readyRows.value = rows
      if (!rows.length) ElMessage.warning(t("当前仓库物品没有正利润的炼金方式"))
    } catch (e) {
      console.error(e)
      ElMessage.error(t("计算失败，请打开控制台查看错误"))
    } finally {
      loading.value = false
    }
  }, 50)
}

const CATALYST_LABELS = ["无", "普通", "至高"]
</script>

<template>
  <div class="app-container">
    <div class="game-info">
      <GameInfo />
    </div>

    <el-card>
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span>{{ t('导入仓库数据') }}</span>
          <span v-if="warehouseImportedAt" class="color-gray-500 font-size-12px">
            {{ t('上次导入') }}：{{ warehouseImportedAt }}
          </span>
        </div>
      </template>
      <el-input
        v-model="importText"
        type="textarea"
        :rows="3"
        :placeholder="t('游戏内点 MK：复制 后粘贴到这里（需 3.1+ 版 MK助手，导出含仓库数量）')"
      />
      <div class="mt-2 flex items-center gap-2">
        <el-button type="primary" @click="doImport">
          {{ t('导入') }}
        </el-button>
        <el-button v-if="Object.keys(warehouseMap).length" plain @click="clearWarehouse">
          {{ t('清空') }}
        </el-button>
      </div>
    </el-card>

    <el-card class="mt-4">
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span>{{ t('资产总览') }}（{{ t('右价估值·机会成本口径') }}）</span>
          <span class="font-size-13px">{{ t('总估值') }}：<b>{{ fmtMoney(totalAssetValue) }}</b></span>
        </div>
      </template>
      <el-table :data="assetRows" size="small" :max-height="420">
        <el-table-column :label="t('物品')" min-width="180">
          <template #default="{ row }">
            <span class="flex items-center gap-1">
              <ItemIcon :hrid="row.hrid" :width="20" :height="20" />
              {{ itemName(row.hrid) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('数量')" align="center" width="110" sortable prop="count">
          <template #default="{ row }">
            {{ Math.round(row.count).toLocaleString('en-US') }}
          </template>
        </el-table-column>
        <el-table-column :label="t('单价（右价）')" align="center" width="120">
          <template #default="{ row }">
            {{ fmtMoney(row.bid) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('小计估值')" align="center" width="130" sortable prop="subtotal">
          <template #default="{ row }">
            {{ fmtMoney(row.subtotal) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="mt-4">
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span>{{ t('齐料炼金表') }}（{{ t('原料已有，只补金币/催化剂') }}）</span>
          <div class="flex items-center gap-3 flex-wrap">
            <PriceStatusSelect @change="onPriceStatusChange" />
            <el-radio-group v-model="catalystRank" size="small">
              <el-radio-button :label="-1">
                {{ t('自动') }}
              </el-radio-button>
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
            <el-checkbox v-model="includeTax" :label="t('计税')" />
            <el-checkbox v-model="includeRare" :label="t('稀有掉落')" />
            <el-button type="primary" size="small" :loading="loading" @click="computeReady">
              {{ t('计算') }}
            </el-button>
          </div>
        </div>
      </template>
      <el-table :data="readyRows" size="small" :max-height="520">
        <el-table-column :label="t('物品')" min-width="180">
          <template #default="{ row }">
            <span class="flex items-center gap-1">
              <ItemIcon :hrid="row.hrid" :width="20" :height="20" />
              {{ itemName(row.hrid) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('已有')" align="center" width="90" sortable prop="count">
          <template #default="{ row }">
            {{ Math.round(row.count).toLocaleString('en-US') }}
          </template>
        </el-table-column>
        <el-table-column :label="t('方式')" align="center" width="70">
          <template #default="{ row }">
            {{ row.project }}
          </template>
        </el-table-column>
        <el-table-column :label="t('催化剂')" align="center" width="80">
          <template #default="{ row }">
            {{ CATALYST_LABELS[row.catalystRankUsed] }}
          </template>
        </el-table-column>
        <el-table-column :label="t('利润/时')" align="center" width="120" sortable prop="profitPH">
          <template #default="{ row }">
            {{ fmtMoney(row.profitPH) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('利润/次')" align="center" width="110" sortable prop="profitPP">
          <template #default="{ row }">
            {{ fmtMoney(row.profitPP) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('单次启动成本')" align="center" width="120" sortable prop="startCost">
          <template #default="{ row }">
            {{ fmtMoney(row.startCost) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('资金效率')" align="center" width="110" sortable prop="capitalEfficiency">
          <template #default="{ row }">
            {{ row.capitalEfficiency === Infinity ? '∞' : `${Math.round(row.capitalEfficiency * 100)}%` }}
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!readyRows.length" class="color-gray-500 font-size-13px" style="padding: 8px 4px">
        {{ t('导入仓库后点击计算：列出仓库物品可做的全部炼金方式，按利润/时排序') }}
      </div>
    </el-card>
  </div>
</template>
