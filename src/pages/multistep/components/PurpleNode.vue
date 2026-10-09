<script lang="ts" setup>
import type { GraphNode, GraphPin } from "../types"
import type { AlchemyActionKey } from "../utils/recipes"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { Close, StarFilled } from "@element-plus/icons-vue"
import { computed } from "vue"
import { getItemDetailOf } from "@/common/apis/game"
import { getTrans } from "@/locales"

const props = defineProps<{
  horiz?: boolean
  node: GraphNode
  pins: GraphPin[]
  /** B 类可用炼金动作（主原料确定后给出） */
  alchemyOptions: { key: AlchemyActionKey, actionHrid: string }[]
  result?: any
}>()
const emit = defineEmits<{
  (e: "dragStart", node: GraphNode, ev: PointerEvent): void
  (e: "pinDragStart", pinId: string, ev: PointerEvent): void
  (e: "setClass", node: GraphNode, cls: "A" | "B"): void
  (e: "setAction", node: GraphNode, actionKey: AlchemyActionKey): void
  (e: "setCatalyst", node: GraphNode, rank: 0 | 1 | 2): void
  (e: "delete", node: GraphNode): void
  (e: "ctxmenu", node: GraphNode, ev: MouseEvent): void
}>()
const { t } = useI18n()

const outPins = computed(() => props.pins.filter(p => p.side === "out"))
// 输入单点居中：主原料引脚（其余输入线汇到矩形边中心，走锚点别名）
const mainInPin = computed(() => props.pins.find(p => p.side === "in" && p.role === "main") ?? props.pins.find(p => p.side === "in" && !p.auto) ?? null)
const mainInPinId = computed(() => mainInPin.value?.id ?? `${props.node.id}:in:main`)
// 输出单点扇出：只画主产物一个点，全部产物线共用
const mainOutPin = computed(() => outPins.value.find(p => p.role === "main") ?? outPins.value[0] ?? null)
const mainOutPinId = computed(() => mainOutPin.value?.id ?? `${props.node.id}:out:main`)
// B 类需 主原料+动作+催化剂 三者齐备才算解析；仅选完动作时下拉仍可修改
const isResolved = computed(() => !!props.node.actionHrid && (props.node.funcClass === "A" || props.node.catalystRank != null))
const isB = computed(() => props.node.funcClass === "B")

// B 类第二个下拉（动作）：主原料已确立才可选
const actionOptions = computed(() =>
  props.node.funcClass === "B" && props.node.mainItemHrid ? props.alchemyOptions : [])
const actionValue = computed({
  get: () => isB.value ? (props.node.actionHrid?.split("/").pop() ?? "") : "",
  set: (key: string) => key && emit("setAction", props.node, key as AlchemyActionKey)
})
// B 类第三个下拉（催化剂）：动作选定后可改；催化剂选非默认 → 触发 resolveFuncB
const catalystValue = computed({
  get: () => props.node.catalystRank ?? undefined,
  set: (rank: number) => emit("setCatalyst", props.node, rank as 0 | 1 | 2)
})

function onPinPointerDown(pinId: string, ev: PointerEvent) {
  ev.stopPropagation()
  emit("pinDragStart", pinId, ev)
}
// 用户可见文案：紫节点 = 处理方式；A = 非炼金，B = 炼金
const kindLabel = computed(() => props.node.funcClass === "A" ? t("非炼金") : props.node.funcClass === "B" ? t("炼金") : "?")
</script>

<template>
  <div
    class="func-node"
    :class="{ resolved: isResolved, horiz }"
    :style="{ left: `${node.x}px`, top: `${node.y}px` }"
    @pointerdown="emit('dragStart', node, $event)"
    @contextmenu.prevent="emit('ctxmenu', node, $event)"
  >
    <!-- 输入 pin（上）：单点居中（主原料），全部输入线汇到矩形边中心 -->
    <div class="pin-row in">
      <div class="pin-wrap">
        <div
          class="pin main"
          :data-pin-id="mainInPinId"
          :title="getTrans(getItemDetailOf(mainInPin?.itemHrid ?? '')?.name ?? '')"
          @pointerdown="onPinPointerDown(mainInPinId, $event)"
        />
      </div>
    </div>

    <div class="head">
      <div class="kind-mark">
        {{ kindLabel }}
      </div>
      <div class="title">
        {{ t('处理方式') }}
      </div>
      <el-button class="del" size="small" text :icon="Close" @click.stop="emit('delete', node)" />
    </div>

    <!-- 第一个下拉：非炼金/炼金（解析后锁定） -->
    <el-select
      :model-value="node.funcClass"
      :disabled="isResolved"
      size="small"
      style="width: 100%"
      @update:model-value="(val: string | number | boolean | Record<string, unknown> | undefined) => emit('setClass', node, val as 'A' | 'B')"
    >
      <el-option :label="t('非炼金')" value="A" />
      <el-option :label="t('炼金')" value="B" />
    </el-select>

    <!-- 第二个下拉：非炼金恒暗（未选择炼金）；炼金解析后仍可切换（点金/分解/转化） -->
    <el-select
      v-model="actionValue"
      :disabled="!isB || !node.mainItemHrid || (isResolved && !isB)"
      size="small"
      :placeholder="isB ? t('请选择炼金动作') : t('未选择炼金')"
      style="width: 100%; margin-top: 6px"
    >
      <el-option v-for="opt in actionOptions" :key="opt.key" :label="t(opt.key === 'coinify' ? '点金' : opt.key === 'decompose' ? '分解' : '转化')" :value="opt.key" />
    </el-select>

    <!-- 第三个下拉：非炼金恒暗（无）；炼金解析后仍可切换（催化剂） -->
    <el-select
      v-model="catalystValue"
      :disabled="!isB || !node.mainItemHrid || (isResolved && !isB)"
      size="small"
      :placeholder="isB ? t('未选择催化剂') : t('无')"
      style="width: 100%; margin-top: 6px"
    >
      <el-option :label="t('无')" :value="0" />
      <el-option :label="t('普通催化剂')" :value="1" />
      <el-option :label="t('至高催化剂')" :value="2" />
    </el-select>

    <!-- 解析后：主原料/主产物标识（星星 + 物品图标） -->
    <div v-if="isResolved" class="main-item">
      <el-icon color="#ffd04b">
        <StarFilled />
      </el-icon>
      <ItemIcon :hrid="node.mainItemHrid!" :width="20" :height="20" />
      <span>{{ getTrans(getItemDetailOf(node.mainItemHrid!)?.name ?? "") }}</span>
    </div>

    <!-- 输出 pin（下）：单点扇出——所有产物线从同一个点出发，产物名见节点输出列表 -->
    <div class="pin-row out">
      <div class="pin-wrap">
        <div
          class="pin main"
          :data-pin-id="mainOutPinId"
          :title="getTrans(getItemDetailOf(mainOutPin?.itemHrid ?? '')?.name ?? '')"
          @pointerdown="onPinPointerDown(mainOutPinId, $event)"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.func-node {
  position: absolute;
  width: 260px;
  padding: 10px;
  border-radius: 8px;
  border: 2px solid #a855f7; /* 紫色 */
  background: rgba(168, 85, 247, 0.08);
  cursor: grab;
  user-select: none;
  .head {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .kind-mark {
    padding: 2px 6px;
    border-radius: 4px;
    background: #a855f7;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .title {
    font-weight: 600;
    flex: 1;
  }
  .del {
    color: #a855f7;
  }
  .main-item {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 6px;
    font-size: 12px;
  }
  .pin-row {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    z-index: 1;
    &.in {
      top: -7px;
    }
    /* out 行锚在框内 7px：pin-wrap 自行顶向下生长，正好骑在底边上（与 in 对称） */
    &.out {
      bottom: 7px;
    }
    > .pin-wrap {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      top: 0;
      > .pin {
        position: relative;
      }
    }
  }
  &.horiz .pin-row {
    left: auto;
    right: auto;
    top: 0;
    bottom: 0;
    width: 0;
    height: auto;
    transform: none;
    > .pin-wrap {
      left: 0;
      top: 50%;
      transform: translateY(-50%);
    }
  }
  &.horiz .pin-row.in {
    left: -7px;
  }
  &.horiz .pin-row.out {
    right: 7px;
  }
  .pin-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .pin-label {
    font-size: 10px;
    color: #a855f7;
    white-space: nowrap;
  }
  .pin {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #a855f7;
    background: #fff;
    cursor: crosshair;
    z-index: 1;
    &.main {
      background: #ffd04b;
    } /* 主 pin 金黄色（非炼金主要产物 / 炼金主要原料） */
    &.auto {
      background: #909399;
      border-color: #909399;
    } /* 金币/茶：灰色自动供给 */
    &:hover {
      transform: scale(1.4);
    }
  }
}
</style>
