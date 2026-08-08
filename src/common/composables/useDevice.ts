import { DeviceEnum } from "@@/constants/app-key"
import { useAppStoreOutside } from "@/pinia/stores/app"

const appStore = useAppStoreOutside()

const isMobile = computed(() => appStore.device === DeviceEnum.Mobile)
const isDesktop = computed(() => appStore.device === DeviceEnum.Desktop)

/** 设备类型 Composable */
export function useDevice() {
  return { isMobile, isDesktop }
}
