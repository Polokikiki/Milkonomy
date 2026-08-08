<script lang="ts" setup>
import { getMarketDataApi } from "@/common/apis/game"
import { useGameStore } from "@/pinia/stores/game"

const version = __APP_VERSION__
const { t } = useI18n()
</script>

<template>
  <div> {{ t('Milkonomy') }} v{{ version }}</div>
  <div
    :class="{
      error: getMarketDataApi()?.timestamp * 1000 < Date.now() - 1000 * 60 * 120,
      success: getMarketDataApi()?.timestamp * 1000 > Date.now() - 1000 * 60 * 120,
    }"
  >
    <a href="https://www.milkywayidle.com/game_data/marketplace.json" target="_blank" rel="noopener noreferrer">{{ t('市场数据来源(MilkyWayIdle)') }} : {{ new Date(useGameStore().marketData?.timestamp! * 1000).toLocaleString() }}</a>
  </div>
</template>

<style lang="scss" scoped>
.error {
  color: #f56c6c;

  a {
    color: inherit;
    // text-decoration: underline;

    &:hover {
      opacity: 0.8;
    }
  }
}
.success {
  color: #67c23a;

  a {
    color: inherit;
    // text-decoration: underline;

    &:hover {
      opacity: 0.8;
    }
  }
}
</style>
