<script setup lang="ts">
import { PRICE_STATUS_LIST, useGameStore } from "@/pinia/stores/game"

const emit = defineEmits<{
  (e: "change"): void
}>()
const { t } = useI18n()
function onChange() {
  useGameStore().savePriceStatus()
  emit("change")
}
</script>

<template>
  <template v-if="useGameStore().checkSecret()">
    <div class="flex items-center">
      <div class="m-2">
        {{ t('买价') }}
      </div>
      <el-select v-model="useGameStore().buyStatus" :placeholder="t('左价')" style="width:100px" @change="onChange">
        <el-option v-for="item in PRICE_STATUS_LIST" :key="item.value" :value="item.value" :label="item.label" />
      </el-select>
    </div>

    <div class="flex items-center">
      <div class="m-2">
        {{ t('卖价') }}
      </div>
      <el-select v-model="useGameStore().sellStatus" :placeholder="t('右价')" style="width:100px" @change="onChange">
        <el-option v-for="item in PRICE_STATUS_LIST" :key="item.value" :value="item.value" :label="item.label" />
      </el-select>
    </div>
  </template>
</template>
