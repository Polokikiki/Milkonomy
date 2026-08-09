<script lang="ts" setup>
import type Calculator from "@/calculator"
import { getLeaderboardDataApi } from "@@/apis/manualchemy"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { usePagination } from "@@/composables/usePagination"
import { ArrowDown, Close, Edit, Plus, Search, Warning } from "@element-plus/icons-vue"
import { ElMessage, ElMessageBox, type FormInstance, type Sort } from "element-plus"
import { cloneDeep, debounce } from "lodash-es"

import { getActionConfigOf } from "@/common/apis/player"
import { useMemory } from "@/common/composables/useMemory"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import ActionDetail from "../dashboard/components/ActionDetail.vue"

import ActionPrice from "../dashboard/components/ActionPrice.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import ManualPriceCard from "../dashboard/components/ManualPriceCard.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

// #region 查
const { paginationData: paginationDataLD, handleCurrentChange: handleCurrentChangeLD, handleSizeChange: handleSizeChangeLD } = usePagination({}, "dashboard-leaderboard-pagination")
const leaderboardData = ref<Calculator[]>([])
// 预设对比 (N-way)
const isComparing = ref(false)
const showCompareSelector = ref(false)
const comparePresets = ref<number[]>([0, 1])
const compareDataSets = ref<Record<string, Calculator>[]>([])
const compareNames = ref<string[]>([])
const COMPARE_TYPES = ['primary', 'warning', 'success', 'danger', 'info'] as const
const compareIdxA = ref(0)
let _compareResolve: (() => void) | null = null
const compareSelectorRef = ref<HTMLElement>()

function onCompareSelectorClickOutside(e: MouseEvent) {
  if (compareSelectorRef.value && !compareSelectorRef.value.contains(e.target as Node)) {
    const target = e.target as HTMLElement
    if (target.closest('.el-popper') || target.closest('.el-dropdown-menu')) return
    if (showCompareSelector.value) showCompareSelector.value = false
  }
}

watch(showCompareSelector, (val) => {
  if (val) {
    setTimeout(() => document.addEventListener('click', onCompareSelectorClickOutside), 0)
  } else {
    document.removeEventListener('click', onCompareSelectorClickOutside)
  }
})

const ldSearchFormRef = ref<FormInstance | null>(null)

const ldSearchData = useMemory("dashboard-manualchemy-search-data", {
  name: "",
  project: "",
  profitRate: 10,
  banEquipment: true
})

const loadingLD = ref(false)
const getLeaderboardData = debounce(() => {
  loadingLD.value = true
  getLeaderboardDataApi({
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
  () => useGameStore().marketData,
  () => usePlayerStore().config,
  () => useGameStore().buyStatus,
  () => useGameStore().sellStatus
], getLeaderboardData, { immediate: true })

// #endregion

watch(() => usePriceStore(), () => {
  getLeaderboardData()
}, { deep: true })
// #endregion

function addCompareSlot() {
  const ps = usePlayerStore()
  const next = comparePresets.value.length
  comparePresets.value.push(next < ps.presets.length ? next : 0)
}

function removeCompareSlot(index: number) {
  if (comparePresets.value.length <= 2) return
  comparePresets.value.splice(index, 1)
}

function startNCompare() {
  const ps = usePlayerStore()
  if (comparePresets.value.length < 2) {
    ElMessage.warning(t('请选择至少2个预设进行对比'))
    return
  }
  
  compareNames.value = comparePresets.value.map(i => ps.presets[i]?.name || '预设' + i)
  compareIdxA.value = ps.presetIndex
  compareDataSets.value = []
  
  const unique = [...new Set(comparePresets.value)]
  let currentIdx = 0
  
  function captureNext() {
    if (currentIdx >= unique.length) {
      const expanded = comparePresets.value.map(pidx => {
        const idx = unique.indexOf(pidx)
        return compareDataSets.value[idx >= 0 ? idx : 0]
      })
      compareDataSets.value = expanded
      isComparing.value = true
      _compareResolve = null
      usePlayerStore().switchTo(compareIdxA.value)
      return
    }
    
    const pidx = unique[currentIdx]
    currentIdx++
    
    if (pidx === usePlayerStore().presetIndex) {
      const map: Record<string, Calculator> = {}
      for (const item of leaderboardData.value) map[item.key] = item
      compareDataSets.value.push(map)
      captureNext()
    } else {
      _compareResolve = captureNext
      usePlayerStore().switchTo(pidx)
    }
  }
  
  captureNext()
}

// Watch leaderboardData: capture data for comparison
watch(leaderboardData, (newVal) => {
  if (_compareResolve) {
    const map: Record<string, Calculator> = {}
    for (const item of newVal) map[item.key] = item
    compareDataSets.value.push(map)
    const resolve = _compareResolve
    _compareResolve = null
    resolve()
  }
})

function exitCompare() {
  isComparing.value = false
  compareDataSets.value = []
  _compareResolve = null
}

const displayLeaderboardData = computed(() => {
  if (!isComparing.value || compareDataSets.value.length === 0) return leaderboardData.value
  return leaderboardData.value.map(row => {
    const dataSets = compareDataSets.value
    const result: any = { ...row, _compareData: [] as (Calculator | null)[] }
    for (const ds of dataSets) {
      result._compareData.push(ds[row.key] || null)
    }
    return result
  })
})

const currentRow = ref<Calculator>()
const detailVisible = ref<boolean>(false)
async function showDetail(row: Calculator) {
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
const onPriceStatusChange = usePriceStatus("manualchemy-price-status")
</script>

<template>
  <div class="app-container">
    <div class="game-info">
      <GameInfo />
      <div>
        <ActionConfig @toggleCompare="!isComparing && (showCompareSelector = !showCompareSelector)" />
      </div>

      <PriceStatusSelect
        @change="onPriceStatusChange"
      />
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
              <el-form-item prop="phone" :label="t('动作')">
                <el-select v-model="ldSearchData.project" :placeholder="t('请选择')" style="width:100px" clearable @change="handleSearchLD">
                  <el-option :label="t('挤奶')" :value="t('挤奶')" />
                  <el-option :label="t('采摘')" :value="t('采摘')" />
                  <el-option :label="t('伐木')" :value="t('伐木')" />
                  <el-option :label="t('锻造')" :value="t('锻造')" />
                  <el-option :label="t('制造')" :value="t('制造')" />
                  <el-option :label="t('裁缝')" :value="t('裁缝')" />
                  <el-option :label="t('烹饪')" :value="t('烹饪')" />
                  <el-option :label="t('冲泡')" :value="t('冲泡')" />
                  <el-option :label="t('点金')" :value="t('点金')" />
                  <el-option :label="t('分解')" :value="t('分解')" />
                  <el-option :label="t('转化')" :value="t('转化')" />
                </el-select>
              </el-form-item>

              <el-form-item prop="name" :label="`${t('利润率')} >`">
                <el-input style="width:60px" v-model="ldSearchData.profitRate" :placeholder="t('请输入')" clearable @input="handleSearchLD" />&nbsp;%
              </el-form-item>
              <el-form-item>
                <el-checkbox v-model="ldSearchData.banEquipment" @change="handleSearchLD">
                  {{ t('排除装备') }}
                </el-checkbox>
              </el-form-item>
            </el-form>
          </template>
          <template #default>            <!-- N-way 对比选择器 -->
          <div
            v-if="showCompareSelector || isComparing"
            ref="compareSelectorRef"
            style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding:10px 16px;border:1px solid var(--el-border-color);border-radius:4px"
          >
            <template v-for="(pidx, si) in comparePresets" :key="si">
              <span v-if="si > 0" style="font-weight:bold;color:var(--el-text-color-secondary)">vs</span>
              <el-dropdown trigger="click" @command="(i: number) => comparePresets[si] = i">
                <el-button size="small" :type="COMPARE_TYPES[si % 5]" plain style="min-width:80px;text-align:center">
                  {{ usePlayerStore().presets[pidx]?.name || '预设' + pidx }}
                  <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="(p, i) in usePlayerStore().presets"
                      :key="i"
                      :command="i"
                      :class="{ 'is-active': pidx === i }"
                    >
                      {{ p.name || '预设' + i }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button
                v-if="comparePresets.length > 2"
                size="small"
                :icon="Close"
                circle
                @click.stop="removeCompareSlot(si)"
                style="margin-left:-4px"
              />
            </template>
            <el-button size="small" :icon="Plus" circle @click.stop="addCompareSlot" />
            <el-button size="small" type="primary" @click.stop="startNCompare()">{{ t("开始对比") }}</el-button>
            <el-button size="small" plain @click.stop="exitCompare(); showCompareSelector = false" style="margin-left:auto">{{ t("退出对比") }}</el-button>
          </div>
            <el-table :data="displayLeaderboardData" v-loading="loadingLD" @sort-change="handleSortLD">
              <el-table-column width="54">
                <template #default="{ row }">
                  <ItemIcon :hrid="row.hrid" />
                </template>
              </el-table-column>
              <el-table-column prop="result.name" :label="t('物品')" />
              <el-table-column width="54">
                <template #default="{ row }">
                  <ItemIcon v-if="row.catalyst" :hrid="`/items/${row.catalyst}`" />
                </template>
              </el-table-column>
              <el-table-column prop="project" :label="t('动作')" />
              <el-table-column prop="actionLevel" :label="t('要求等级')" align="center">
                <template #default="{ row }">
                  <div :class="row.actionLevel > getActionConfigOf(row.action).playerLevel ? 'red' : ''">
                    {{ row.actionLevel }}
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="t('利润 / 天')" align="center" min-width="120">
                <template #default="{ row }">
                  <span :class="row.hasManualPrice ? 'manual' : ''">
                    <template v-if="isComparing && row._compareData?.length">
                      <template v-for="(cd, ci) in row._compareData" :key="ci">
                        <span v-if="cd">
                          <span v-if="ci > 0"> / </span>
                          <span :style="{color: ['#409eff','#e6a23c','#16ab1b','#f56c6c','#909399'][ci % 5]}">{{ cd.result.profitPDFormat }}</span>
                        </span>
                      </template>
                    </template>
                    <span v-else style="word-break:break-all;display:inline-block;max-width:180px">{{ row.result.profitPDFormat }}</span>&nbsp;
                  </span>
                  <el-link type="primary" :icon="Edit" @click="setPrice(row)">
                    {{ t('自定义') }}
                  </el-link>
                </template>
              </el-table-column>
              <el-table-column prop="result.profitPHFormat" :label="t('利润 / h')" align="center" min-width="120">
                <template #default="{ row }">
                  <span>
                    <template v-if="isComparing && row._compareData?.length">
                      <template v-for="(cd, ci) in row._compareData" :key="ci">
                        <span v-if="cd">
                          <span v-if="ci > 0"> / </span>
                          <span :style="{color: ['#409eff','#e6a23c','#16ab1b','#f56c6c','#909399'][ci % 5]}">{{ cd.result.profitPHFormat }}</span>
                        </span>
                      </template>
                    </template>
                    <span v-else style="word-break:break-all;display:inline-block;max-width:180px">{{ row.result.profitPHFormat }}</span>&nbsp;
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="result.profitRate" :label="t('利润率')" min-width="120" align="center" sortable="custom" :sort-orders="['descending', null]">
                <template #default="{ row }">
                  <template v-if="isComparing && row._compareData?.length">
                      <template v-for="(cd, ci) in row._compareData" :key="ci">
                        <span v-if="cd">
                          <span v-if="ci > 0"> / </span>
                          <span :style="{color: ['#409eff','#e6a23c','#16ab1b','#f56c6c','#909399'][ci % 5]}">{{ cd.result.profitRateFormat }}</span>
                        </span>
                      </template>
                    </template>
                    <span v-else>{{ row.result.profitRateFormat }}</span>
                </template>
              </el-table-column>

              <el-table-column align="center" min-width="120">
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

              <el-table-column min-width="120" :label="t('经验 / h')" align="center">
                <template #default="{ row }">
                  <div style="display: flex; justify-content: center; align-items: center; gap: 5px">
                    <template v-if="isComparing && row._compareData?.length">
                        <template v-for="(cd, ci) in row._compareData" :key="ci">
                          <span v-if="cd">
                            <span v-if="ci > 0"> / </span>
                            <span :style="{color: ['#409eff','#e6a23c','#16ab1b','#f56c6c','#909399'][ci % 5]}">{{ cd.result.expPHFormat }}</span>
                          </span>
                        </template>
                      </template>
                      <span v-else>{{ row.result.expPHFormat }}</span>
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
        <ManualPriceCard memory-key="manualchemy" />
      </el-col>
    </el-row>
    <ActionDetail v-model="detailVisible" :data="currentRow" />

    <ActionPrice v-model="priceVisible" :data="currentPriceRow" />
  </div>
</template>

<style lang="scss" scoped>
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

.red {
  color: #f56c6c;
}
.green {
  color: #67c23a;
}
</style>
