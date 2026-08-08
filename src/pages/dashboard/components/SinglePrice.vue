<script setup lang="ts">
import type { StoragePriceItem } from "@/pinia/stores/price"
import { ElPopover } from "element-plus"
import { setSinglePriceApi } from "@/common/apis/price"

const props = defineProps<{
  data?: StoragePriceItem
}>()

const emit = defineEmits(["confirm"])

const form = ref({
  ask: {
    manual: false,
    manualPrice: undefined
  },
  bid: {
    manual: false,
    manualPrice: undefined
  }
})

const refPopover = ref<InstanceType<typeof ElPopover> | null>(null)

function onShow() {
  Object.assign(form.value.ask, props.data?.ask)
  Object.assign(form.value.bid, props.data?.bid)
}
function onConfirm() {
  setSinglePriceApi({ ...form.value, hrid: props.data!.hrid, level: props.data!.level })
  refPopover.value?.hide()
  emit("confirm")
}
const { t } = useI18n()
</script>

<template>
  <ElPopover ref="refPopover" trigger="click" placement="right" width="auto" @before-enter="onShow">
    <template #reference>
      <div style="display: inline-block">
        <slot>
          <!-- 可选：默认触发按钮，避免空内容 -->
          <!-- <el-button type="primary">设置价格</el-button> -->
        </slot>
      </div>
    </template>
    <el-form :model="form">
      <el-form-item :label="t('买')">
        <el-switch v-model="form.ask.manual" :active-text="t('自定义')" :inactive-text="t('市场价')" inline-prompt style="--el-switch-off-color: #13ce66" />
        <el-input-number v-if="form.ask.manual" style="margin-left:10px" v-model="form.ask.manualPrice" :disabled="!form.ask.manual" :controls="false" />
      </el-form-item>
      <el-form-item :label="t('卖')">
        <el-switch v-model="form.bid.manual" :active-text="t('自定义')" :inactive-text="t('市场价')" inline-prompt style="--el-switch-off-color: #13ce66" />
        <el-input-number v-if="form.bid.manual" style="margin-left:10px" v-model="form.bid.manualPrice" :disabled="!form.bid.manual" :controls="false" />
      </el-form-item>
    </el-form>
    <el-button style="display:block; margin:auto;" type="primary" @click="onConfirm">
      {{ t('保存') }}
    </el-button>
  </ElPopover>
</template>

<style lang="scss" scoped>
</style>
