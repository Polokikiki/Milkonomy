<script lang="ts" setup>
import type { GraphNode, NodeCalcResult } from "../types"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import * as Format from "@@/utils/format"
import { Delete } from "@element-plus/icons-vue"
import { computed } from "vue"
import { getItemDetailOf } from "@/common/apis/game"
import { getTrans } from "@/locales"

const props = defineProps<{
  horiz?: boolean
  node: GraphNode
  result?: NodeCalcResult | null
  /** 该物品可用的三采集动作（空=只能购买） */
  gatherActions: string[]
  /** 可选物品列表（红节点内选择物品用） */
  itemOptions: { hrid: string, label: string }[]
}>()
const emit = defineEmits<{
  (e: "dragStart", node: GraphNode, ev: PointerEvent): void
  (e: "pinDragStart", pinId: string, ev: PointerEvent): void
  (e: "delete", node: GraphNode): void
  (e: "setItem", node: GraphNode, hrid: string): void
  (e: "setObtain", node: GraphNode, obtain: string): void
  (e: "setBuySide", node: GraphNode, side: "ask" | "bid"): void
  (e: "setSellSide", node: GraphNode, side: "ask" | "bid"): void
  (e: "ctxmenu", node: GraphNode, ev: MouseEvent): void
}>()
const { t } = useI18n()

const itemName = computed(() => getTrans(getItemDetailOf(props.node.hrid)?.name ?? ""))
const kindLabel = computed(() => ({
  red: t("输入"),
  blue: t("继续处理"),
  green: t("出售")
}[props.node.varKind!]))
function onPinPointerDown(pinId: string, ev: PointerEvent) {
  ev.stopPropagation()
  emit("pinDragStart", pinId, ev)
}
</script>

<template>
  <div
    class="graph-node"
    :class="[`kind-${node.varKind}`, { horiz }]"
    :style="{ left: `${node.x}px`, top: `${node.y}px` }"
    @pointerdown="emit('dragStart', node, $event)"
    @contextmenu.prevent="emit('ctxmenu', node, $event)"
  >
    <!-- 输入 pin 排（上）：圆形主输入 + 可选三角回流输入 -->
    <div class="pin-row in">
      <div
        class="pin"
        :data-pin-id="`${node.id}:in:main`"
        :title="t('输入引脚')"
        @pointerdown="onPinPointerDown(`${node.id}:in:main`, $event)"
      />
      <div
        v-if="node.triIn"
        class="pin triangle"
        :data-pin-id="`${node.id}:in:tri`"
        :title="t('循环回流输入')"
        @pointerdown="onPinPointerDown(`${node.id}:in:tri`, $event)"
      />
    </div>

    <div class="head">
      <ItemIcon v-if="node.hrid" :hrid="node.hrid" :width="26" :height="26" />
      <div class="names">
        <div class="name">
          {{ node.hrid ? itemName : t('未选择物品') }}
        </div>
        <div class="kind">
          {{ kindLabel }}
        </div>
      </div>
      <div class="count">
        × {{ Format.number(node.count ?? 1, 3) }}
      </div>
      <!-- 红节点：小垃圾桶删除按钮 -->
      <el-button
        v-if="node.varKind === 'red'"
        class="del"
        size="small"
        text
        :icon="Delete"
        @click.stop="emit('delete', node)"
      />
    </div>

    <!-- 红节点：直接在这里选择物品（与 [上部] 行联动） -->
    <el-select
      v-if="node.varKind === 'red'"
      :model-value="node.hrid || undefined"
      :placeholder="t('请选择物品')"
      filterable
      size="small"
      style="width: 100%; margin-top: 6px"
      @update:model-value="(val: string | number | boolean | Record<string, unknown> | undefined) => emit('setItem', node, val as string)"
    >
      <el-option v-for="opt in itemOptions" :key="opt.hrid" :label="opt.label" :value="opt.hrid">
        <div class="option-item">
          <ItemIcon :hrid="opt.hrid" :width="20" :height="20" />
          <span>{{ opt.label }}</span>
        </div>
      </el-option>
    </el-select>

    <!-- 红节点：获取方式下拉（购买默认；有三采集动作时可选） -->
    <el-select
      v-if="node.varKind === 'red' && node.hrid"
      :model-value="node.obtain ?? 'buy'"
      size="small"
      style="width: 100%; margin-top: 6px"
      @update:model-value="(val: string | number | boolean | Record<string, unknown> | undefined) => emit('setObtain', node, val as string)"
    >
      <el-option :label="t('购买')" value="buy" />
      <el-option v-if="gatherActions.length" :label="t('三采集')" value="gather" />
    </el-select>

    <!-- 价侧按钮组：红=买价（左=挂单最低卖 / 右=最高买单），绿=卖价，逐节点独立 -->
    <div v-if="node.varKind === 'red' && node.hrid" class="side-row" @pointerdown.stop>
      <span class="side-label">{{ t('买价') }}</span>
      <button type="button" class="side-btn" :class="{ on: (node.buySide ?? 'ask') === 'ask' }" @click.stop="emit('setBuySide', node, 'ask')">
        {{ t('左价') }}
      </button>
      <button type="button" class="side-btn" :class="{ on: (node.buySide ?? 'ask') === 'bid' }" @click.stop="emit('setBuySide', node, 'bid')">
        {{ t('右价') }}
      </button>
    </div>
    <div v-else-if="node.varKind === 'green' && node.hrid" class="side-row" @pointerdown.stop>
      <span class="side-label">{{ t('卖价') }}</span>
      <button type="button" class="side-btn" :class="{ on: (node.sellSide ?? 'bid') === 'ask' }" @click.stop="emit('setSellSide', node, 'ask')">
        {{ t('左价') }}
      </button>
      <button type="button" class="side-btn" :class="{ on: (node.sellSide ?? 'bid') === 'bid' }" @click.stop="emit('setSellSide', node, 'bid')">
        {{ t('右价') }}
      </button>
    </div>

    <div class="metrics">
      <template v-if="node.varKind === 'green'">
        <span>{{ t('税前收入') }} <b>{{ result?.preTaxIncome == null ? '--' : Format.money(result.preTaxIncome) }}</b></span>
        <span>{{ t('税后收入') }} <b>{{ result?.afterTaxIncome == null ? '--' : Format.money(result.afterTaxIncome) }}</b></span>
      </template>
      <template v-else-if="node.varKind === 'blue'">
        <span>{{ t('工时占比') }} <b>--</b></span>
      </template>
    </div>

    <!-- 输出 pin 排（下）：可选三角回流出端 + 圆形主输出 -->
    <!-- 输出 pin（下）：三角回流时只画三角（居中），普通时只画圆（居中）——同一点 -->
    <div class="pin-row out">
      <div
        v-if="node.triOut"
        class="pin triangle-out"
        :data-pin-id="`${node.id}:out:tri`"
        :title="t('循环回流出端')"
        @pointerdown="onPinPointerDown(`${node.id}:out:tri`, $event)"
      />
      <div
        v-else
        class="pin"
        :data-pin-id="`${node.id}:out:main`"
        :title="t('输出引脚')"
        @pointerdown="onPinPointerDown(`${node.id}:out:main`, $event)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.graph-node {
  position: absolute;
  width: 220px;
  padding: 10px;
  border-radius: 8px;
  border: 2px solid;
  background: var(--el-bg-color-overlay);
  cursor: grab;
  user-select: none;
  &.kind-red {
    border-color: #f56c6c;
    background: rgba(245, 108, 108, 0.08);
  }
  &.kind-blue {
    border-color: #409eff;
    background: rgba(64, 158, 255, 0.08);
  }
  &.kind-green {
    border-color: #67c23a;
    background: rgba(103, 194, 58, 0.08);
  }
  .head {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .names {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kind {
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }
  .count {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  .del {
    color: #f56c6c;
  }
  .option-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  /* 价侧左右按钮组（红=买价 绿=卖价，逐节点独立） */
  .side-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
  }
  .side-label {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    min-width: 26px;
  }
  .side-btn {
    flex: 1;
    border: 1px solid var(--el-border-color);
    background: var(--el-fill-color-light);
    color: var(--el-text-color-regular);
    font-size: 11px;
    padding: 2px 0;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
  }
  .side-btn:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
  }
  .side-btn.on {
    background: var(--el-color-primary);
    border-color: var(--el-color-primary);
    color: #fff;
  }
  .metrics {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  /* 引脚：所有 pin 绝对定位在节点边的正中央——无论几个引脚都重叠居中 */
  .pin-row {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    z-index: 1;
    &.in {
      top: -7px;
    }
    /* out 行锚在框内 7px：pin 自行顶向下生长，正好骑在底边上（与 in 对称） */
    &.out {
      bottom: 7px;
    }
    > .pin {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      top: 0;
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
    > .pin {
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
  .pin {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--el-border-color-darker);
    background: #fff;
    cursor: crosshair;
    &:hover {
      transform: scale(1.4);
      border-color: #ffd04b;
    }
    &.triangle {
      border-radius: 0;
      /* 正三角 ▲：接收端（红节点 in:tri） */
      clip-path: polygon(50% 0, 100% 100%, 0 100%);
    }
    &.triangle-out {
      border-radius: 0;
      /* 倒三角 ▼：输出端（绿/蓝节点 out:tri） */
      clip-path: polygon(0 0, 100% 0, 50% 100%);
    }
  }
}
</style>
