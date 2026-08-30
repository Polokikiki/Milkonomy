<script lang="ts" setup>
import { computed, ref } from "vue"
import { useI18n } from "vue-i18n"

export interface ColumnDef {
  key: string
  label: string
}

const props = defineProps<{
  /** 全部可选列定义（含默认顺序） */
  columns: ColumnDef[]
  /** key -> 是否显示，对象由父组件 useMemory 持有，直接双向绑定 */
  visible: Record<string, boolean>
  /** 当前列顺序（key 数组），由父组件 useMemory 持有 */
  order: string[]
}>()

const { t } = useI18n()

// 兼容旧数据：order 里缺失/多出的 key 以 columns 定义补齐
const orderedColumns = computed(() => {
  const set = new Set(props.order)
  const ordered = props.order.filter(k => props.columns.some(c => c.key === k)).map(k => props.columns.find(c => c.key === k)!)
  for (const col of props.columns) {
    if (!set.has(col.key)) ordered.push(col)
  }
  return ordered
})

// 拖拽排序：按住 ⠿ 手柄后整行可拖，dragover 时实时换位（原生 DnD，零依赖）
const dragIndex = ref(-1)
function onDragStart(i: number) {
  dragIndex.value = i
}
function onDragOver(i: number) {
  if (dragIndex.value === -1 || dragIndex.value === i) return
  const moved = props.order.splice(dragIndex.value, 1)[0]
  props.order.splice(i, 0, moved)
  dragIndex.value = i
}
function onDragEnd() {
  dragIndex.value = -1
}
// 触屏没有 HTML5 拖拽，▲▼ 按钮兜底（全端可用）
function moveUp(i: number) {
  if (i <= 0) return
  const t = props.order.splice(i, 1)[0]
  props.order.splice(i - 1, 0, t)
}
function moveDown(i: number) {
  if (i >= props.order.length - 1) return
  const t = props.order.splice(i, 1)[0]
  props.order.splice(i + 1, 0, t)
}
</script>

<template>
  <el-popover
    placement="bottom-start"
    :width="190"
    trigger="click"
    :teleported="true"
    :popper-options="{ strategy: 'fixed' }"
  >
    <template #reference>
      <slot name="reference" />
    </template>
    <div class="color-gray-500 font-size-12px mb-1">
      {{ t('勾选显示，按住 ⠿ 拖动排序') }}
    </div>
    <div class="flex flex-col">
      <div
        v-for="(col, i) in orderedColumns"
        :key="col.key"
        class="col-set-row"
        :class="{ 'is-dragging': dragIndex === i }"
        :draggable="dragIndex === i"
        @dragstart="onDragStart(i)"
        @dragover.prevent="onDragOver(i)"
        @dragend="onDragEnd"
      >
        <span class="drag-grip" @mousedown="dragIndex = i" @mouseup="dragIndex = -1">⠿</span>
        <span class="move-btns">
          <span class="move-btn" :title="t('上移')" @click.stop="moveUp(i)">▲</span>
          <span class="move-btn" :title="t('下移')" @click.stop="moveDown(i)">▼</span>
        </span>
        <el-checkbox v-model="visible[col.key]">
          {{ t(col.label) }}
        </el-checkbox>
      </div>
    </div>
  </el-popover>
</template>

<style lang="scss" scoped>
.col-set-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 0;

  &.is-dragging {
    opacity: 0.6;
  }
}

.drag-grip {
  cursor: grab;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  line-height: 1;
  padding: 2px;

  &:active {
    cursor: grabbing;
  }
}

.move-btns {
  display: inline-flex;
  flex-direction: column;
  line-height: 1;
}

.move-btn {
  color: var(--el-text-color-secondary);
  font-size: 8px;
  padding: 1px 2px;
  cursor: pointer;

  &:hover {
    color: var(--el-color-primary);
  }
}
</style>
