<script lang="ts" setup>
import type { ActionUpgradeResult, EvalMode, PresetUpgradeResult, UpgradeCandidate } from "@/common/apis/upgrade"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import * as Format from "@@/utils/format"
import { QuestionFilled } from "@element-plus/icons-vue"
import { ElMessage } from "element-plus"
import { getMarketDataApi } from "@/common/apis/game"
import { getUpgradeCompareApi, SLOT_LABEL_KEYS, UPGRADE_SLOTS } from "@/common/apis/upgrade"
import { usePlayerStore } from "@/pinia/stores/player"

const { t } = useI18n()
const playerStore = usePlayerStore()

const selectedPreset = ref(0)
const actionFilter = ref<string>("all")
const evalMode = ref<EvalMode>("all")
const topN = ref(3)
const showAll = ref(false)
const loading = ref(false)
const progressLabel = ref("")
const progressCurrent = ref(0)
const progressTotal = ref(0)
const results = ref<PresetUpgradeResult[]>([])

const ACTION_OPTIONS = [
  { value: "milking", label: "挤奶" },
  { value: "foraging", label: "采摘" },
  { value: "woodcutting", label: "伐木" },
  { value: "cheesesmithing", label: "锻造" },
  { value: "crafting", label: "制造" },
  { value: "tailoring", label: "裁缝" },
  { value: "cooking", label: "烹饪" },
  { value: "brewing", label: "冲泡" },
  { value: "alchemy", label: "炼金" }
]

const progressPercent = computed(() => {
  if (!progressTotal.value) return 0
  return Math.round((progressCurrent.value / progressTotal.value) * 100)
})

async function runCompare() {
  if (!playerStore.presets[selectedPreset.value]) {
    ElMessage.warning(t("请先选择预设"))
    return
  }
  if (!getMarketDataApi()) {
    ElMessage.warning(t("市场数据未就绪，请稍候"))
    return
  }
  loading.value = true
  results.value = []
  progressCurrent.value = 0
  progressTotal.value = actionFilter.value === "all" ? ACTION_OPTIONS.length : 1
  try {
    results.value = await getUpgradeCompareApi({
      presets: [{ index: selectedPreset.value, config: playerStore.presets[selectedPreset.value] }],
      action: actionFilter.value === "all" ? undefined : (actionFilter.value as Parameters<typeof getUpgradeCompareApi>[0]["action"]),
      evalMode: evalMode.value,
      topN: topN.value,
      onProgress: (label, current, total) => {
        progressLabel.value = label
        progressCurrent.value = current
        progressTotal.value = total
      }
    })
    if (results.value.length && results.value.every(r => r.actions.length === 0)) {
      ElMessage.warning(t("未找到可提升项"))
    }
  } catch (e) {
    console.error(e)
    ElMessage.error(t("计算失败或结果为空，请打开控制台查看错误"))
  } finally {
    loading.value = false
  }
}

function rowsOf(action: ActionUpgradeResult): UpgradeCandidate[] {
  if (showAll.value) return action.candidates
  return UPGRADE_SLOTS.map(slot => action.best[slot]).filter(Boolean) as UpgradeCandidate[]
}

function slotLabel(slot: string) {
  return t(SLOT_LABEL_KEYS[slot as keyof typeof SLOT_LABEL_KEYS])
}

function currentOf(action: ActionUpgradeResult, cand: UpgradeCandidate) {
  return action.current[cand.slot]
}

function deltaText(cand: UpgradeCandidate) {
  if (cand.isExpMetric) {
    return `+${Format.number(cand.expDelta, 1)} ${t("经验/时")}`
  }
  return `+${Format.money(cand.profitDelta)}/时`
}

// 切换预设后旧结果作废，清空避免误读
watch(selectedPreset, () => {
  results.value = []
})
</script>

<template>
  <div class="app-container">
    <el-card shadow="never">
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <span class="font-bold">{{ t("选择预设") }}</span>
          <el-radio-group v-model="selectedPreset">
            <el-radio-button
              v-for="(preset, index) in playerStore.presets"
              :key="index"
              :value="index"
            >
              <span :style="{ color: preset.color }">{{ preset.name || `预设${index + 1}` }}</span>
            </el-radio-button>
          </el-radio-group>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-bold">{{ t("专业") }}</span>
          <el-select v-model="actionFilter" style="width: 120px">
            <el-option :label="t('全部专业')" value="all" />
            <el-option
              v-for="opt in ACTION_OPTIONS"
              :key="opt.value"
              :label="t(opt.label)"
              :value="opt.value"
            />
          </el-select>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-bold">{{ t("比较口径") }}</span>
          <el-radio-group v-model="evalMode">
            <el-radio-button value="all">
              {{ t("全部等级") }}
            </el-radio-button>
            <el-radio-button value="naked">
              {{ t("仅0级") }}
            </el-radio-button>
            <el-radio-button value="sameLevel">
              {{ t("与现装同级") }}
            </el-radio-button>
          </el-radio-group>
        </div>
        <div class="flex items-center gap-2">
          <span>{{ t("基准项目数") }}</span>
          <el-select v-model="topN" style="width: 80px">
            <el-option :value="1" label="1" />
            <el-option :value="2" label="2" />
            <el-option :value="3" label="3" />
            <el-option :value="5" label="5" />
          </el-select>
        </div>
        <div class="flex items-center gap-2">
          <span>{{ t("显示全部候选") }}</span>
          <el-switch v-model="showAll" />
        </div>
        <el-button type="primary" :loading="loading" @click="runCompare">
          {{ t("开始优化") }}
        </el-button>
      </div>
      <el-progress
        v-if="loading"
        :percentage="progressPercent"
        :format="() => `${progressLabel} (${progressCurrent}/${progressTotal})`"
        class="mt-3"
      />
    </el-card>

    <el-empty v-if="!loading && !results.length" :description="t('选择预设后点击开始优化')" />

    <el-card v-for="preset in results" :key="preset.presetIndex" shadow="never" class="mt-4">
      <template #header>
        <span class="font-bold" :style="{ color: preset.color }">
          {{ t("预设") }}：{{ preset.presetName }}
        </span>
      </template>
      <el-alert type="info" :closable="false" class="mb-4" :title="t('基准=该专业当前等级下利润最高的N个项目（N=基准项目数）；提升量=换装后在N个项目上的平均提升；护符只算经验。建议装备后的 +N 为强化等级，成本为该强化等级的市场买价。')" />
      <template v-for="action in preset.actions" :key="`${preset.presetIndex}-${action.action}`">
        <div class="flex items-baseline gap-3 mt-2 mb-1 flex-wrap">
          <span class="font-bold text-base">{{ action.actionLabel }}</span>
          <span class="text-sm opacity-70">
            {{ t("基准") }}（{{ action.baselines.length }}{{ t("项均值") }} {{ Format.money(action.baselineProfitPH) }}/时）：{{ action.baselines.map(b => b.name).join("、") }}
          </span>
        </div>
        <el-table :data="rowsOf(action)" size="small" border>
          <el-table-column :label="t('部位')" width="70">
            <template #default="{ row }">
              {{ slotLabel(row.slot) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('现装')" min-width="140">
            <template #default="{ row }">
              <template v-if="currentOf(action, row)">
                <ItemIcon :hrid="currentOf(action, row)!.hrid" />
                {{ currentOf(action, row)!.name }}
                <el-tag v-if="currentOf(action, row)!.level" size="small" type="info">
                  +{{ currentOf(action, row)!.level }}
                </el-tag>
              </template>
              <span v-else class="opacity-50">{{ t("无") }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('建议装备')" min-width="160">
            <template #default="{ row }">
              <ItemIcon :hrid="row.hrid" />
              {{ row.name }}
              <el-tag v-if="row.evalLevel > 0" size="small" type="warning">
                +{{ row.evalLevel }}
              </el-tag>
              <el-tag size="small">
                {{ t("等级") }}{{ row.itemLevel }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('成本')" width="110" align="right">
            <template #default="{ row }">
              {{ Format.price(row.cost) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('提升量')" width="130" align="right">
            <template #default="{ row }">
              <span :class="row.isExpMetric ? 'text-purple' : 'text-green'">{{ deltaText(row) }}</span>
              <el-tag v-if="row.isExpMetric" size="small" type="warning" class="ml-1">
                {{ t("经验") }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column width="110" align="right">
            <template #header>
              <span class="inline-flex items-center justify-end gap-1">
                {{ t("性价比") }}
                <el-tooltip :content="t('性价比 = 平均每小时提升 ÷ 购买成本。数值越大，每 1 金币买到的提升越多。例：换装后每小时多赚 1,000 金币、装备花 100,000 → 性价比 = 1,000 ÷ 100,000 = 0.01')" placement="top">
                  <el-icon class="cursor-help"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
            </template>
            <template #default="{ row }">
              {{ Format.number(row.valueRate, 4) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('回本(天)')" width="100" align="right">
            <template #default="{ row }">
              <span v-if="row.isExpMetric" class="opacity-40">—</span>
              <span v-else>{{ Format.number(row.paybackHours / 24, 1) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
      <el-empty
        v-if="!preset.actions.length"
        :image-size="60"
        :description="t('该预设无可提升项或等级不足')"
      />
    </el-card>
  </div>
</template>

<style scoped lang="scss">
@media (max-width: 768px) {
  // 预设/口径单选组按钮多时换行，避免横向溢出被裁剪（页面级滚动锁已禁横向滚动）
  :deep(.el-radio-group) {
    flex-wrap: wrap;
    row-gap: 4px;
  }

  // 顶部配置行间距收紧
  .flex-wrap {
    row-gap: 8px;
  }
}
</style>
