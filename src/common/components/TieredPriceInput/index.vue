<script lang="ts" setup>
import { priceStepOf } from "@/common/apis/game"

const props = withDefaults(defineProps<{
  modelValue?: number
  min?: number
  max?: number
  placeholder?: string
  fallbackBase: number
  disabled?: boolean
  width?: string
}>(), {
  modelValue: undefined,
  min: 0,
  max: 5000000000,
  placeholder: "",
  disabled: false,
  width: "120px"
})

const emit = defineEmits<{
  "update:modelValue": [value: number | undefined]
  "change": [value: number | undefined, oldValue: number | undefined]
}>()

function clamp(value: number) {
  return Math.min(props.max, Math.max(props.min, value))
}

function emitValue(value: number | undefined, oldValue: number | undefined) {
  emit("update:modelValue", value)
  emit("change", value, oldValue)
}

function resolveTierStep(value: number | undefined, oldValue: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value
  }

  if (value < props.min) {
    return props.min
  }

  const isOldNumber = typeof oldValue === "number" && Number.isFinite(oldValue)
  const delta = isOldNumber ? value - oldValue : Number.NaN

  let high: boolean | undefined
  let base: number | undefined

  if (isOldNumber && oldValue === -1 && value === 0) {
    return 1
  } else if (isOldNumber && Math.abs(Math.abs(delta) - 1) < 1e-9) {
    high = delta > 0
    base = oldValue
  } else if (!isOldNumber && (value === -1 || value === 0 || value === 1)) {
    if (props.fallbackBase > 0) {
      high = value === 1
      base = props.fallbackBase
    } else {
      return value === 1 ? 1 : props.min
    }
  } else {
    return clamp(value)
  }

  const next = priceStepOf(base, high)
  return clamp(next > 0 ? next : props.min)
}

function onChange(value: number | undefined, oldValue: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    emitValue(value, oldValue)
    return
  }

  emitValue(resolveTierStep(value, oldValue), oldValue)
}
</script>

<template>
  <div class="tiered-price-input" :style="{ width }">
    <el-input-number
      class="tiered-price-input__input"
      :model-value="modelValue"
      :min="min"
      :max="max"
      :disabled="disabled"
      :placeholder="placeholder"
      :step="1"
      :controls="true"
      controls-position="right"
      @change="onChange"
    />
  </div>
</template>

<style scoped>
.tiered-price-input {
  display: block;
}

.tiered-price-input__input {
  width: 100%;
}
</style>
