<script lang="ts" setup>
import type Calculator from "@/calculator"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { usePagination } from "@@/composables/usePagination"
import { Edit, Search } from "@element-plus/icons-vue"
import { ElMessageBox, type FormInstance, type Sort } from "element-plus"
import { cloneDeep, debounce } from "lodash-es"
import { getEnhanposestDataApi } from "@/common/apis/enhanposer/enhanposest"

import { getMarketDataApi } from "@/common/apis/game"
import { useMemory } from "@/common/composables/useMemory"
import * as Format from "@/common/utils/format"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import ActionDetail from "../dashboard/components/ActionDetail.vue"
import ActionPrice from "../dashboard/components/ActionPrice.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import ManualPriceCard from "../dashboard/components/ManualPriceCard.vue"
// #region 查
const { paginationData: paginationDataLD, handleCurrentChange: handleCurrentChangeLD, handleSizeChange: handleSizeChangeLD } = usePagination({}, "enhanposest-leaderboard-pagination")
const leaderboardData = ref<Calculator[]>([])
const ldSearchFormRef = ref<FormInstance | null>(null)

const ldSearchData = useMemory("enhanposest-leaderboard-search-data", {
  name: "",
  project: "",
  profitRate: "",
  maxLevel: 20,
  minLevel: 1,
  banEquipment: false
})

const loadingLD = ref(false)
const getLeaderboardData = debounce(() => {
  loadingLD.value = true
  getEnhanposestDataApi({
    currentPage: paginationDataLD.currentPage,
    size: paginationDataLD.pageSize,
    ...ldSearchData.value,
    sort: sortLD.value
  }).then((data) => {
    paginationDataLD.total = data.total
    leaderboardData.value = data.list
  }).catch((e) => {
    console.error(e)
    leaderboardData.value = []
  }).finally(() => {
    loadingLD.value = false
  })
}, 300)
function handleSearchLD() {
  paginationDataLD.currentPage === 1 ? getLeaderboardData() : (paginationDataLD.currentPage = 1)
  console.log("va", JSON.stringify(ldSearchData.value))
}

const sortLD: Ref<Sort | undefined> = ref()
function handleSortLD(sort: Sort) {
  sortLD.value = sort
  getLeaderboardData()
}

// 监听分页参数的变化
watch([
  () => paginationDataLD.currentPage,
  () => paginationDataLD.pageSize,
  () => getMarketDataApi(),
  () => usePlayerStore().config
], getLeaderboardData, { immediate: true })

// #endregion

// #region deepWatch

watch(() => usePriceStore(), () => {
  getLeaderboardData()
}, { deep: true })
// #endregion

const currentRow = ref<Calculator>()
const detailVisible = ref<boolean>(false)
async function showDetail(row: Calculator) {
  console.log("showDetail", row)
  currentRow.value = cloneDeep(row)
  detailVisible.value = true
}

const priceVisible = ref<boolean>(false)
const currentPriceRow = ref<Calculator>()
function setPrice(row: Calculator) {
  const activated = usePriceStore().activated
  if (!activated) {
    ElMessageBox.confirm(t("是否确定开启自定义价格？"), t("需先开启自定义价格"), {
      confirmButtonText: t("确定"),
      cancelButtonText: t("取消"),
      closeOnClickModal: true
    }).then(() => {
      usePriceStore().setActivated(true)
    })
    return
  }
  currentPriceRow.value = cloneDeep(row)
  priceVisible.value = true
}

const { t } = useI18n()
</script>

<template>
  <div class="app-container">
    <div class="game-info">
      <GameInfo />
      <div>
        <ActionConfig :actions="['enhancing']" :equipments="['hands', 'neck', 'earrings', 'ring', 'pouch']" />
      </div>
    </div>
    <el-row :gutter="20" class="row">
      <el-col :xs="24" :sm="24" :md="24" :lg="24" :xl="14">
        <el-card>
          <template #header>
            <el-form class="rank-card" ref="ldSearchFormRef" :inline="true" :model="ldSearchData">
              <div class="title">
                {{ t('利润排行') }}
              </div>
              <el-form-item prop="name" :label="t('物品')">
                <el-input style="width:100px" v-model="ldSearchData.name" :placeholder="t('请输入')" clearable @input="handleSearchLD" />
              </el-form-item>

              <el-form-item :label="t('目标等级从')">
                <el-input-number style="width:80px" :min="1" :max="20" v-model="ldSearchData.minLevel" placeholder="1" clearable @change="handleSearchLD" controls-position="right" />&nbsp;{{ t('到') }}&nbsp;
                <el-input-number style="width:80px" :min="1" :max="20" v-model="ldSearchData.maxLevel" placeholder="20" clearable @change="handleSearchLD" controls-position="right" />
              </el-form-item>
            </el-form>
          </template>
          <template #default>
            <el-table :data="leaderboardData" v-loading="loadingLD" @sort-change="handleSortLD">
              <el-table-column width="54" fixed="left">
                <template #default="{ row }">
                  <ItemIcon :hrid="row.hrid" />
                </template>
              </el-table-column>
              <el-table-column prop="result.name" :label="t('物品')" />
              <el-table-column min-width="90">
                <template #default="{ row }">
                  <div style="display:flex;">
                    <ItemIcon v-if="row.calculatorList && row.calculatorList[0].protectLevel < row.calculatorList[0].enhanceLevel" :hrid="row.calculatorList[0].protectionItem.hrid" />
                    <ItemIcon v-if="row.catalyst" :hrid="`/items/${row.catalyst}`" />
                  </div>
                  <div v-if="row.calculatorList && row.calculatorList[0].protectLevel < row.calculatorList[0].enhanceLevel">
                    {{ t('从{0}保护', [row.calculatorList[0].protectLevel]) }}
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="project" :label="t('动作')" min-width="100" />

              <el-table-column :label="t('逃逸')" min-width="60">
                <template #default="{ row }">
                  {{ row.calculatorList[0].realEscapeLevel }}
                </template>
              </el-table-column>

              <el-table-column prop="result.profitPHFormat" :label="t('利润 / h')" align="center" min-width="120">
                <template #default="{ row }">
                  <span :class="row.hasManualPrice ? 'manual' : ''">
                    {{ row.result.profitPHFormat }}&nbsp;
                  </span>
                  <el-link type="primary" :icon="Edit" @click="setPrice(row)">
                    {{ t('自定义') }}
                  </el-link>
                </template>
              </el-table-column>
              Z
              <el-table-column align="center" min-width="120">
                <template #header>
                  <div style="display: flex; justify-content: center; align-items: center; gap: 5px">
                    <div>{{ t('损耗 / h') }}</div>
                    <el-tooltip placement="top" effect="light">
                      <template #content>
                        {{ t('材料损耗+逃逸损耗') }}
                      </template>
                      <el-icon>
                        <Warning />
                      </el-icon>
                    </el-tooltip>
                  </div>
                </template>
                <template #default="{ row }">
                  <span>
                    {{ row.calculatorList[0].result.cost4EnhancePHFormat }}
                  </span>
                </template>
              </el-table-column>

              <el-table-column align="center" min-width="120">
                <template #header>
                  <div style="display: flex; justify-content: center; align-items: center; gap: 5px">
                    <div>{{ t('风险系数') }}</div>
                    <el-tooltip placement="top" effect="light">
                      <template #content>
                        {{ t('损耗 / 利润') }}
                      </template>
                      <el-icon>
                        <Warning />
                      </el-icon>
                    </el-tooltip>
                  </div>
                </template>

                <template #default="{ row }">
                  <!-- 7以上是红色，5以下是绿色 -->
                  <span
                    :class="{
                      error: row.result.risk > 7,
                      success: row.result.risk < 5,
                    }"
                  >
                    {{ row.result.profitPH > 0 ? row.result.riskFormat : '' }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column align="center" min-width="100">
                <template #header>
                  <div style="display: flex; justify-content: center; align-items: center; gap: 5px">
                    <div>{{ t('利润 / 次') }}</div>
                    <el-tooltip placement="top" effect="light">
                      <template #content>
                        {{ t('单次动作产生的利润。') }}
                        <br>
                        {{ t('#多步动作利润提示') }}
                        <br>
                        {{ t('#多步动作利润举例') }}
                      </template>
                      <el-icon>
                        <Warning />
                      </el-icon>
                    </el-tooltip>
                  </div>
                </template>
                <template #default="{ row }">
                  <span :class="row.hasManualPrice ? 'manual' : ''">
                    {{ row.result.profitPPFormat }}&nbsp;
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="result.profitRate" :label="t('利润率')" min-width="100" align="center" sortable="custom" :sort-orders="['descending', null]">
                <template #default="{ row }">
                  {{ row.result.profitRateFormat }}
                </template>
              </el-table-column>

              <el-table-column :label="t('买价')" align="center">
                <template #default="{ row }">
                  <span>
                    {{ Format.price(row.calculatorList[0].ingredientListWithPrice[0].price) }}
                  </span>
                </template>
              </el-table-column>

              <el-table-column prop="result.targetRateFormat" :label="t('成功率')" align="center" min-width="100">
                <template #header>
                  <div style="display: flex; justify-content: center; align-items: center; gap: 5px">
                    <div>{{ t('成功率') }}</div>
                    <el-tooltip placement="top" effect="light">
                      <template #content>
                        单件装备的强化成功率
                      </template>
                      <el-icon>
                        <Warning />
                      </el-icon>
                    </el-tooltip>
                  </div>
                </template>
                <template #default="{ row }">
                  {{ row.calculatorList[0].result.targetRateFormat }}
                </template>
              </el-table-column>

              <el-table-column min-width="120" :label="t('经验 / h')" align="center">
                <template #default="{ row }">
                  <div style="display: flex; justify-content: center; align-items: center; gap: 5px">
                    <div>{{ row.result.expPHFormat }}</div>
                    <el-tooltip v-if="row.expList?.length > 1" placement="top" effect="light">
                      <template #content>
                        <div v-for="(item, i) in row.expList" :key="i" style="display: flex; gap:10px">
                          <div>
                            {{ t(item.action) }}
                          </div>
                          <div>
                            {{ item.expPHFormat }}
                          </div>
                        </div>
                      </template>
                      <el-icon>
                        <Warning />
                      </el-icon>
                    </el-tooltip>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="t('详情')" align="center">
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
                :layout="paginationDataLD.layout"
                :page-sizes="paginationDataLD.pageSizes"
                :total="paginationDataLD.total"
                :page-size="paginationDataLD.pageSize"
                :current-page="paginationDataLD.currentPage"
                @size-change="handleSizeChangeLD"
                @current-change="handleCurrentChangeLD"
              />
            </div>
          </template>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="24" :md="24" :lg="24" :xl="10">
        <ManualPriceCard memory-key="enhanposest" />
      </el-col>
    </el-row>
    <ActionDetail v-model="detailVisible" :data="currentRow" />

    <ActionPrice v-model="priceVisible" :data="currentPriceRow" />
  </div>
</template>

<style lang="scss" scoped>
.error {
  color: #f56c6c;
}
.success {
  color: #67c23a;
}
.rank-card {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  .title {
    width: 160px;
    margin-bottom: 12px;
  }
}
.pager-wrapper {
  display: flex;
  justify-content: center;
}

.row {
  .el-col {
    margin-bottom: 20px;
  }
}
// 蓝色
.manual {
  color: #409eff;
}
</style>
