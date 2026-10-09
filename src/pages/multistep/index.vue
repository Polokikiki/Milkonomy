<script lang="ts" setup>
import { Close, Delete, FullScreen, Plus, ZoomIn, ZoomOut } from "@element-plus/icons-vue"
import { ElMessage, ElMessageBox } from "element-plus"
import { ref } from "vue"
import ActionConfig from "@/pages/dashboard/components/ActionConfig.vue"
import GameInfo from "@/pages/dashboard/components/GameInfo.vue"
import ManualPriceCard from "@/pages/dashboard/components/ManualPriceCard.vue"
import { usePlayerStore } from "@/pinia/stores/player"
import NodeCanvas from "./components/NodeCanvas.vue"
import TimeSharePanel from "./components/TimeSharePanel.vue"
import UpupPanel from "./components/UpupPanel.vue"
import { useMultistepGraph } from "./composables/useMultistepGraph"
import { buildDemoPlan } from "./utils/demoPlan"
import { keyLabelOf } from "./utils/hotkeys"
import { loadRecipes } from "./utils/planStore"
import { PRESET_PLANS } from "./utils/presetPlans"

// 触发 player store 初始化（buffs/装备/等级），配平与首页计算器同源需要
void usePlayerStore()

const { t } = useI18n()

// 预置配方：v2 一次性合并（清旧前缀名、按新名补种并带收益快照）；此后用户删除即删除
try {
  if (localStorage.getItem("multistep-preset-seeded-v5") !== "1") {
    let list = loadRecipes().filter(p => !p.name.startsWith("高利润·"))
    for (const p of PRESET_PLANS) {
      list = list.filter(x => x.name !== p.name)
      list.push({ ...p, savedAt: 0 })
    }
    localStorage.setItem("multistep-recipes", JSON.stringify(list))
    localStorage.setItem("multistep-preset-seeded-v5", "1")
  }
} catch {
  // 忽略
}

const graph = useMultistepGraph()

// ?demo=<配方名>：直接载入指定预置（截图/配图用）
const demoM = /demo=([^&]+)/.exec(typeof window !== "undefined" ? window.location.hash : "")
if (demoM) {
  const target = PRESET_PLANS.find(x => x.name === decodeURIComponent(demoM[1]))
  if (target) graph.loadRecipe(target)
}

// 首次进入：画布预置一条演示链（红杉弩+神秘原木→神秘弩）；清空后不会自动恢复
const DEMO_SEED_KEY = "multistep-demo-seeded"
if (!localStorage.getItem(DEMO_SEED_KEY) && graph.nodes.value.length === 0) {
  try {
    localStorage.setItem(DEMO_SEED_KEY, "1")
    // 演示链连同平凡产物引脚全量渲染约 1.9 万 DOM 节点，同步挂载会把首次切换卡住约 3 秒；
    // 先让页面骨架上屏，下一帧再载入演示链
    requestAnimationFrame(() => setTimeout(() => graph.loadRecipe(buildDemoPlan()), 0))
  } catch (e) {
    console.error(e)
  }
}
// 蓝图全屏（CSS 铺满视口，非浏览器原生全屏，便于保留工具栏）
const fullscreen = ref(false)
// ?shot=1 隐藏画布外的区块用于截图/配图
const isShot = typeof window !== "undefined" && window.location.hash.includes("shot=")
// 深链 ?fs=1 直接进入全屏（也便于自动化验证）
if (typeof window !== "undefined" && window.location.hash.includes("fs=1")) fullscreen.value = true

/** 添加处理方式：若刚交互过物品节点，紫框直接落在它旁边并连线（确立主原料） */
function onAddFuncLinked() {
  const t = graph.nodes.value.find(n => n.id === graph.lastInteract.value && n.kind === "var" && n.hrid)
  const func = graph.addFuncNode(t)
  if (t) {
    const err = graph.tryConnect(`${t.id}:out:main`, `${func.id}:in:main`)
    if (err) ElMessage.warning(err)
  }
}

/** 清空全部节点与连线（二次确认） */
function onClearAll() {
  ElMessageBox.confirm(t("确定清空全部节点与连线吗？"), t("清空"), {
    confirmButtonText: t("确定"),
    cancelButtonText: t("取消"),
    type: "warning"
  }).then(() => {
    graph.clearAll()
  }).catch(() => {
    // 取消清空
  })
}
</script>

<template>
  <div class="app-container">
    <!-- [顶端] toptop：与首页相同，但不含 计算税率 / 多步产量修正 / 全局买卖价 三个控件——价侧已下沉到节点按钮，逐节点独立 -->
    <div v-show="!isShot" class="game-info">
      <GameInfo />
      <div><ActionConfig /></div>
    </div>

    <!-- 工作台：全屏时整个工作台（利润面板+节点图+用时占比+指南）一起进全屏 -->

    <!-- 快捷键面板：内嵌在可拖动结点图卡片顶部（入口=标题右侧按钮/右键菜单） -->

    <div class="multistep-workspace" :class="{ 'workspace-fullscreen': fullscreen }">
      <!-- 全屏时右上角工具栏（吸附顶部，滚动不丢） -->
      <div v-if="fullscreen" class="fullscreen-toolbar">
        <el-button :icon="Close" @click="fullscreen = false">
          {{ t('退出全屏') }}
        </el-button>
        <el-button :icon="Plus" type="danger" plain @click="graph.addRow(true)">
          {{ t('添加物品') }}
        </el-button>
        <el-button :icon="Plus" plain class="purple-btn" @click="onAddFuncLinked()">
          {{ t('添加处理方式') }}
        </el-button>
      </div>

      <!-- [上部] upup -->
      <div v-show="!isShot">
        <UpupPanel :graph="graph" @set-plan-name="(v: string) => (graph.planName.value = v)" />
      </div>

      <!-- [中部] zhongzhong -->
      <el-card class="mt-5 zhongzhong-card">
        <template #header>
          <div class="zhongzhong-header">
            <span class="title">{{ t('可拖动结点图') }}</span>
            <el-button class="purple-btn" size="small" plain @click="graph.hkOpen.value = !graph.hkOpen.value">
              {{ t('快捷键设置') }}
            </el-button>
            <div class="toolbar">
              <!-- 「不显示平凡产物」勾选项 + 四个图例：红=输入 蓝=继续处理 绿=叶子出售 紫=处理方式 -->
              <el-checkbox v-model="graph.hideMundane.value" class="legend">
                {{ t('不显示平凡产物') }}
              </el-checkbox>
              <el-tag type="danger" class="legend">
                {{ t('输入') }}
              </el-tag>
              <el-tag type="primary" class="legend">
                {{ t('继续处理') }}
              </el-tag>
              <el-tag type="success" class="legend">
                {{ t('叶子出售') }}
              </el-tag>
              <el-tag class="legend purple">
                {{ t('处理方式') }}
              </el-tag>
              <el-button-group>
                <el-button :icon="ZoomOut" @click="graph.zoomBy(-0.1)" />
                <el-button style="pointer-events:none">
                  {{ Math.round(graph.zoom.value * 100) }}%
                </el-button>
                <el-button :icon="ZoomIn" @click="graph.zoomBy(0.1)" />
                <el-button :icon="Delete" @click="onClearAll">
                  {{ t('清空') }}
                </el-button>
              </el-button-group>
              <el-button v-if="!fullscreen" :icon="FullScreen" @click="fullscreen = true">
                {{ t('全屏') }}
              </el-button>
            </div>
          </div>
        </template>

        <!-- 快捷键面板：内嵌在可拖动结点图卡片顶部（入口=标题右侧按钮/右键菜单） -->
        <div v-if="graph.hkOpen.value" class="hk-panel">
          <div class="hk-title">
            {{ t('画布快捷键') }}<span class="hk-x" @click="graph.hkOpen.value = false">×</span>
          </div>
          <div class="hk-row">
            <span>{{ t('切换选中节点') }}</span>
            <span class="hk-keys"><button v-for="a in (['navUp', 'navDown', 'navLeft', 'navRight'] as const)" :key="a" type="button" class="hk-kbd" :class="{ rec: graph.hkRecording.value === a }" @click="graph.hkStartRecord(a)">{{ keyLabelOf(graph.hotkeys[a]) }}</button></span>
          </div>
          <div class="hk-row">
            <span>{{ t('呼出快捷菜单（等同右键）') }}</span><span class="hk-keys"><button type="button" class="hk-kbd" :class="{ rec: graph.hkRecording.value === 'openMenu' }" @click="graph.hkStartRecord('openMenu')">{{ keyLabelOf(graph.hotkeys.openMenu) }}</button></span>
          </div>
          <div class="hk-row">
            <span>{{ t('删除选中节点') }}</span><span class="hk-keys"><button type="button" class="hk-kbd" :class="{ rec: graph.hkRecording.value === 'deleteNode' }" @click="graph.hkStartRecord('deleteNode')">{{ keyLabelOf(graph.hotkeys.deleteNode) }}</button></span>
          </div>
          <div class="hk-tip">
            {{ t('点击按键后按下新键重新绑定；移动视图=按住空格左键拖动，Esc=取消选中') }}
          </div>
          <button type="button" class="hk-reset" @click="graph.hkReset()">
            {{ t('恢复默认') }}
          </button>
        </div>

        <NodeCanvas :graph="graph" :fullscreen="fullscreen" />
      </el-card>

      <!-- 用时占比（配平后显示） -->
      <TimeSharePanel v-show="!isShot" :steps="graph.steps.value" />

      <!-- 自定义价格（与首页共用同一价格存储，默认折叠） -->
      <el-collapse class="mt-5">
        <el-collapse-item :title="t('自定义价格')">
          <ManualPriceCard memory-key="multistep" />
        </el-collapse-item>
      </el-collapse>

      <!-- 使用指南（与结点图平行层级） -->
      <el-card class="mt-5">
        <template #header>
          <span class="title">{{ t('使用指南') }}</span>
        </template>
        <div class="guide-line">
          {{ t('本界面不提供任何推荐功能，只提供模拟功能') }}
        </div>
        <div class="guide-line">
          {{ t('炼金行动选择核心原料连线，非炼金选择核心产物连线，上方连原料，下方连产物，根据配方自动生成其他节点') }}
        </div>
        <div class="guide-line">
          {{ t('连完线后，点击自动配平') }}
        </div>
        <div class="guide-line">
          {{ t('节点左键拖动移动（框选后整组移动）、Delete 删除、WASD 按方向切换选中节点、按住空格+左键拖动移动视图；快捷键设置在可拖动结点图标题旁') }}
        </div>
        <div class="guide-line">
          {{ t('平凡产物是该行动的精华、箱子类物品、精通之油类物品，但利润还是正常算。') }}
        </div>
        <div class="guide-line">
          {{ t('绿色节点可以与红色节点相连，非环则合并，形成环则会有限递归计算') }}
        </div>
        <div class="guide-line">
          {{ t('炼金的例子：想要点金太阳石，添加物品太阳石和处理节点') }}
        </div>
        <div class="guide-line">
          {{ t('非炼金的例子：想要红杉弩+神秘木板获得神秘弩，添加物品神秘弩和处理节点') }}
        </div>
        <!-- 配图：尽量按原图尺寸展示 -->
        <!-- 配图待补：红绿合并示例、环与三角引脚示例（等用户提供新图） -->
      </el-card>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.game-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.zhongzhong-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  .title {
    font-weight: 600;
  }
  .desc {
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }
  .toolbar {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .legend {
    cursor: default;
  }
  .legend.purple {
    border-color: #a855f7;
    color: #a855f7;
    background: rgba(168, 85, 247, 0.08);
  }
}
.zhongzhong-card {
  position: relative;
}
/* CSS 全屏：整个工作台（利润面板+节点图+用时占比+指南）铺满视口，一起计算 */
.workspace-fullscreen {
  position: fixed !important;
  inset: 0;
  /* 低于 Element Plus 浮层默认层级（2000+），保证节点下拉菜单/确认框/消息提示可用 */
  z-index: 1900;
  overflow: auto;
  background: var(--el-bg-color-page);
  padding: 12px;
  :deep(.node-canvas-wrap) {
    height: calc(100vh - 200px);
    min-height: 480px;
  }
}
.fullscreen-toolbar {
  position: sticky;
  top: 8px;
  z-index: 3200;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: fit-content;
  margin-left: auto;
  background: var(--el-bg-color);
  padding: 6px;
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
}
.purple-btn {
  border-color: #a855f7;
  background: rgba(168, 85, 247, 0.08);
  color: #a855f7;
}
.purple-btn:hover {
  background: rgba(168, 85, 247, 0.25);
  border-color: #a855f7;
  color: #a855f7;
}
/* ===== 快捷键面板（内嵌结点图卡片顶部）===== */
.hk-panel {
  max-width: 460px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 10px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}
.hk-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}
.hk-x {
  cursor: pointer;
  color: var(--el-text-color-secondary);
  font-size: 16px;
  padding: 0 6px;
  line-height: 1;
}
.hk-x:hover {
  color: var(--el-color-danger);
}
.hk-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  font-size: 13px;
}
.hk-keys {
  display: flex;
  gap: 4px;
}
.hk-kbd {
  min-width: 26px;
  height: 24px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-bottom-width: 2px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  cursor: pointer;
  font-family: inherit;
}
.hk-kbd:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.hk-kbd.fixed {
  color: var(--el-text-color-secondary);
  cursor: default;
}
.hk-kbd.fixed:hover {
  border-color: var(--el-border-color);
  color: var(--el-text-color-secondary);
}
.hk-kbd.rec {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
  animation: hk-pulse 0.9s infinite;
}
@keyframes hk-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.5);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(64, 158, 255, 0);
  }
}
.hk-tip {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}
.hk-reset {
  margin-top: 8px;
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid var(--el-border-color);
  background: transparent;
  border-radius: 5px;
  cursor: pointer;
  color: var(--el-text-color-regular);
}
.hk-reset:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.guide-line + .guide-line {
  margin-top: 1em;
}
.guide-images {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.guide-img {
  /* 尽量按原图尺寸展示；超出容器宽度时等比缩小 */
  max-width: 100%;
  height: auto;
}

/* ===== 手机端适配 ===== */
@media (max-width: 768px) {
  .game-info {
    flex-wrap: wrap;
    gap: 8px;
    font-size: 13px;
  }
  .app-container {
    padding: 8px;
  }
  .qa-fab {
    right: 14px;
    bottom: 14px;
    width: 42px;
    height: 42px;
    font-size: 19px;
  }
  .qa-panel {
    right: 12px;
    left: 12px;
    bottom: 66px;
    width: auto;
    max-height: 62vh;
  }
}
</style>
