<script lang="ts" setup>
import type Calculator from "@/calculator"
import { getLeaderboardDataApi } from "@@/apis/leaderboard"
import { isShopTier, normalizeProject, parseTierLevel, supportsTierFilter, TIER_CHAINS } from "@@/apis/leaderboard/tierChains"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { usePagination } from "@@/composables/usePagination"
import { ArrowDown, Close, Delete, Edit, Plus, Search, Star, StarFilled, Warning } from "@element-plus/icons-vue"
import { ElMessage, ElMessageBox, type FormInstance, type Sort } from "element-plus"
import { cloneDeep, debounce } from "lodash-es"

import { addFavoriteApi, deleteFavoriteApi, getFavoriteDataApi } from "@/common/apis/favorite"
import { getPriceOf } from "@/common/apis/game"
import { getActionConfigOf } from "@/common/apis/player"
import { useMemory } from "@/common/composables/useMemory"
import { useAnnouncement } from "@/common/composables/useAnnouncement"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import * as Format from "@/common/utils/format"
import { useFavoriteStore } from "@/pinia/stores/favorite"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import ActionConfig from "./components/ActionConfig.vue"
import ActionDetail from "./components/ActionDetail.vue"

import ActionPrice from "./components/ActionPrice.vue"
import GameInfo from "./components/GameInfo.vue"
import ManualPriceCard from "./components/ManualPriceCard.vue"
import PriceStatusSelect from "./components/PriceStatusSelect.vue"

// #region 查
const favoriteStore = useFavoriteStore()
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
 
 // If already on this preset, capture immediately without waiting for switch
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

const ldSearchFormRef = ref<FormInstance | null>(null)

const ldSearchData = useMemory("dashboard-leaderboard-search-data", {
 name: "",
 project: "",
 profitRate: 10,
 maxItemLevel: undefined,
 minVolume1h: undefined,
 maxVolume1h: undefined,
 banEquipment: true,
 banCharm: false,
 tierChainKey: "",
 startTierLevel: "",
 endTierLevel: "",
 pureOnly: false
})

const includeTax = useMemory("dashboard-include-tax", true)
const crossStepBalance = useMemory("dashboard-cross-step-balance", false)

const { visible: announceVisible, dismiss: announceDismiss } = useAnnouncement()

const loadingLD = ref(false)

const getLeaderboardData = debounce(() => {
 loadingLD.value = true
 getLeaderboardDataApi({
 currentPage: paginationDataLD.currentPage,
 size: paginationDataLD.pageSize,
 includeTax: includeTax.value,
 crossStepBalance: crossStepBalance.value,
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
 () => includeTax.value,
 () => crossStepBalance.value,
 () => useGameStore().marketData,
 () => usePlayerStore().config,
 () => useGameStore().buyStatus,
 () => useGameStore().sellStatus
], getLeaderboardData, { immediate: true })

const { paginationData: paginationDataMN, handleCurrentChange: handleCurrentChangeFR, handleSizeChange: handleSizeChangeFR } = usePagination({}, "dashboard-favorite-pagination")
const favoriteData = ref<Calculator[]>([])
const frSearchFormRef = ref<FormInstance | null>(null)
const frSearchData = useMemory("dashboard-favorite-search-data", {
 name: "",
 project: "",
 minVolume1h: undefined,
 maxVolume1h: undefined,
 banCharm: false
})

const loadingFR = ref(false)
function getFavoriteData() {
 loadingFR.value = true
 getFavoriteDataApi({
 currentPage: paginationDataMN.currentPage,
 size: paginationDataMN.pageSize,
 includeTax: includeTax.value,
 crossStepBalance: crossStepBalance.value,
 ...frSearchData.value
 }).then((data) => {
 paginationDataMN.total = data.total
 favoriteData.value = data.list
 }).catch(() => {
 favoriteData.value = []
 }).finally(() => {
 loadingFR.value = false
 })
}

function handleSearchMN() {
 paginationDataMN.currentPage === 1 ? getFavoriteData() : (paginationDataMN.currentPage = 1)
}

function handleIncludeTaxChange() {
 handleSearchLD()
 handleSearchMN()
}
// 监听分页参数的变化
watch([
 () => paginationDataMN.currentPage,
 () => paginationDataMN.pageSize,
 () => includeTax.value,
 () => crossStepBalance.value,
 () => useGameStore().marketData,
 () => usePlayerStore().config,
 () => useGameStore().buyStatus,
 () => useGameStore().sellStatus
], getFavoriteData, { immediate: true })

// #endregion

// #region deepWatch
watch(() => favoriteStore.list, () => {
 getLeaderboardData()
 getFavoriteData()
}, { deep: true })

watch(() => usePriceStore(), () => {
 getLeaderboardData()
 getFavoriteData()
}, { deep: true })
// #endregion

const currentRow = ref<Calculator>()
const detailVisible = ref<boolean>(false)
async function showDetail(row: Calculator) {
 currentRow.value = cloneDeep(row)
 detailVisible.value = true
}
function addFavorite(row: Calculator) {
 const r = row || currentRow.value!
 try {
 addFavoriteApi(r)
 detailVisible.value = false
 } catch (e: any) {
 ElMessage.error(e.message)
 }
}

function deleteFavorite(row: Calculator) {
 try {
 deleteFavoriteApi(row)
 } catch (e: any) {
 ElMessage.error(e.message)
 }
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

const { t, locale } = useI18n()

// 逐级制作 / 起始材质
const showTierFilter = computed(() => supportsTierFilter(ldSearchData.value.project))
const tierChains = computed(() => TIER_CHAINS[normalizeProject(ldSearchData.value.project)] || [])
const currentChain = computed(() => {
 const chains = tierChains.value
 if (chains.length === 0) return null
 const found = chains.find(c => c.key === ldSearchData.value.tierChainKey)
 return found || chains[0]
})
const tierOptions = computed(() => {
 // 多链（裁缝）未选链时合并，用统一等级名
 if (!ldSearchData.value.tierChainKey) {
 const chains = tierChains.value
 const allTiers: { itemLevel: number; label: string; shopCost?: number }[] = []
 const seen = new Set<number>()
 for (const chain of chains) {
 for (const tier of chain.tiers) {
 if (!seen.has(tier.itemLevel) && tier.itemLevel <= 95) {
 seen.add(tier.itemLevel)
 allTiers.push({ ...tier, label: chains.length > 1 ? `Lv${tier.itemLevel}` : tier.label })
 }
 }
 }
 allTiers.sort((a, b) => a.itemLevel - b.itemLevel)
 return allTiers
 }
 return currentChain.value?.tiers || []
})

function handleProjectChange() {
 ldSearchData.value.tierChainKey = ""
 ldSearchData.value.startTierLevel = ""
 ldSearchData.value.endTierLevel = ""
 handleSearchLD()
}
function handleTierChainChange() {
 ldSearchData.value.startTierLevel = ""
 ldSearchData.value.endTierLevel = ""
 handleSearchLD()
}

function formatVolume1h(row: any) {
 const hrid = row?.hrid
 const level = row?.calculator?.enhanceLevel ?? row?.enhanceLevel ?? 0
 const vol = getPriceOf(hrid, level).vol ?? -1
 return vol < 0 ? "-" : Format.number(vol)
}

const onPriceStatusChange = usePriceStatus("dashboard-price-status")
// 离开页面时重置
</script>

<template>
 <el-dialog v-model="announceVisible" :title="locale === 'en' ? 'Milkonomy v2.2.3 Update' : 'Milkonomy v2.2.3 更新'" width="560px" :close-on-click-modal="false" @close="announceDismiss">
 <!-- 中文公告 -->
 <div v-if="locale !== 'en'" style="line-height:2;font-size:14px">
 <p style="font-weight:bold;margin-bottom:8px">一、哞卡社区 Buff</p>
 <p>1. 预设配置新增「哞卡（Moo Card）」社区 Buff，排在首位。</p>

 <p style="font-weight:bold;margin-bottom:8px;margin-top:12px">二、数据导出插件同步</p>
 <p>1. 导出脚本已适配哞卡数据，一键导入即可带哞卡等级。</p>
 <p>2. 安装/更新脚本后刷新页面生效。</p>

 <p style="font-weight:bold;margin-bottom:8px;margin-top:12px">三、脚本未安装通知</p>
 <p>1. 未安装导出脚本时，点击「一键导入」弹出下载指引，含直接下载和 GreasyFork 链接。</p>

 <p style="font-weight:bold;margin-bottom:8px;margin-top:12px">四、经验排序</p>
 <p>1. 首页经验/h列新增排序（降序/升序）。</p>
 <p>2. 打野工具经验/h列同步支持排序。</p>

 <p style="margin-top:8px">📥 <a href="https://home.greasyfork.org.cn/zh-hans/info#/zh-CN/scripts/587094/detail" target="_blank" style="color:#409eff">安装脚本</a></p>

 <p style="color:#909399;font-size:12px;margin-top:16px">每个版本首次打开弹出，关闭后不再重复显示</p>
 </div>

 <!-- English Announcement -->
 <div v-else style="line-height:2;font-size:14px">
 <p style="font-weight:bold;margin-bottom:8px">1. Moo Card Community Buff</p>
 <p>1.1 New "Moo Card" community buff added to preset configuration, listed first.</p>

 <p style="font-weight:bold;margin-bottom:8px;margin-top:12px">2. Data Exporter Plugin Sync</p>
 <p>2.1 Exporter script now includes moo card data for one-click import.</p>
 <p>2.2 Install/update the script and refresh to take effect.</p>

 <p style="font-weight:bold;margin-bottom:8px;margin-top:12px">3. Script Not Installed Notification</p>
 <p>3.1 When clicking "One-Click Import" without the exporter script, a download guide pops up.</p>

 <p style="font-weight:bold;margin-bottom:8px;margin-top:12px">4. Experience Sorting</p>
 <p>4.1 Dashboard exp/h column now supports sorting (descending/ascending).</p>
 <p>4.2 Jungle tool exp/h column also supports sorting.</p>

 <p style="margin-top:8px">📥 <a href="https://home.greasyfork.org.cn/zh-hans/info#/zh-CN/scripts/587094/detail" target="_blank" style="color:#409eff">Install Script</a></p>

 <p style="color:#909399;font-size:12px;margin-top:16px">Shown once per version. Close to dismiss.</p>
 </div>

 <template #footer>
 <el-button type="primary" @click="announceDismiss">{{ locale === 'en' ? 'Got it' : '知道了' }}</el-button>
 </template>
 </el-dialog>
 <div class="app-container">
 <div class="game-info">
 <GameInfo />
 <div>
 <ActionConfig @toggleCompare="!isComparing && (showCompareSelector = !showCompareSelector)" />
 </div>

 <PriceStatusSelect
 @change="onPriceStatusChange"
 />

 <el-checkbox v-model="includeTax" @change="handleIncludeTaxChange">
 {{ t('计算税率') }}
 </el-checkbox>

 <el-tooltip placement="top" effect="light">
 <template #content>
 {{ t('#多步产量修正提示') }}
 </template>
 <el-checkbox v-model="crossStepBalance" @change="handleIncludeTaxChange">
 {{ t('多步产量修正') }}
 </el-checkbox>
 </el-tooltip>
 </div>
 <el-row :gutter="20" class="row">
 <el-col :xs="24" :sm="24" :md="24" :lg="24" :xl="16">
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
 <el-select v-model="ldSearchData.project" :placeholder="t('请选择')" style="width:100px" clearable @change="handleProjectChange">
 <el-option :label="t('挤奶')" :value="'挤奶'" />
 <el-option :label="t('采摘')" :value="'采摘'" />
 <el-option :label="t('伐木')" :value="'伐木'" />
 <el-option :label="t('锻造')" :value="'锻造'" />
 <el-option :label="t('制造')" :value="'制造'" />
 <el-option :label="t('裁缝')" :value="'裁缝'" />
 <el-option :label="t('烹饪')" :value="'烹饪'" />
 <el-option :label="t('冲泡')" :value="'冲泡'" />
 <el-option :label="t('点金')" :value="'点金'" />
 <el-option :label="t('分解')" :value="'分解'" />
 <el-option :label="t('转化')" :value="'转化'" />
 </el-select>
 </el-form-item>

 <!-- 逐级制作 / 起始材质（仅锻造/制造/裁缝） -->
 <template v-if="showTierFilter">
 <el-form-item v-if="tierChains.length > 1" :label="t('材质链')">
 <el-radio-group v-model="ldSearchData.tierChainKey" size="small" @change="handleTierChainChange">
 <el-radio-button label="" class="tier-chain-btn">{{ t('全部') }}</el-radio-button>
 <el-radio-button v-for="c in tierChains" :key="c.key" :label="c.key" class="tier-chain-btn">{{ t(c.label) }}</el-radio-button>
 </el-radio-group>
 </el-form-item>

 <el-form-item :label="t('起始材质')">
 <el-select v-model="ldSearchData.startTierLevel" :placeholder="t('不限')" style="width:120px" clearable @change="handleSearchLD">
 <template v-for="tier in tierOptions" :key="tier.itemLevel">
 <el-option :label="t(tier.label)" :value="tier.itemLevel" />
 <el-option v-if="tier.shopCost" :label="t(tier.label) + t('（商店）')" :value="tier.itemLevel + '_shop'" />
 </template>
 </el-select>
 </el-form-item>

 <el-form-item :label="t('制作到')">
 <el-select v-model="ldSearchData.endTierLevel" :placeholder="t('不限')" style="width:90px" clearable @change="handleSearchLD">
 <el-option v-for="tier in tierOptions" :key="tier.itemLevel" :label="t(tier.label)" :value="tier.itemLevel" />
 </el-select>
 </el-form-item>

 <el-form-item :label="t('纯净火车')">
 <el-switch v-model="ldSearchData.pureOnly" @change="handleSearchLD" />
 <el-tooltip :content="t('仅显示所有原料均来自当前材质链的产物，排除混入战斗/稀有掉落（精通之油、洞察之枝、专精之线）的装备')" placement="top">
 <el-icon style="margin-left:6px;cursor:help;color:#909399"><QuestionFilled /></el-icon>
 </el-tooltip>
 </el-form-item>
 </template>

 <el-form-item prop="name" :label="`${t('利润率')} >`">
 <el-input style="width:60px" v-model="ldSearchData.profitRate" :placeholder="t('请输入')" clearable @input="handleSearchLD" />&nbsp;%
 </el-form-item>
 <!-- 要求等级 >= -->
 <el-form-item :label="`${t('要求等级')} ≥`">
 <el-input-number
 v-model="ldSearchData.actionLevel"
 :min="0"
 :max="200"
 :controls="false"
 @change="handleSearchLD"
 style="width: 60px;"
 />
 </el-form-item>

 <el-form-item :label="`${t('物品等级')} ≤`">
 <el-input-number
 v-model="ldSearchData.maxItemLevel"
 :controls="false"
 @change="handleSearchLD"
 style="width: 80px;"
 />
 </el-form-item>

 <el-form-item :label="`${t('成交量(1h)')} ≥`">
 <el-input-number
 v-model="ldSearchData.minVolume1h"
 :min="0"
 :controls="false"
 @change="handleSearchLD"
 style="width: 90px;"
 />
 </el-form-item>

 <el-form-item :label="`${t('成交量(1h)')} ≤`">
 <el-input-number
 v-model="ldSearchData.maxVolume1h"
 :min="0"
 :controls="false"
 @change="handleSearchLD"
 style="width: 90px;"
 />
 </el-form-item>

 <el-form-item>
 <el-checkbox v-model="ldSearchData.banEquipment" @change="handleSearchLD">
 {{ t('排除装备') }}
 </el-checkbox>
 </el-form-item>

 <el-form-item>
 <el-checkbox v-model="ldSearchData.banCharm" @change="handleSearchLD">
 {{ t('排除护符') }}
 </el-checkbox>
 </el-form-item>
 </el-form>
 </template>
 <template #default>
 <!-- N-way 对比选择器 -->
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
 <el-table :data="displayLeaderboardData" v-loading="loadingLD" @sort-change="handleSortLD" style="overflow-x:auto">
 <el-table-column width="54" fixed="left">
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
 <span v-else style="word-break:break-all;display:inline-block;max-width:200px">{{ row.result.profitPDFormat }}</span>&nbsp;
 </span>
 <el-link type="primary" :icon="Edit" @click="setPrice(row)">
 {{ t('自定义') }}
 </el-link>
 </template>
 </el-table-column>
 <el-table-column :label="t('利润 / h')" align="center" min-width="120"><template #default="{ row }"><template v-if="isComparing && row._compareData?.length"><template v-for="(cd, ci) in row._compareData" :key="ci"><span v-if="cd"><span v-if="ci > 0"> / </span><span :style="{color: ['#409eff','#e6a23c','#16ab1b','#f56c6c','#909399'][ci % 5]}">{{ cd.result.profitPHFormat }}</span></span></template></template><span v-else style="word-break:break-all;display:inline-block;max-width:180px">{{ row.result.profitPHFormat }}</span></template>
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
 <div>
 <template v-if="isComparing && row._compareData?.length">
 <template v-for="(cd, ci) in row._compareData" :key="ci">
 <span v-if="cd">
 <span v-if="ci > 0"> / </span>
 <span :style="{color: ['#409eff','#e6a23c','#16ab1b','#f56c6c','#909399'][ci % 5]}">{{ cd.result.expPHFormat }}</span>
 </span>
 </template>
 </template>
 <span v-else>{{ row.result.expPHFormat }}</span>
 </div>
 <el-tooltip v-if="row.expList?.length > 1" placement="top" effect="light">
 <template #content>
 <div v-for="(item, i) in row.expList" :key="i" style="display: flex; gap:10px">
 <div>{{ t(item.action) }}</div>
 <div>{{ item.expPHFormat }}</div>
 </div>
 </template>
 <el-icon><Warning /></el-icon>
 </el-tooltip>
 </div>
 </template>
 </el-table-column>
 <el-table-column :label="t('成交量(1h)')" align="center" min-width="120">
 <template #default="{ row }">
 <span>{{ formatVolume1h(row) }}</span>
 </template>
 </el-table-column>

 <el-table-column :label="t('详情')" align="center">
 <template #default="{ row }">
 <el-link type="primary" :icon="Search" @click="showDetail(row)">
 {{ t('查看') }}
 </el-link>
 </template>
 </el-table-column>

 <el-table-column prop="favorite" :label="t('收藏')" align="center" sortable="custom" :sort-orders="['descending', null]">
 <template #default="{ row }">
 <el-link v-if="!favoriteStore.hasFavorite(row)" :underline="false" type="warning" :icon="Star" @click="addFavorite(row)" style="font-size:24px" />
 <el-link v-else :underline="false" :icon="StarFilled" type="warning" @click="deleteFavorite(row)" style="font-size:28px" />
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

 <el-col :xs="24" :sm="24" :md="24" :lg="24" :xl="8">
 <ManualPriceCard memory-key="dashboard" />
 </el-col>

 <el-col :xs="24" :sm="24" :md="24" :lg="24" :xl="16">
 <el-card>
 <template #header>
 <el-form class="rank-card" ref="frSearchFormRef" :inline="true" :model="frSearchData">
 <div class="title">
 {{ t('收藏夹') }}
 </div>
 <el-form-item prop="name" :label="t('物品')">
 <el-input style="width:100px" v-model="frSearchData.name" :placeholder="t('请输入')" clearable @input="handleSearchMN" />
 </el-form-item>
 <el-form-item prop="phone" :label="t('动作')">
 <el-select v-model="frSearchData.project" :placeholder="t('请选择')" style="width:100px" clearable @change="handleSearchMN">
 <el-option :label="t('挤奶')" :value="'挤奶'" />
 <el-option :label="t('采摘')" :value="'采摘'" />
 <el-option :label="t('伐木')" :value="'伐木'" />
 <el-option :label="t('锻造')" :value="'锻造'" />
 <el-option :label="t('制造')" :value="'制造'" />
 <el-option :label="t('裁缝')" :value="'裁缝'" />
 <el-option :label="t('烹饪')" :value="'烹饪'" />
 <el-option :label="t('冲泡')" :value="'冲泡'" />
 <el-option :label="t('点金')" :value="'点金'" />
 <el-option :label="t('分解')" :value="'分解'" />
 <el-option :label="t('转化')" :value="'转化'" />
 </el-select>
 </el-form-item>

 <el-form-item>
 <el-checkbox v-model="frSearchData.banCharm" @change="handleSearchMN">
 {{ t('排除护符') }}
 </el-checkbox>
 </el-form-item>

 <el-form-item :label="`${t('成交量(1h)')} ≥`">
 <el-input-number
 v-model="frSearchData.minVolume1h"
 :min="0"
 :controls="false"
 @change="handleSearchMN"
 style="width: 90px;"
 />
 </el-form-item>

 <el-form-item :label="`${t('成交量(1h)')} ≤`">
 <el-input-number
 v-model="frSearchData.maxVolume1h"
 :min="0"
 :controls="false"
 @change="handleSearchMN"
 style="width: 90px;"
 />
 </el-form-item>
 </el-form>
 </template>
 <template #default>
 <el-table :data="favoriteData" v-loading="loadingFR">
 <el-table-column width="54" fixed="left">
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
 <el-table-column :label="t('利润 / 天')">
 <template #default="{ row }">
 <span :class="row.hasManualPrice ? 'manual' : ''">
 <span style="word-break:break-all;display:inline-block;max-width:200px">{{ row.result.profitPDFormat }}</span>&nbsp;
 </span>
 <el-link v-if="usePriceStore().activated" type="primary" :icon="Edit" @click="setPrice(row)">
 {{ t('自定义') }}
 </el-link>
 </template>
 </el-table-column>
 <el-table-column prop="result.profitPHFormat" :label="t('利润 / h')" align="center" min-width="120" />
 <el-table-column prop="result.expPHFormat" :label="t('经验 / h')" align="center" min-width="120" />
 <el-table-column prop="result.profitRateFormat" :label="t('利润率')" align="center" min-width="120" />
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
 <el-table-column :label="t('成交量(1h)')" align="center" min-width="120">
 <template #default="{ row }">
 {{ formatVolume1h(row) }}
 </template>
 </el-table-column>
 <el-table-column :label="t('详情')">
 <template #default="{ row }">
 <el-link type="primary" :icon="Search" @click="showDetail(row)">
 {{ t('查看') }}
 </el-link>
 </template>
 </el-table-column>
 <el-table-column :label="t('操作')">
 <template #default="{ row }">
 <el-link type="danger" :icon=" Delete" @click="deleteFavorite(row)">
 {{ t('删除') }}
 </el-link>
 </template>
 </el-table-column>
 </el-table>
 </template>
 <template #footer>
 <div class="pager-wrapper">
 <el-pagination
 background
 :layout="paginationDataMN.layout"
 :page-sizes="paginationDataMN.pageSizes"
 :total="paginationDataMN.total"
 :page-size="paginationDataMN.pageSize"
 :current-page="paginationDataMN.currentPage"
 @size-change="handleSizeChangeFR"
 @current-change="handleCurrentChangeFR"
 />
 </div>
 </template>
 </el-card>
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
.tier-chain-btn :deep(.el-radio-button__inner) {
 width: 56px;
 text-align: center;
 padding-left: 0;
 padding-right: 0;
}
</style>
