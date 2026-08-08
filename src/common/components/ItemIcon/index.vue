<script setup lang="ts">
import { getIconOf } from "@/common/utils/game"

defineProps<{
  hrid?: string
  width?: number
  height?: number
}>()
</script>

<template>
  <svg :width="width ?? 30" :height="height ?? 30">
    <use :xlink:href="getIconOf(hrid)" />
  </svg>
</template>
