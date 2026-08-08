<script setup lang="ts">
import type Calculator from "@/calculator"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { getItemDetailOf } from "@/common/apis/game"
import * as Format from "@/common/utils/format"

defineProps<{
  data: Calculator
  type: "ingredient" | "product"
  simple?: boolean
  workMultiplier?: number
}>()

const { t } = useI18n()
</script>

<template>
  <el-card>
    <el-table :data="data[`${type}ListWithPrice`]" :show-header="false">
      <el-table-column width="44">
        <template #default="{ row }">
          <ItemIcon :hrid="row.hrid" />
        </template>
      </el-table-column>
      <el-table-column label="物品">
        <template #default="{ row }">
          {{ t(getItemDetailOf(row.hrid).name) }}
          <template v-if="row.level">
            +{{ row.level }}
          </template>
        </template>
      </el-table-column>

      <el-table-column v-if="!simple && type === 'product'" prop="rate" label="掉率">
        <template #default="{ row }">
          <div v-if="row.rate < 1" style="min-width:60px">
            {{ Math.floor(row.rate * 1000000) / 10000 }}%
          </div>
        </template>
      </el-table-column>

      <el-table-column v-if="!simple" prop="count" label="数量">
        <template #default="{ row }">
          <span>{{ Format.number(row.count, 3) }}{{ t('个') }}</span>
          &nbsp;<el-text v-if="row.counterCount" style="color:#999;" tag="del">
            {{ Format.number((row.counterCount + row.count), 3) }}{{ t('个') }}
          </el-text>
        </template>
      </el-table-column>

      <el-table-column prop="price" label="价格">
        <template #default="{ row }">
          <span v-if="type === 'ingredient'" :class="row.price < row.marketPrice ? row.price > row.marketPrice ? 'green' : 'red' : ''">
            ¥{{ Format.price(row.price) }}
          </span>
          <span v-else :class="row.price > row.marketPrice ? row.price < row.marketPrice ? 'green' : 'red' : ''">
            ¥{{ Format.price(row.price) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="countPH" label="数量">
        <template #default="{ row }">
          <span>{{ Format.number(row.countPH! * (workMultiplier || 1), 3) }} / h</span>
          &nbsp;<el-text v-if="row.counterCountPH" style="color:#999;" tag="del">
            {{ Format.number((row.counterCountPH + row.countPH) * (workMultiplier || 1), 3) }} / h
          </el-text>
        </template>
      </el-table-column>
    </el-table>
    <div class="footer-wrapper">
      {{ type === 'ingredient' ? `${t('成本')}：${Format.money(data.result.costPH * (workMultiplier || 1))}` : `${t('收入')}：${Format.money(data.result.incomePH * (workMultiplier || 1))}` }} / h
    </div>
  </el-card>
</template>

<style lang="scss" scoped>
.footer-wrapper {
  margin: 15px 0 0 15px;
}
.green {
  color: #67c23a;
}
.red {
  color: #f56c6c;
}
</style>
