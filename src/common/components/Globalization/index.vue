<script setup lang="ts">
import type { Lang, MessageSchema } from "@/locales"
import locales, { setLang } from "@/locales"

import GlobalizationIcon from "@@/assets/icons/globalization.svg?component"

const { locale } = locales.global
// const { lang } = useSettingsStore()

function onSelectLang(value: Lang) {
  console.log("Language Switch", value)
  setLang(value)
  location.reload()
  locale.value = value
}
const langOptions: Ref<Array<{ value: keyof MessageSchema, label: string }>> = ref([])
langOptions.value = [
  { value: "zhCn", label: "简体中文" },
  { value: "zhTw", label: "繁體中文" },
  { value: "en", label: "English" }
]
</script>

<template>
  <el-dropdown trigger="hover">
    <GlobalizationIcon class="w-[40px] h-[48px] p-[11px] cursor-pointer outline-none" />
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="item in langOptions"
          :key="item.value"
          :class="locale === item.value ? 'selected' : ''"
          @click="onSelectLang(item.value)"
        >
          <div>
            {{ item.label }}
          </div>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style lang="scss" scoped>
:deep(.selected) {
  background-color: #f5f7fa;
  color: #409eff;
}
</style>
