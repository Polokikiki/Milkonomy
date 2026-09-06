<script lang="ts" setup>
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { useMemory } from "@@/composables/useMemory"
import * as Format from "@@/utils/format"
import { Warning } from "@element-plus/icons-vue"
import { ElMessage } from "element-plus"
import { ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { computeStoneLeaderboard, type StoneLeaderboardResult } from "@/calculator/alchemyChain"
import { getGameDataApi, getItemDetailOf } from "@/common/apis/game"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { NO_TAX_FACTOR, SELL_TAX_FACTOR } from "@/common/constants/market"
import { useGameStore } from "@/pinia/stores/game"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

const { t } = useI18n()

const catalystRank = useMemory("stone-catalyst-rank", -1)
const includeTax = useMemory("stone-include-tax", true)
const includeRare = useMemory("stone-include-rare", true)

const onPriceStatusChange = usePriceStatus("stone-price-status")
function handlePriceStatusChange() {
  onPriceStatusChange()
  compute()
}

const gameStore = useGameStore()
const stoneResult = ref<StoneLeaderboardResult | null>(null)

const itemName = (hrid: string) => t(getItemDetailOf(hrid)?.name ?? hrid)

const legendLines = [
  t("概率：每做一次转化/分解，真的掉出贤者之石的概率。转化本身有成功率（失败则材料全没），已一并算进去。"),
  t("买价：去市场买这件来源物品要花的钱。带「自制」标签 = 市场没人卖，按自己做出来的材料成本估算。"),
  t("副产物抵扣：做一次不只出石头，还会搭着出别的东西，这些搭头卖掉（扣 5% 税）能回收的钱，直接从成本里减。例：耳环买价 500M，附带 7 只小耳环回收 31M，净投入就是 469M。"),
  t("单颗净成本：（买价 + 催化剂 − 副产物抵扣）÷ 平均每次出几颗，即搞到一颗石头实际花的钱。排行榜按它从便宜到贵排。"),
  t("价差：贤者之石现价 − 单颗净成本。绿色 = 自己做比直接买一颗便宜，赚的就是这个数；红色 = 不如直接买。")
]

function fmtStones(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

function catalystHridOf(row: { method: string, catalystRankUsed: number }): string | null {
  if (row.catalystRankUsed === 2) return "/items/prime_catalyst"
  if (row.catalystRankUsed === 1) {
    return row.method === "transmute" ? "/items/catalyst_of_transmutation" : "/items/catalyst_of_decomposition"
  }
  return null
}

function compute() {
  // 游戏数据未就绪时跳过，等 marketData watcher 触发
  if (!getGameDataApi() || !gameStore.marketData) return
  try {
    stoneResult.value = computeStoneLeaderboard({
      catalystRank: catalystRank.value,
      sellTaxFactor: includeTax.value ? SELL_TAX_FACTOR : NO_TAX_FACTOR,
      includeRare: includeRare.value
    })
  } catch (e) {
    console.error(e)
    ElMessage.error(t("计算失败，请打开控制台查看错误"))
  }
}

// 进页面即算；设置变化、市场数据刷新（约每小时/5 分钟轮询）自动重算
watch([catalystRank, includeTax, includeRare], compute, { immediate: true })
watch(() => gameStore.marketData?.timestamp, () => compute())
</script>

<template>
  <div class="app-container">
    <div class="game-info">
      <GameInfo />
      <div>
        <ActionConfig :actions="['alchemy']" />
      </div>
    </div>

    <el-card>
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <ItemIcon hrid="/items/philosophers_stone" :width="22" :height="22" />
            <span>{{ t('贤者路径计算') }}</span>
          </div>
          <PriceStatusSelect @change="handlePriceStatusChange" />
        </div>
      </template>
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center flex-wrap gap-2">
          <span>{{ t('催化剂') }}</span>
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
        </div>
        <el-checkbox v-model="includeTax" :label="t('计税')" />
        <el-checkbox v-model="includeRare" :label="t('稀有掉落')" />
      </div>
      <div class="font-size-12px color-gray-500" style="line-height: 2; margin-top: 8px">
        <div class="font-bold">
          {{ t('名词说明') }}
        </div>
        <div v-for="line in legendLines" :key="line">
          · {{ line }}
        </div>
      </div>
    </el-card>

    <el-card v-if="stoneResult" class="mt-4">
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span>{{ t('{0} 种来源参与排行（无卖单的按制造成本计入，{1} 种无法定价未计入）', [stoneResult.rows.length, stoneResult.excludedCount]) }}</span>
          <span class="font-size-13px">{{ t('贤者之石现价') }}：{{ Format.price(stoneResult.stoneBid) }}</span>
        </div>
      </template>
      <el-table :data="stoneResult.rows" size="small" max-height="560">
        <el-table-column :label="t('排名')" align="center" width="60">
          <template #default="{ $index }">
            {{ $index + 1 }}
          </template>
        </el-table-column>
        <el-table-column :label="t('来源物品')" min-width="170">
          <template #default="{ row }">
            <span class="flex items-center gap-1">
              <ItemIcon :hrid="row.hrid" :width="20" :height="20" />
              {{ itemName(row.hrid) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('途径')" align="center" width="70">
          <template #default="{ row }">
            {{ row.method === 'transmute' ? t('转化') : t('分解') }}
          </template>
        </el-table-column>
        <el-table-column align="center" width="90">
          <template #header>
            <el-tooltip placement="top" effect="light">
              <template #content>
                <div style="max-width: 320px">
                  {{ legendLines[0] }}
                </div>
              </template>
              <div style="display: flex; justify-content: center; align-items: center; gap: 5px">
                <div>{{ t('概率') }}</div>
                <el-icon><Warning /></el-icon>
              </div>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            {{ fmtStones(row.stonesPerAction) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('催化剂')" align="center" width="70">
          <template #default="{ row }">
            <span v-if="catalystHridOf(row)" class="flex items-center justify-center">
              <ItemIcon :hrid="catalystHridOf(row)!" :width="22" :height="22" />
            </span>
            <span v-else>{{ t('无') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('买价')" align="right" width="130">
          <template #default="{ row }">
            <span class="flex items-center justify-end gap-1">
              <el-tag v-if="row.isCraftFallback" size="small" type="info">
                {{ t('自制') }}
              </el-tag>
              {{ Format.price(row.buyPrice) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column align="right" width="120">
          <template #header>
            <el-tooltip placement="top" effect="light">
              <template #content>
                <div style="max-width: 320px">
                  {{ legendLines[2] }}
                </div>
              </template>
              <div style="display: flex; justify-content: flex-end; align-items: center; gap: 5px">
                <div>{{ t('副产物抵扣') }}</div>
                <el-icon><Warning /></el-icon>
              </div>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            {{ Format.price(row.byproductIncome) }}
          </template>
        </el-table-column>
        <el-table-column align="right" width="130">
          <template #header>
            <el-tooltip placement="top" effect="light">
              <template #content>
                <div style="max-width: 320px">
                  {{ legendLines[3] }}
                </div>
              </template>
              <div style="display: flex; justify-content: flex-end; align-items: center; gap: 5px">
                <div>{{ t('单颗净成本') }}</div>
                <el-icon><Warning /></el-icon>
              </div>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <span class="font-bold">{{ Format.price(row.costPerStone) }}</span>
          </template>
        </el-table-column>
        <el-table-column align="right" width="120">
          <template #header>
            <el-tooltip placement="top" effect="light">
              <template #content>
                <div style="max-width: 320px">
                  {{ legendLines[4] }}
                </div>
              </template>
              <div style="display: flex; justify-content: flex-end; align-items: center; gap: 5px">
                <div>{{ t('价差') }}</div>
                <el-icon><Warning /></el-icon>
              </div>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <span :class="(stoneResult.stoneBid - row.costPerStone) >= 0 ? 'color-green' : 'color-red'">
              {{ Format.price(stoneResult.stoneBid - row.costPerStone) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>
