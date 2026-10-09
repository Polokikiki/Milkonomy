<script lang="ts" setup>
import type { BalanceStep } from "../utils/balance"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import * as Format from "@@/utils/format"
import { getItemDetailOf } from "@/common/apis/game"
import { getTrans } from "@/locales"

defineProps<{
  steps: BalanceStep[]
}>()
const { t } = useI18n()

function itemName(hrid: string) {
  return getTrans(getItemDetailOf(hrid)?.name ?? "")
}
</script>

<template>
  <el-card class="mt-5 time-share">
    <template #header>
      <div class="title">
        {{ t('处理步骤与工时占比') }}
      </div>
    </template>
    <el-table :data="steps" size="small" style="width: 100%">
      <el-table-column :label="t('处理物品')" min-width="160">
        <template #default="{ row }">
          <div class="item-cell">
            <ItemIcon :hrid="row.mainHrid" :width="22" :height="22" />
            <span>{{ itemName(row.mainHrid) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('动作')" min-width="150">
        <template #default="{ row }">
          {{ row.actionLabel }}
        </template>
      </el-table-column>
      <el-table-column :label="t('处理数量')" align="right" min-width="110">
        <template #default="{ row }">
          {{ Format.number(row.processCount, 3) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('动作次数')" align="right" min-width="110">
        <template #default="{ row }">
          {{ Format.number(row.actions, 3) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('批次耗时')" align="right" min-width="110">
        <template #default="{ row }">
          {{ Format.costTime(row.batchTime) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('工时占比')" min-width="220">
        <template #default="{ row }">
          <div class="share-cell">
            <div class="share-bar">
              <div class="share-fill" :style="{ width: `${Math.min(100, row.share * 100)}%` }" />
            </div>
            <span>{{ Format.percent(row.share) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('动作次数/h')" align="right" min-width="110">
        <template #default="{ row }">
          {{ Format.number(row.actionsPerHour, 3) }}
        </template>
      </el-table-column>
    </el-table>
    <div v-if="!steps.length" class="empty-tip">
      {{ t('点击自动配平后显示') }}
    </div>
  </el-card>
</template>

<style lang="scss" scoped>
.title {
  font-weight: 600;
}
.item-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.share-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.share-bar {
  flex: 1;
  height: 8px;
  background: var(--el-fill-color-darker);
  border-radius: 4px;
  overflow: hidden;
}
.share-fill {
  height: 100%;
  background: #409eff;
  border-radius: 4px;
}
.empty-tip {
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 12px;
}
</style>
