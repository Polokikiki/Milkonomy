<script lang="ts" setup>
import { useGreyAndColorWeakness } from "@@/composables/useGreyAndColorWeakness"
import { useTheme } from "@@/composables/useTheme"
import en from "element-plus/es/locale/lang/en"
import zhCn from "element-plus/es/locale/lang/zh-cn"

const { initTheme } = useTheme()
const { initGreyAndColorWeakness } = useGreyAndColorWeakness()
// 初始化主题
initTheme()
// 初始化灰色模式和色弱模式
initGreyAndColorWeakness()

const { locale } = useI18n()
const elLocale = computed(() => {
  switch (locale.value) {
    case "en":
      return en
    case "zhCn":
      return zhCn
    default:
      return en
  }
})
</script>

<template>
  <el-config-provider :locale="elLocale">
    <router-view />
  </el-config-provider>
</template>
