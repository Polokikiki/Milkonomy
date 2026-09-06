<script lang="ts" setup>
import type Calculator from "@/calculator"
import type { ItemDetail } from "~/game"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { useMemory } from "@@/composables/useMemory"
import { Setting } from "@element-plus/icons-vue"
import { ElMessage } from "element-plus"
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { compareAlchemyPaths } from "@/calculator/alchemyPath"
import { getGameDataApi } from "@/common/apis/game"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { NO_TAX_FACTOR, SELL_TAX_FACTOR } from "@/common/constants/market"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import ColumnSettings from "../dashboard/components/ColumnSettings.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

const { t } = useI18n()

const search = ref("")
const selectedItems = ref<string[]>([])
const catalystRank = useMemory("alchemy-path-catalyst-rank", 0)
const includeTax = useMemory("alchemy-path-include-tax", true)
const includeRare = useMemory("alchemy-path-include-rare", true)
const itemGroup = useMemory("alchemy-path-item-group", "all")
// 自定义组：任意分组点亮物品★加入，仅影响"自定义"筛选的显示范围
const customItems = useMemory("alchemy-path-custom-items", [] as string[])

// 列设置：勾选显隐 + 拖拽排序（与首页/炼金/打野同款）
const apColumnVisible = useMemory("ap-column-visible", {
  bestMethod: true,
  profitPH: true,
  profitPP: true,
  successRate: true,
  expPH: true
} as Record<string, boolean>)
const apColumnOrder = useMemory("ap-column-order", [
  "bestMethod",
  "profitPH",
  "profitPP",
  "successRate",
  "expPH"
])
function toggleCustom(hrid: string) {
  const index = customItems.value.indexOf(hrid)
  index === -1 ? customItems.value.push(hrid) : customItems.value.splice(index, 1)
}

// 批量收藏：弹窗多选，确认后统一加入自定义（只增不减）
const batchVisible = ref(false)
const batchSearch = ref("")
const batchSelected = ref<string[]>([])
const batchList = computed(() => {
  return tradableItemList.value.filter(item => t(item.name).toLocaleLowerCase().includes(batchSearch.value.toLowerCase()))
})
watch(batchVisible, (val) => {
  if (val) {
    batchSearch.value = ""
    batchSelected.value = []
  }
})
function toggleBatch(hrid: string) {
  const index = batchSelected.value.indexOf(hrid)
  index === -1 ? batchSelected.value.push(hrid) : batchSelected.value.splice(index, 1)
}
function saveBatch() {
  customItems.value = [...new Set([...customItems.value, ...batchSelected.value])]
  batchVisible.value = false
}

// 配饰 = 戒指/项链/耳环/袋子/饰品/护符等饰品栏装备
const ACCESSORY_TYPES = new Set(["earrings", "neck", "ring", "pouch", "trinket", "charm"])

// 物品分组：对齐游戏市场类目（资源/消耗品/技能书/迷宫/地下城/装备/配饰/工具）
function itemGroupOf(item: ItemDetail): string {
  const category = item.categoryHrid?.split("/").pop() || ""
  if (category === "equipment") {
    const type = item.equipmentDetail?.type?.split("/").pop() || ""
    if (type.endsWith("_tool")) return "tool"
    if (ACCESSORY_TYPES.has(type)) return "accessory"
    return "equip"
  }
  if (category === "resource") return "resource"
  if (category === "food" || category === "drink" || category === "scroll") return "consumable"
  if (category === "ability_book") return "book"
  if (category === "labyrinth") return "labyrinth"
  if (category === "dungeon_key") return "dungeon"
  return "other"
}

const ITEM_GROUPS = [
  { value: "all", label: "全部" },
  { value: "custom", label: "自定义" },
  { value: "equip", label: "装备" },
  { value: "accessory", label: "配饰" },
  { value: "tool", label: "工具" },
  { value: "resource", label: "资源" },
  { value: "consumable", label: "消耗品" },
  { value: "book", label: "技能书" },
  { value: "labyrinth", label: "迷宫" },
  { value: "dungeon", label: "地下城" },
  { value: "other", label: "其他" }
]
const onPriceStatusChange = usePriceStatus("alchemy-path-price-status")
function handlePriceStatusChange() {
  onPriceStatusChange()
  if (selectedItems.value.length > 0) compute()
}

// 无炼金意义的物品，从选择器排除
const EXCLUDED_HRIDS = new Set(["/items/bag_of_10_cowbells"])

const tradableItemList = computed(() => {
  // 数据未加载/加载失败时 gameData 为 null，直接给空列表，避免渲染期抛 runtime-1
  const gameData = getGameDataApi()
  if (!gameData) return []
  return Object.values(gameData.itemDetailMap)
    .filter(item => item.isTradable && !EXCLUDED_HRIDS.has(item.hrid))
    .sort((a, b) => a.sortIndex - b.sortIndex)
})

const filteredItemList = computed(() => {
  return tradableItemList.value.filter(item =>
    (itemGroup.value === "all"
      || (itemGroup.value === "custom" ? customItems.value.includes(item.hrid) : itemGroupOf(item) === itemGroup.value))
    && t(item.name).toLocaleLowerCase().includes(search.value.toLowerCase())
  )
})

function toggleItem(hrid: string) {
  const index = selectedItems.value.indexOf(hrid)
  index === -1 ? selectedItems.value.push(hrid) : selectedItems.value.splice(index, 1)
}

const loading = ref(false)
const results = ref<{ item: ItemDetail, paths: Calculator[] }[]>([])

const AUTO_CATALYST = -1
const isAutoCatalyst = computed(() => catalystRank.value === AUTO_CATALYST)
// 1 级 = 对应方式的基础催化剂：转化 / 分解 / 点金
const RANK1_CATALYSTS = ["catalyst_of_transmutation", "catalyst_of_decomposition", "catalyst_of_coinification"]

/** Calculator 子类的 catalyst getter（基类无此属性），返回催化剂 hrid（如 catalyst_of_transmutation） */
function catalystHridOf(calc: Calculator): string | undefined {
  return (calc as any).catalyst as string | undefined
}

/** 催化剂显示名（走物品名翻译），无催化剂返回「无」 */
function catalystNameOf(calc: Calculator): string {
  const hrid = catalystHridOf(calc)
  if (!hrid) return t("无")
  const name = getGameDataApi()?.itemDetailMap?.[`/items/${hrid}`]?.name
  return t(name ?? hrid)
}

function compute() {
  if (selectedItems.value.length === 0) {
    ElMessage.warning(t("请先选择物品"))
    return
  }
  loading.value = true
  // 计算量大时避免阻塞 loading 渲染
  setTimeout(() => {
    const sellTaxFactor = includeTax.value ? SELL_TAX_FACTOR : NO_TAX_FACTOR
    // 自动模式：0/1/2 级催化剂全部计算，取最优组合
    const ranks = isAutoCatalyst.value ? [0, 1, 2] : [catalystRank.value]
    try {
      const list: { item: ItemDetail, paths: Calculator[] }[] = []
      for (const hrid of selectedItems.value) {
        const item = getGameDataApi()?.itemDetailMap?.[hrid]
        if (!item) continue
        const { paths } = compareAlchemyPaths(item, ranks, sellTaxFactor, includeRare.value)
        if (paths.length > 0) list.push({ item, paths })
      }
      results.value = list
      if (list.length === 0) {
        ElMessage.warning(t("所选物品均无可用炼金方式"))
      }
    } catch (e) {
      console.error(e)
      ElMessage.error(t("计算失败或结果为空，请打开控制台查看错误"))
    } finally {
      loading.value = false
    }
  }, 50)
}

function clearSelection() {
  selectedItems.value = []
  results.value = []
}

// 重新选择物品后旧结果不再对应，清空
watch(selectedItems, () => {
  results.value = []
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
            <div class="flex items-center justify-between">
              <span>{{ t('选择物品') }}</span>
              <div class="flex items-center gap-2">
                <span class="color-gray-500 font-size-12px">{{ t('已选 {0} 个', [selectedItems.length]) }}</span>
                <el-button size="small" plain @click="batchVisible = true">
                  {{ t('批量收藏') }}
                </el-button>
              </div>
            </div>
          </template>
          <el-input v-model="search" :placeholder="t('搜索')" clearable />
          <el-radio-group v-model="itemGroup" size="small" class="mt-2 flex-wrap">
            <el-radio-button v-for="g in ITEM_GROUPS" :key="g.value" :label="g.value">
              {{ t(g.label) }}
            </el-radio-button>
          </el-radio-group>
          <div class="flex flex-wrap mt-2" style="max-height: 420px; overflow-y: auto">
            <el-button
              v-for="item in filteredItemList"
              :key="item.hrid"
              class="item-cell"
              style="width: 50px; height: 50px; margin: 2px;"
              :type="selectedItems.includes(item.hrid) ? 'primary' : ''"
              :plain="!selectedItems.includes(item.hrid)"
              @click="toggleItem(item.hrid)"
            >
              <ItemIcon :hrid="item.hrid" />
              <span
                class="custom-star"
                :class="{ active: customItems.includes(item.hrid) }"
                @click.stop="toggleCustom(item.hrid)"
              >★</span>
            </el-button>
            <div v-if="filteredItemList.length === 0" class="color-gray-500 font-size-13px" style="padding: 12px 4px">
              {{ itemGroup === 'custom' ? t('自定义组为空，在任意分组点击物品右上角的★加入') : t('无匹配物品') }}
            </div>
          </div>
          <div class="mt-2 flex items-center flex-wrap gap-2">
            <span>{{ t('催化剂') }}</span>
            <el-radio-group v-model="catalystRank" size="small">
              <el-radio-button :label="-1">
                {{ t('自动') }}
              </el-radio-button>
              <el-radio-button :label="0">
                {{ t('无') }}
              </el-radio-button>
              <el-radio-button :label="1" class="catalyst-icons">
                <el-tooltip :content="t('对应方式的催化剂（转化 / 分解 / 点金）')" placement="top">
                  <span class="flex items-center gap-1">
                    <ItemIcon v-for="h in RANK1_CATALYSTS" :key="h" :hrid="`/items/${h}`" :width="18" :height="18" />
                  </span>
                </el-tooltip>
              </el-radio-button>
              <el-radio-button :label="2" class="catalyst-icons">
                <el-tooltip :content="t('至高催化剂（三种方式通用）')" placement="top">
                  <span class="flex items-center">
                    <ItemIcon hrid="/items/prime_catalyst" :width="18" :height="18" />
                  </span>
                </el-tooltip>
              </el-radio-button>
            </el-radio-group>
            <span class="ml-2">{{ t('含市场税率') }}</span>
            <el-switch v-model="includeTax" />
            <PriceStatusSelect @change="handlePriceStatusChange" />
            <el-button type="primary" :loading="loading" @click="compute">
              {{ t('开始计算') }}
            </el-button>
            <el-button plain @click="clearSelection">
              {{ t('清空') }}
            </el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
        <el-card v-loading="loading">
          <template #header>
            <span>{{ t('最优炼金路径') }}</span>
          </template>
          <el-table :data="results" style="width: 100%">
            <el-table-column type="expand">
              <template #default="{ row }">
                <el-table :data="row.paths" size="small" style="width: 100%">
                  <el-table-column width="54">
                    <template #default>
                      <ItemIcon :hrid="row.item.hrid" />
                    </template>
                  </el-table-column>
                  <el-table-column prop="project" :label="t('方式')" />
                  <el-table-column :label="t('催化剂')" align="center">
                    <template #default="{ row: p }">
                      <el-tooltip v-if="catalystHridOf(p)" :content="catalystNameOf(p)" placement="top">
                        <ItemIcon :hrid="`/items/${catalystHridOf(p)}`" :width="18" :height="18" />
                      </el-tooltip>
                      <span v-else>{{ t('无') }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('利润 / h')" align="center">
                    <template #default="{ row: p }">
                      {{ p.result.profitPHFormat }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('利润 / 次')" align="center">
                    <template #default="{ row: p }">
                      {{ p.result.profitPPFormat }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('成功率')" align="center">
                    <template #default="{ row: p }">
                      {{ p.result.successRateFormat }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('经验 / h')" align="center">
                    <template #default="{ row: p }">
                      {{ p.result.expPHFormat }}
                    </template>
                  </el-table-column>
                </el-table>
              </template>
            </el-table-column>
            <el-table-column :label="t('物品')">
              <template #header>
                <div class="flex items-center gap-2">
                  <span>{{ t('物品') }}</span>
                  <ColumnSettings
                    :columns="[
                      { key: 'bestMethod', label: '最优方式' },
                      { key: 'profitPH', label: '利润 / h' },
                      { key: 'profitPP', label: '利润 / 次' },
                      { key: 'successRate', label: '成功率' },
                      { key: 'expPH', label: '经验 / h' },
                    ]" :visible="apColumnVisible" :order="apColumnOrder"
                  >
                    <template #reference>
                      <el-icon :size="18" style="cursor: pointer" :title="t('列设置')">
                        <Setting />
                      </el-icon>
                    </template>
                  </ColumnSettings>
                </div>
              </template>
              <template #default="{ row }">
                <div class="flex items-center gap-2">
                  <ItemIcon :hrid="row.item.hrid" />
                  <span>{{ t(row.item.name) }}</span>
                </div>
              </template>
            </el-table-column>
            <template v-for="colKey in apColumnOrder" :key="colKey">
              <el-table-column v-if="colKey === 'bestMethod' && apColumnVisible.bestMethod" :label="t('最优方式')" align="center">
                <template #default="{ row }">
                  <el-tag type="success">
                    {{ row.paths[0].project }}
                  </el-tag>
                  <el-tooltip v-if="isAutoCatalyst && catalystHridOf(row.paths[0])" :content="catalystNameOf(row.paths[0])" placement="top">
                    <ItemIcon :hrid="`/items/${catalystHridOf(row.paths[0])}`" :width="16" :height="16" class="ml-1 align-middle" />
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column v-if="colKey === 'profitPH' && apColumnVisible.profitPH" :label="t('利润 / h')" align="center">
                <template #default="{ row }">
                  {{ row.paths[0].result.profitPHFormat }}
                </template>
              </el-table-column>
              <el-table-column v-if="colKey === 'profitPP' && apColumnVisible.profitPP" :label="t('利润 / 次')" align="center">
                <template #default="{ row }">
                  {{ row.paths[0].result.profitPPFormat }}
                </template>
              </el-table-column>
              <el-table-column v-if="colKey === 'successRate' && apColumnVisible.successRate" :label="t('成功率')" align="center">
                <template #default="{ row }">
                  {{ row.paths[0].result.successRateFormat }}
                </template>
              </el-table-column>
              <el-table-column v-if="colKey === 'expPH' && apColumnVisible.expPH" :label="t('经验 / h')" align="center">
                <template #default="{ row }">
                  {{ row.paths[0].result.expPHFormat }}
                </template>
              </el-table-column>
            </template>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="batchVisible" :title="t('批量收藏')" width="640px">
      <el-input v-model="batchSearch" :placeholder="t('搜索')" clearable />
      <div class="flex flex-wrap mt-2" style="max-height: 380px; overflow-y: auto">
        <el-button
          v-for="item in batchList"
          :key="item.hrid"
          style="width: 50px; height: 50px; margin: 2px;"
          :type="batchSelected.includes(item.hrid) ? 'primary' : ''"
          :plain="!batchSelected.includes(item.hrid)"
          @click="toggleBatch(item.hrid)"
        >
          <ItemIcon :hrid="item.hrid" />
        </el-button>
      </div>
      <template #footer>
        <el-button plain @click="batchVisible = false">
          {{ t('取消') }}
        </el-button>
        <el-button type="primary" :disabled="batchSelected.length === 0" @click="saveBatch">
          {{ t('确认') }}（{{ batchSelected.length }}）
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.item-cell {
  position: relative;
}

/* 催化剂图标选项与文字选项：等高 + 内容垂直居中（避免行内 SVG 基线错位） */
:deep(.el-radio-button__inner) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

:deep(.catalyst-icons .el-radio-button__inner) {
  padding: 0 8px;
}

.custom-star {
  position: absolute;
  top: -4px;
  right: -2px;
  font-size: 14px;
  line-height: 1;
  color: var(--el-text-color-placeholder);

  &.active {
    color: #e6a23c;
  }
}
</style>
