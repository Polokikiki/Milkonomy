import { PriceStatus, useGameStoreOutside } from "@/pinia/stores/game"

import { useMemory } from "./useMemory"
// 自定义 Hook
export function usePriceStatus(key: string, defaultValue?: { buyStatus?: PriceStatus, sellStatus?: PriceStatus }) {
  const priceStatus = useMemory(key, {
    buyStatus: defaultValue?.buyStatus || PriceStatus.ASK,
    sellStatus: defaultValue?.sellStatus || PriceStatus.BID
  }, 0)

  onBeforeMount(() => {
    useGameStoreOutside().buyStatus = priceStatus.value.buyStatus
    useGameStoreOutside().sellStatus = priceStatus.value.sellStatus
  })

  // 离开页面时重置
  onBeforeRouteLeave(() => {
    useGameStoreOutside().resetPriceStatus()
  })

  function onChange() {
    priceStatus.value = {
      buyStatus: useGameStoreOutside().buyStatus,
      sellStatus: useGameStoreOutside().sellStatus
    }
  }
  return onChange
}
