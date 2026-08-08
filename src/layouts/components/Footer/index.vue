<script lang="ts" setup>
const VITE_APP_TITLE = import.meta.env.VITE_APP_TITLE
const version = __APP_VERSION__
</script>

<template>
  <footer class="layout-footer">
    MIT © 2025 {{ VITE_APP_TITLE }} v{{ version }}
  </footer>
</template>

<style lang="scss" scoped>
.layout-footer {
  width: 100%;
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}
</style>
