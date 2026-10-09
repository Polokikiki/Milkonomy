<script lang="ts" setup>
import type { useMultistepGraph } from "../composables/useMultistepGraph"
import type { GraphNode } from "../types"
import { ElMessage } from "element-plus"
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch, watchEffect } from "vue"
import { getActionDetailOf, getItemDetailOf, getPriceOf } from "@/common/apis/game"
import { getTrans } from "@/locales"
import { saveHotkeys } from "../utils/hotkeys"
import { getTradableItemOptions } from "../utils/items"
import { type ConsumingRecipe, findConsumingActionsOf, getAlchemyActionOptionsOf } from "../utils/recipes"
import GraphNodeComp from "./GraphNode.vue"
import PurpleNode from "./PurpleNode.vue"

const props = defineProps<{ graph: ReturnType<typeof useMultistepGraph>, fullscreen?: boolean }>()

const wrapRef = ref<HTMLElement>()
// 滚动时强制重算连线锚点
const scrollTick = ref(0)

// 画布视口高度随内容自适应：空图矮、内容撑开、封顶防超长空白
const wrapHeight = computed(() => {
  const n = props.graph.nodes.value.length
  if (n === 0) return "140px"
  const content = props.graph.canvasSize.value.height * props.graph.zoom.value + 24
  // 普通模式矮框（下滑即达用时占比），全屏大框；随内容渐进撑开
  return `${Math.round(Math.min(Math.max(content, 180), props.fullscreen ? 1600 : 380))}px`
})

// 红节点内选择物品的选项（与 [上部] 共用同一来源）
const itemOptions = computed(() => getTradableItemOptions())

// 节点/连线数组被替换或数量变化（清空、读取配方、三角线增删等结构操作）后
// 强制重算锚点表——盯引用而非长度：同数量换图（如切配方）也能触发
watch(() => [props.graph.nodes.value, props.graph.wires.value], () => {
  scrollTick.value++
  tempWire.value = null
  // 兜底：结构替换后的下一帧与稍后各再重测一次，覆盖首测早于字体/图标/下拉渲染就绪的时序
  requestAnimationFrame(() => {
    scrollTick.value++
  })
  setTimeout(() => {
    scrollTick.value++
  }, 80)
})

// [上部]「查看节点」：滚动视口使对应节点尽量居中
watch(() => props.graph.focusTarget.value, (t) => {
  if (!t || !wrapRef.value) return
  const node = props.graph.nodes.value.find(n => n.id === t.nodeId)
  if (!node) return
  const wrap = wrapRef.value
  const z = props.graph.zoom.value
  const left = Math.max(0, (node.x + 110) * z - wrap.clientWidth / 2)
  const top = Math.max(0, (node.y + 55) * z - wrap.clientHeight / 2)
  wrap.scrollTo({ left, top, behavior: "smooth" })
}, { flush: "post" })

// 「不显示平凡产物」：过滤隐藏节点与其连线
const hiddenNodeIds = computed(() => props.graph.hiddenMundaneIds.value)
const visibleWires = computed(() => props.graph.wires.value.filter(w =>
  !hiddenNodeIds.value.has(w.fromPinId.split(":")[0]) && !hiddenNodeIds.value.has(w.toPinId.split(":")[0])))
const visibleVarNodes = computed(() => props.graph.nodes.value.filter(n => n.kind === "var" && !hiddenNodeIds.value.has(n.id)))
const visibleFuncNodes = computed(() => props.graph.nodes.value.filter(n => n.kind === "func"))

// —— 坐标换算：client → 画布（未缩放）坐标 ——
function clientToCanvas(x: number, y: number) {
  const wrap = wrapRef.value!
  const wrapRect = wrap.getBoundingClientRect()
  return {
    x: (x - wrapRect.left + wrap.scrollLeft) / props.graph.zoom.value,
    y: (y - wrapRect.top + wrap.scrollTop) / props.graph.zoom.value
  }
}

// —— 框选 ——
const selecting = ref<{ x1: number, y1: number, x2: number, y2: number } | null>(null)
const selectedIds = ref<string[]>([])

// —— 右键快捷菜单：直接选处理方式，自动建紫节点并连线 ——
const ctxMenu = ref<{ x: number, y: number, node: GraphNode | null } | null>(null)
function onCtxMenu(node: GraphNode | null, ev: MouseEvent) {
  const gi = props.graph
  if (node) gi.lastInteract.value = node.id
  const p = clientToCanvas(ev.clientX, ev.clientY)
  ctxMenu.value = { x: p.x + 14, y: p.y + 10, node }
  ctxLevel.value = "root"
}
function closeCtx() {
  ctxMenu.value = null
}
const ctxNodeName = computed(() => {
  const c = ctxMenu.value
  if (!c || !c.node || !c.node.hrid) return ""
  return getTrans(getItemDetailOf(c.node.hrid)?.name ?? "")
})
const ctxAlchemyOptions = computed(() => {
  const c = ctxMenu.value
  if (!c || !c.node || c.node.kind !== "var" || !c.node.hrid) return []
  return getAlchemyActionOptionsOf(c.node.hrid)
})
const ctxIsBlue = computed(() => ctxMenu.value?.node?.varKind === "blue")
/** 空白画布右键：菜单里只放「添加物品」；节点内目标已由子组件 emit，冒泡到这里忽略 */
function onCanvasCtxBlank(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (t.closest(".graph-node, .func-node, .ctx-menu, .hk-corner")) return
  onCtxMenu(null, e)
}
function onWinPointerCloseCtx(e: PointerEvent) {
  const t = e.target as HTMLElement
  if (wrapRef.value?.contains(t)) return
  closeCtx()
}
function openHkFromMenu() {
  const gm = props.graph
  gm.hkOpen.value = true
  closeCtx()
}
function quickAddItem() {
  props.graph.addRow(true)
  closeCtx()
}
// 两级级联：第一级=大类（锻造/制造/裁缝/烹饪/冲泡 + 炼金各项），第二级=该大类消耗此物品的配方
const ctxLevel = ref<"root" | "cheesesmithing" | "crafting" | "tailoring" | "cooking" | "brewing">("root")
const A_CATS: Array<{ key: "cheesesmithing" | "crafting" | "tailoring" | "cooking" | "brewing", zh: string }> = [
  { key: "cheesesmithing", zh: "锻造" },
  { key: "crafting", zh: "制造" },
  { key: "tailoring", zh: "裁缝" },
  { key: "cooking", zh: "烹饪" },
  { key: "brewing", zh: "冲泡" }
]
const ctxConsuming = computed<ConsumingRecipe[]>(() => {
  const c = ctxMenu.value
  if (!c || !c.node || c.node.kind !== "var" || !c.node.hrid) return []
  return findConsumingActionsOf(c.node.hrid)
})
const ctxCatCounts = computed(() => {
  const m = new Map<string, number>()
  for (const r of ctxConsuming.value) m.set(r.action, (m.get(r.action) ?? 0) + 1)
  return m
})
/** 第二级列表：当前大类下按产物市场价排序（附工时），封顶 12 条 */
const ctxCatRecipes = computed(() => {
  if (ctxLevel.value === "root") return []
  return ctxConsuming.value
    .filter(r => r.action === ctxLevel.value)
    .map((r) => {
      const price = getPriceOf(r.productHrid, 0).bid ?? 0
      const timeSec = (getActionDetailOf(r.actionHrid)?.baseTimeCost ?? 0) / 1e9
      return { r, price, timeSec }
    })
    .sort((a, b) => b.price - a.price)
    .slice(0, 12)
})
/** 右键快捷处理：该物品节点已有下游紫框时先删掉——后选的处理方式替代前一个 */
function replaceDownstreamFunc(varNodeId: string) {
  for (const w of [...props.graph.wires.value]) {
    if (!w.fromPinId.startsWith(`${varNodeId}:out:`)) continue
    const target = props.graph.nodes.value.find(n => n.id === w.toPinId.split(":")[0])
    if (target?.kind === "func") props.graph.deleteNode(target.id)
  }
}
function quickForge(r: ConsumingRecipe) {
  const c = ctxMenu.value
  if (!c || !c.node || c.node.kind !== "var" || !c.node.hrid) return
  const node = c.node
  replaceDownstreamFunc(node.id)
  // 钉住源节点：后续重排不把它拽走，点击制造时原料/产物不再漂移
  props.graph.persistPositions([node.id])
  const func = props.graph.addFuncNode(c.node)
  func.funcClass = "A"
  func.mainItemHrid = r.productHrid
  func.actionHrid = r.actionHrid
  // 连线：物品输出 → 紫节点上该物品对应的输入引脚（配方解析后引脚已就位）
  const pin = props.graph.pins.value.find(p => p.nodeId === func.id && p.side === "in" && p.itemHrid === node.hrid && !p.auto)
  if (pin) {
    const err = props.graph.tryConnect(`${node.id}:out:main`, pin.id)
    if (err) ElMessage.warning(err)
  }
  props.graph.onFuncConfigChange(func)
  // 配方展开会给输入自动建新红节点；原子换回右键的那颗（避免同名重复物品）
  props.graph.reattachAutoInput(func, node.id, node.hrid)
  closeCtx()
}
function ctxActionLabel(key: string) {
  return key === "coinify" ? getTrans("点金") : key === "decompose" ? getTrans("分解") : getTrans("转化")
}
function quickAlchemyProcess(key: string) {
  const c = ctxMenu.value
  if (!c || !c.node || c.node.kind !== "var" || !c.node.hrid) return
  replaceDownstreamFunc(c.node.id)
  props.graph.persistPositions([c.node.id])
  const func = props.graph.addFuncNode(c.node)
  func.funcClass = "B"
  func.mainItemHrid = c.node.hrid
  func.actionHrid = `/actions/alchemy/${key}`
  func.catalystRank = 0
  const err = props.graph.tryConnect(`${c.node.id}:out:main`, `${func.id}:in:main`)
  if (err) ElMessage.warning(err)
  props.graph.onFuncConfigChange(func)
  // 配方展开会给输入自动建新红节点；原子换回右键的那颗（避免同名重复物品）
  props.graph.reattachAutoInput(func, c.node.id, c.node.hrid)
  closeCtx()
}
function ctxSellNow() {
  const c = ctxMenu.value
  if (!c || !c.node) return
  const node = c.node
  const w = props.graph.wires.value.find(x => x.fromPinId === `${node.id}:out:main`)
  if (w) props.graph.deleteWire(w.id)
  closeCtx()
}
function ctxDelete() {
  const c = ctxMenu.value
  if (!c || !c.node) return
  props.graph.deleteNode(c.node.id)
  closeCtx()
}

// —— 空格+左键拖动 = 平移视图 ——
const spaceHeld = ref(false)
function startPanDrag(ev: PointerEvent) {
  const wrap = wrapRef.value
  if (!wrap) return
  let lastX = ev.clientX
  let lastY = ev.clientY
  const onMove = (e: PointerEvent) => {
    wrap.scrollBy(lastX - e.clientX, lastY - e.clientY)
    lastX = e.clientX
    lastY = e.clientY
  }
  const onUp = () => {
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", onUp)
  }
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp)
}
function onHotkeyKeyup(e: KeyboardEvent) {
  if (e.key === " ") spaceHeld.value = false
}

function onHotkeyKeydown(e: KeyboardEvent) {
  const hotkeys = props.graph.hotkeys
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return
  // 录入新按键：Esc 取消录入，其余按键立即绑定
  if (props.graph.hkRecording.value) {
    e.preventDefault()
    const g = props.graph
    if (e.key !== "Escape") hotkeys[g.hkRecording.value as keyof typeof hotkeys] = e.key
    g.hkRecording.value = null
    saveHotkeys(toRaw(hotkeys))
    return
  }
  if (e.key === " ") {
    e.preventDefault()
    spaceHeld.value = true
    return
  }
  const sel = props.graph.nodes.value.filter(n => selectedIds.value.includes(n.id))
  if ([hotkeys.navUp, hotkeys.navDown, hotkeys.navLeft, hotkeys.navRight].includes(e.key)) {
    e.preventDefault()
    navSelect(e.key)
  } else if (e.key === hotkeys.deleteNode) {
    if (!sel.length) return
    e.preventDefault()
    for (const n of [...sel]) props.graph.deleteNode(n.id)
    selectedIds.value = []
  } else if (e.key === hotkeys.openMenu) {
    e.preventDefault()
    const target = selectedIds.value.length === 1
      ? props.graph.nodes.value.find(n => n.id === selectedIds.value[0]) ?? null
      : null
    if (target) {
      ctxMenu.value = { x: target.x + 240, y: target.y + 40, node: target }
      ctxLevel.value = "root"
    } else {
      const wrap = wrapRef.value
      if (!wrap) return
      const rect = wrap.getBoundingClientRect()
      const c = clientToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2)
      ctxMenu.value = { x: c.x + 14, y: c.y + 10, node: null }
      ctxLevel.value = "root"
    }
  } else if (e.key === "Escape") {
    selectedIds.value = []
    const ghk = props.graph
    ghk.hkOpen.value = false
    closeCtx()
  }
}

/** WASD 方向切换选中节点：跳到当前选中节点该方向上最近的节点（无选中=选最靠上左的） */
function navSelect(key: string) {
  const hk = props.graph.hotkeys
  const dir = key === hk.navUp ? "up" : key === hk.navDown ? "down" : key === hk.navLeft ? "left" : "right"
  const all = [...visibleVarNodes.value, ...visibleFuncNodes.value]
  if (!all.length) return
  const sizeOf = (n: GraphNode) => (n.kind === "func" ? { w: 260, h: 380 } : { w: 220, h: 110 })
  const centerOf = (n: GraphNode) => ({ x: n.x + sizeOf(n).w / 2, y: n.y + sizeOf(n).h / 2 })
  const cur = selectedIds.value.length === 1 ? all.find(n => n.id === selectedIds.value[0]) : undefined
  if (!cur) {
    const first = [...all].sort((a, b) => centerOf(a).y - centerOf(b).y || centerOf(a).x - centerOf(b).x)[0]
    selectedIds.value = [first.id]
    return
  }
  const c = centerOf(cur)
  const isDir = (p: { x: number, y: number }) =>
    dir === "up" ? p.y < c.y - 20 : dir === "down" ? p.y > c.y + 20 : dir === "left" ? p.x < c.x - 20 : p.x > c.x + 20
  let best: GraphNode | null = null
  let bestD = Infinity
  for (const n of all) {
    if (n.id === cur.id) continue
    const p = centerOf(n)
    if (!isDir(p)) continue
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  if (best) selectedIds.value = [best.id]
}
onMounted(() => {
  window.addEventListener("keydown", onHotkeyKeydown)
  window.addEventListener("keyup", onHotkeyKeyup)
  window.addEventListener("pointerdown", onWinPointerCloseCtx)
  window.addEventListener("blur", () => {
    spaceHeld.value = false
  })
})
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onHotkeyKeydown)
  window.removeEventListener("keyup", onHotkeyKeyup)
  window.removeEventListener("pointerdown", onWinPointerCloseCtx)
  ro.disconnect()
  roObserved.clear()
})

/** 节点与框选矩形的相交判定（按节点近似尺寸） */
function intersectsSelection(n: GraphNode, r: { x1: number, y1: number, x2: number, y2: number }) {
  const w = n.kind === "func" ? 260 : 220
  const h = 110
  return n.x + w >= r.x1 && n.x <= r.x2 && n.y + h >= r.y1 && n.y <= r.y2
}

/** 画布空白处按下：空格+拖动=平移视图；否则开始框选（点在节点/pin/线上则忽略） */
function onCanvasPointerDown(ev: PointerEvent) {
  const target = ev.target as HTMLElement
  // 右键菜单：点菜单自身不关，点其他任何地方（节点/空白/选择器外）都关
  if (!target.closest(".ctx-menu")) closeCtx()
  if (spaceHeld.value) {
    ev.preventDefault()
    startPanDrag(ev)
    return
  }
  if (target.closest(".graph-node, .func-node, .pin, .el-select, .el-button, .el-input")) return
  const start = clientToCanvas(ev.clientX, ev.clientY)
  selecting.value = { x1: start.x, y1: start.y, x2: start.x, y2: start.y }
  const onMove = (e: PointerEvent) => {
    const pos = clientToCanvas(e.clientX, e.clientY)
    selecting.value = {
      x1: Math.min(start.x, pos.x),
      y1: Math.min(start.y, pos.y),
      x2: Math.max(start.x, pos.x),
      y2: Math.max(start.y, pos.y)
    }
  }
  const onUp = () => {
    const rect = selecting.value
    if (rect) {
      const hit = props.graph.nodes.value.filter(n => intersectsSelection(n, rect))
      // 框选太小（相当于点击空白）→ 清空选择
      selectedIds.value = (rect.x2 - rect.x1 < 5 && rect.y2 - rect.y1 < 5) ? [] : hit.map(n => n.id)
    }
    selecting.value = null
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", onUp)
  }
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp)
}

// —— 节点拖动（指针捕获实现；选中多节点时整体移动，连线按 pin 自动跟随不断开） ——
function onDragStart(node: GraphNode, ev: PointerEvent) {
  // 空格按住时不拖节点，转为平移视图（子组件已 stopPropagation 的 pin 场景除外，这里兜底）
  if (spaceHeld.value) {
    ev.stopPropagation()
    startPanDrag(ev)
    return
  }
  const gd = props.graph
  gd.lastInteract.value = node.id
  const startX = ev.clientX
  const startY = ev.clientY
  const zoom = props.graph.zoom.value
  // 未框选的节点单独拖动时，只移动它自己
  const moving = selectedIds.value.includes(node.id)
    ? props.graph.nodes.value.filter(n => selectedIds.value.includes(n.id))
    : (selectedIds.value = [node.id], [node])
  const origins = moving.map(n => ({ n, ox: n.x, oy: n.y }))
  const onMove = (e: PointerEvent) => {
    const dx = (e.clientX - startX) / zoom
    const dy = (e.clientY - startY) / zoom
    // 吸附 20px 网格：拖动后节点对齐，画面整齐
    for (const { n, ox, oy } of origins) {
      n.x = Math.round((ox + dx) / 20) * 20
      n.y = Math.round((oy + dy) / 20) * 20
    }
  }
  const onUp = () => {
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", onUp)
    props.graph.persistPositions(moving.map(n => n.id))
  }
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp)
}

// —— 拖线：pin 按下 → 临时线跟随 → pin 抬起落点 ——
const tempWire = ref<{ x1: number, y1: number, x2: number, y2: number } | null>(null)

// 连线锚点表：post-flush 读取 DOM（DOM patch 完成后），
// 节点移动/滚动/缩放变化时自动重算，线实时跟随
const anchors = ref(new Map<string, { x: number, y: number }>())
// 节点宽度固定但高度随内容自适应：读取配方后配平数字/图标/下拉陆续渲染会顶高节点，
// 引脚随之移动而下面的依赖不会触发——用 ResizeObserver 兜底重测（增量式观察避免自触发循环）
const roObserved = new Set<Element>()
const ro = new ResizeObserver(() => {
  scrollTick.value++
})
function syncNodeObservers() {
  const wrap = wrapRef.value
  if (!wrap) return
  const now = new Set<Element>()
  wrap.querySelectorAll(".graph-node, .func-node").forEach((el) => {
    now.add(el)
    if (!roObserved.has(el)) {
      roObserved.add(el)
      ro.observe(el)
    }
  })
  for (const el of roObserved) {
    if (!now.has(el)) {
      roObserved.delete(el)
      ro.unobserve(el)
    }
  }
}
watchEffect(() => {
  // 建立响应式依赖：节点坐标/三角 pin 标记、连线集合（引用）、缩放、滚动
  for (const n of props.graph.nodes.value) {
    void n.x
    void n.y
    void n.triIn
    void n.triOut
  }
  void props.graph.wires.value
  void props.graph.zoom.value
  void props.graph.direction.value
  void props.graph.hideMundane.value
  void scrollTick.value
  const wrap = wrapRef.value
  if (!wrap) return
  const wrapRect = wrap.getBoundingClientRect()
  const map = new Map<string, { x: number, y: number }>()
  wrap.querySelectorAll<HTMLElement>("[data-pin-id]").forEach((el) => {
    const pinId = el.dataset.pinId
    if (!pinId) return
    const rect = el.getBoundingClientRect()
    map.set(pinId, {
      x: (rect.left + rect.width / 2 - wrapRect.left + wrap.scrollLeft) / props.graph.zoom.value,
      y: (rect.top + rect.height / 2 - wrapRect.top + wrap.scrollTop) / props.graph.zoom.value
    })
  })
  // 单点居中：无独立 DOM 元素的引脚别名到同侧的 main 或 tri（三角回流时 main 元素被 tri 替代）
  for (const pin of props.graph.pins.value) {
    if (map.has(pin.id)) continue
    const parts = pin.id.split(":")
    for (const suffix of [":main", ":tri"]) {
      const v = map.get(`${parts[0]}:${parts[1]}${suffix}`)
      if (v) {
        map.set(pin.id, v)
        break
      }
    }
  }
  // 整表替换（ref 赋值保证触发依赖它的 SVG path 重渲染）
  anchors.value = map
  syncNodeObservers()
}, { flush: "post" })

/** pin 中心在画布（未缩放）坐标系中的锚点 */
function pinAnchor(pinId: string) {
  return anchors.value.get(pinId) ?? { x: 0, y: 0 }
}

function onPinDragStart(pinId: string, _ev: PointerEvent) {
  // 空格按住时不拉线，转为平移视图（pin 的 pointerdown 在子组件内已 stopPropagation，须在此接管）
  if (spaceHeld.value) {
    startPanDrag(_ev)
    return
  }
  const start = pinAnchor(pinId)
  tempWire.value = { x1: start.x, y1: start.y, x2: start.x, y2: start.y }
  const onMove = (e: PointerEvent) => {
    const pos = clientToCanvas(e.clientX, e.clientY)
    tempWire.value = { x1: start.x, y1: start.y, x2: pos.x, y2: pos.y }
  }
  const onUp = (e: PointerEvent) => {
    const target = (e.target as HTMLElement)?.closest?.("[data-pin-id]") as HTMLElement | null
    const targetPinId = target?.dataset.pinId
    if (targetPinId && targetPinId !== pinId) {
      const err = props.graph.tryConnect(pinId, targetPinId)
      err && ElMessage.error(err)
    }
    // 结构变化后强制重算锚点表：保证新线（含三角回流线）在 pin 渲染进 DOM 后立即显示
    scrollTick.value++
    tempWire.value = null
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", onUp)
    window.removeEventListener("pointercancel", onUp)
  }
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp)
  window.addEventListener("pointercancel", onUp)
}

/** UE5 蓝图式贝塞尔曲线（竖直切线） */
function wirePath(from: { x: number, y: number }, to: { x: number, y: number }, isBackflow = false) {
  if (props.graph.direction.value === "h") {
    if (!isBackflow && Math.abs(from.y - to.y) < 8) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
    const midX = from.x + 40
    return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`
  }
  if (!isBackflow && Math.abs(from.x - to.x) < 8) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  if (isBackflow) {
    // 回流线 U 形：从绿节点出发往下沉 → 横穿 → 一路上行进红节点（兜底绕行）
    const bottomY = Math.max(from.y, to.y) + 60
    return `M ${from.x} ${from.y} L ${from.x} ${bottomY} L ${to.x} ${bottomY} L ${to.x} ${to.y}`
  }
  // 普通扇出：从源中心垂直下来→汇到源与目标的中间水平线（居中于两组节点之间）→横向散开→垂直进目标
  const midY = (from.y + to.y) / 2
  return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`
}
</script>

<template>
  <div ref="wrapRef" class="node-canvas-wrap" :class="{ panning: spaceHeld }" :style="{ height: wrapHeight }" @scroll="scrollTick++">
    <div
      class="node-canvas"
      :style="{
        width: `${graph.canvasSize.value.width}px`,
        height: `${graph.canvasSize.value.height}px`,
        transform: `scale(${graph.zoom.value})`,
      }"
      @pointerdown="onCanvasPointerDown"
      @contextmenu.prevent="onCanvasCtxBlank"
    >
      <svg class="edges">
        <!-- 已存在连线（不可点击；删线走删除节点/标记为出售） -->
        <g v-for="w in visibleWires" :key="w.id" class="wire-group">
          <path
            :d="wirePath(pinAnchor(w.fromPinId), pinAnchor(w.toPinId), w.fromPinId.endsWith(':tri'))" fill="none"
            stroke="var(--el-border-color-darker)" stroke-width="2"
            :class="w.fromPinId.endsWith(':tri') ? 'wire-path wire-tri' : 'wire-path'"
          />
        </g>
        <!-- 拖线中的临时线 -->
        <path
          v-if="tempWire" :d="wirePath({ x: tempWire.x1, y: tempWire.y1 }, { x: tempWire.x2, y: tempWire.y2 })"
          fill="none" stroke="#ffd04b" stroke-width="2" stroke-dasharray="6 4"
        />
      </svg>

      <!-- 框选矩形 -->
      <div
        v-if="selecting"
        class="selection-rect"
        :style="{
          left: `${selecting.x1}px`,
          top: `${selecting.y1}px`,
          width: `${selecting.x2 - selecting.x1}px`,
          height: `${selecting.y2 - selecting.y1}px`,
        }"
      />

      <!-- 右键快捷菜单 -->
      <div v-if="ctxMenu" class="ctx-menu" :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }">
        <template v-if="!ctxMenu.node">
          <div class="ctx-label">
            {{ getTrans("画布") }}
          </div>
          <button type="button" class="ctx-item" @click="quickAddItem">
            {{ getTrans("添加物品") }}<span class="ctx-k">{{ getTrans("红节点内选物品") }}</span>
          </button>
          <button type="button" class="ctx-item" @click="openHkFromMenu">
            {{ getTrans("快捷键设置") }}
          </button>
        </template>
        <template v-else>
          <div v-if="ctxNodeName" class="ctx-title">
            {{ ctxNodeName }}
          </div>
          <template v-if="ctxLevel === 'root'">
            <div class="ctx-label">
              {{ getTrans("继续处理") }}
            </div>
            <button v-for="cat in A_CATS.filter(c => (ctxCatCounts.get(c.key) ?? 0) > 0)" :key="cat.key" type="button" class="ctx-item" @click="ctxLevel = cat.key">
              {{ getTrans(cat.zh) }}<span class="ctx-k">{{ ctxCatCounts.get(cat.key) }}</span>
            </button>
            <button v-for="opt in ctxAlchemyOptions" :key="opt.key" type="button" class="ctx-item" @click="quickAlchemyProcess(opt.key)">
              {{ ctxActionLabel(opt.key) }}
            </button>
          </template>
          <template v-else>
            <div class="ctx-label ctx-back" @click="ctxLevel = 'root'">
              ← {{ getTrans(A_CATS.find(c => c.key === ctxLevel)?.zh ?? "") }}
            </div>
            <button v-for="x in ctxCatRecipes" :key="x.r.actionHrid" type="button" class="ctx-item" @click="quickForge(x.r)">
              {{ getTrans(getItemDetailOf(x.r.productHrid)?.name ?? "") }}<span class="ctx-k">{{ Math.round(x.price / 1000) }}k · {{ x.timeSec.toFixed(1) }}s</span>
            </button>
          </template>
          <button v-if="ctxIsBlue" type="button" class="ctx-item" @click="ctxSellNow">
            {{ getTrans("标记为出售") }}
          </button>
          <button type="button" class="ctx-item danger" @click="ctxDelete">
            {{ getTrans("删除节点") }}
          </button>
          <button type="button" class="ctx-item" @click="openHkFromMenu">
            {{ getTrans("快捷键设置") }}
          </button>
        </template>
      </div>

      <!-- 快捷键设置入口（画布右上角） -->

      <GraphNodeComp
        :horiz="graph.direction.value === 'h'"
        v-for="n in visibleVarNodes"
        :key="n.id"
        :node="n"
        :class="{ selected: selectedIds.includes(n.id) }"
        :result="graph.nodeResults.value.get(n.id) ?? null"
        :gather-actions="graph.getGatherActionsOf(n.hrid)"
        :item-options="itemOptions"
        @drag-start="onDragStart"
        @pin-drag-start="onPinDragStart"
        @delete="(n) => graph.deleteNode(n.id)"
        @set-item="(n, hrid) => graph.setRowItem(n.rowUid!, hrid)"
        @set-obtain="(n, v) => (n.obtain = v as GraphNode['obtain'])"
        @set-buy-side="(n, side) => (n.buySide = side)"
        @set-sell-side="(n, side) => (n.sellSide = side)"
        @ctxmenu="onCtxMenu"
      />
      <PurpleNode
        :horiz="graph.direction.value === 'h'"
        v-for="n in visibleFuncNodes"
        :key="n.id"
        :node="n"
        :class="{ selected: selectedIds.includes(n.id) }"
        :pins="graph.pins.value.filter(p => p.nodeId === n.id)"
        :alchemy-options="n.mainItemHrid ? graph.getAlchemyActionOptionsOf(n.mainItemHrid) : []"
        :result="graph.nodeResults.value.get(n.id) ?? null"
        @drag-start="onDragStart"
        @pin-drag-start="onPinDragStart"
        @set-class="(node, cls) => node.funcClass = cls"
        @set-action="(node, key) => { node.actionHrid = `/actions/alchemy/${key}`; graph.onFuncConfigChange(node) }"
        @set-catalyst="(node, rank) => { node.catalystRank = rank; graph.onFuncConfigChange(node) }"
        @delete="(n) => graph.deleteNode(n.id)"
        @ctxmenu="onCtxMenu"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.node-canvas-wrap {
  /* 高度由 wrapHeight 内联控制，此处仅兜底 */
  transition: height 0.25s ease;
  overflow: auto;
  height: 560px;
  border-radius: 8px;
  // 点状背景（径向渐变重复），与参考图一致
  background-image: radial-gradient(var(--el-border-color) 1px, transparent 1px);
  background-size: 24px 24px;
}
.node-canvas-wrap.panning {
  cursor: grab;
}
.node-canvas {
  position: relative;
  transform-origin: 0 0;
}
.edges {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.wire-group:hover .wire-path {
  stroke: #ffd04b;
  stroke-width: 3;
}
/* 三角回流线：金色流动虚线（输送带效果） */
.wire-tri {
  stroke: #d4a017;
  stroke-dasharray: 8 6;
  animation: wire-tri-flow 0.8s linear infinite;
}
@keyframes wire-tri-flow {
  to {
    stroke-dashoffset: -14;
  }
}
.selection-rect {
  position: absolute;
  border: 1px dashed #ffd04b;
  background: rgba(255, 208, 75, 0.08);
  pointer-events: none;
  z-index: 10;
}
:deep(.selected) {
  outline: 2px solid #ffd04b;
  outline-offset: 2px;
}
.ctx-menu {
  position: absolute;
  z-index: 40;
  min-width: 168px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
  padding: 6px;
  font-size: 12.5px;
}
.ctx-title {
  font-weight: 600;
  padding: 4px 10px;
  color: var(--el-text-color-primary);
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 4px;
}
.ctx-label {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  padding: 2px 10px;
}
.ctx-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: var(--el-text-color-regular);
  font-size: 12.5px;
  padding: 6px 10px;
  cursor: pointer;
  text-align: left;
}
.ctx-item:hover {
  background: var(--el-fill-color);
  color: var(--el-color-primary);
}
.ctx-item.danger:hover {
  color: var(--el-color-danger);
}
.ctx-back {
  cursor: pointer;
}
.ctx-back:hover {
  color: var(--el-color-primary);
}
.ctx-k {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.hk-btn:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

/* ===== 手机端适配 ===== */
@media (max-width: 768px) {
  .node-canvas-wrap {
    height: 62vh;
  }
}
</style>
