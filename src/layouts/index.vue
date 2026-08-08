<script lang="ts" setup>
import AnnouncementBanner from "@@/components/AnnouncementBanner/index.vue"
import FreezeBanner from "@@/components/FreezeBanner/index.vue"
import { useDevice } from "@@/composables/useDevice"
import { useLayoutMode } from "@@/composables/useLayoutMode"
import { useWatermark } from "@@/composables/useWatermark"
import { isInFreezePeriod } from "@@/config/freeze"
import { getCssVar, setCssVar } from "@@/utils/css"
import { useSettingsStore } from "@/pinia/stores/settings"
import { RightPanel, Settings } from "./components"
import { useResize } from "./composables/useResize"
import LeftMode from "./modes/LeftMode.vue"
import LeftTopMode from "./modes/LeftTopMode.vue"
import TopMode from "./modes/TopMode.vue"

// Layout 布局响应式
useResize()

const { setWatermark, clearWatermark } = useWatermark()
const { isMobile } = useDevice()
const { isLeft, isTop, isLeftTop } = useLayoutMode()
const settingsStore = useSettingsStore()
const { showSettings, showTagsView, showWatermark } = storeToRefs(settingsStore)

// 检查是否在冻结期间
const isFrozen = computed(() => isInFreezePeriod())

// 冻结横幅高度（收起时的高度，但横幅不占满宽度，所以不需要给整个布局加margin）
const freezeBannerHeight = computed(() => "0px")

// #region 隐藏标签栏时删除其高度，是为了让 Logo 组件高度和 Header 区域高度始终一致
const cssVarName = "--v3-tagsview-height"
const v3TagsviewHeight = getCssVar(cssVarName)
watchEffect(() => {
  showTagsView.value ? setCssVar(cssVarName, v3TagsviewHeight) : setCssVar(cssVarName, "0px")
})
// #endregion

// 开启或关闭系统水印
watchEffect(() => {
  showWatermark.value ? setWatermark(import.meta.env.VITE_APP_TITLE) : clearWatermark()
})
</script>

<template>
  <div class="layout-wrapper">
    <!-- 公告横幅 -->
    <AnnouncementBanner />

    <!-- 冻结期间横幅 -->
    <FreezeBanner v-if="isFrozen" />

    <!-- 主布局 -->
    <div class="layout-main">
      <!-- 左侧模式 -->
      <LeftMode v-if="isLeft || isMobile" />
      <!-- 顶部模式 -->
      <TopMode v-else-if="isTop" />
      <!-- 混合模式 -->
      <LeftTopMode v-else-if="isLeftTop" />
    </div>

    <!-- 右侧设置面板 -->
    <RightPanel v-if="showSettings">
      <Settings />
    </RightPanel>
  </div>
</template>

<style scoped lang="scss">
.layout-wrapper {
  width: 100%;
  height: 100%;
}

.layout-main {
  margin-top: v-bind(freezeBannerHeight);
  width: 100%;
  height: calc(100% - v-bind(freezeBannerHeight));
}
</style>
