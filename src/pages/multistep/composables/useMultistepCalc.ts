import type { Ref } from "vue"
import type { GraphNode, GraphWire, NodeCalcResult, UpupItemRow, UpupSummary } from "../types"
import { ElMessage } from "element-plus"
import { computed, nextTick, ref, watch } from "vue"
import { getTrans } from "@/locales"
import { balanceAndMutate, type BalanceResult } from "../utils/balance"

/**
 * 配平计算：点击「自动配平」后生成快照驱动六卡片与节点指标；
 * 图结构/数量变化 → 快照失效（卡片显示 --），拖动节点不失效。
 */
export function useMultistepCalc(nodes: Ref<GraphNode[]>, wires: Ref<GraphWire[]>, rows: Ref<UpupItemRow[]>) {
  const balanceResult = ref<BalanceResult | null>(null)
  let suppressReset = false

  // —— 自动配平：图结构/数量变化后静默重算（默认开，可关） ——
  const autoBalance = ref((() => {
    try {
      return localStorage.getItem("multistep-auto-balance") !== "0"
    } catch {
      return true
    }
  })())
  function setAutoBalance(v: boolean) {
    autoBalance.value = v
    try {
      localStorage.setItem("multistep-auto-balance", v ? "1" : "0")
    } catch {
      // 隐私模式静默失败
    }
    if (v) balance(true)
  }
  let autoTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleAutoBalance() {
    if (autoTimer) clearTimeout(autoTimer)
    autoTimer = setTimeout(() => {
      autoTimer = null
      balance(true)
    }, 400)
  }

  // 结构签名：不含 x/y（拖动不触发失效），含 count（手动改数量触发失效）
  const structureSig = computed(() => JSON.stringify([
    nodes.value.map(n => [
      n.id,
      n.kind,
      n.varKind,
      n.hrid,
      n.count,
      n.obtain,
      n.buySide,
      n.sellSide,
      n.funcClass,
      n.mainItemHrid,
      n.actionHrid,
      n.catalystRank,
      n.rowUid
    ]),
    wires.value.map(w => [w.fromPinId, w.toPinId]).sort()
  ]))
  watch(structureSig, (nv, ov) => {
    if (nv === ov) return
    if (!suppressReset) balanceResult.value = null
    // suppressReset 期间是配平自身在改数量，不再调度，防自激
    if (!suppressReset && autoBalance.value) scheduleAutoBalance()
  })

  /** 自动配平入口：以第一行用户填写数量为基准，其余按配方期望传播；silent=自动模式不弹提示 */
  function balance(silent = false) {
    const driver = nodes.value.find(n => n.kind === "var" && n.rowUid != null && rows.value[0] && n.rowUid === rows.value[0].uid)
    if (!driver || !driver.hrid) {
      if (!silent) ElMessage.warning(getTrans("请先在第一行选择物品"))
      return
    }
    if ((rows.value[0]?.count ?? 0) < 1) {
      if (!silent) ElMessage.warning(getTrans("请将第一行数量改为大于1的数值"))
      return
    }
    suppressReset = true
    const result = balanceAndMutate(nodes.value, wires.value, rows.value)
    // 红节点行数量同步（3 位小数）
    for (const n of nodes.value) {
      if (n.kind === "var" && n.rowUid != null && n.count != null) {
        const row = rows.value.find(r => r.uid === n.rowUid)
        if (row) row.count = Math.round(n.count * 1000) / 1000
      }
    }
    balanceResult.value = result
    nextTick(() => {
      suppressReset = false
    })
  }

  const summary = computed<UpupSummary>(() => {
    const r = balanceResult.value
    if (!r) {
      return {
        leafAfterTaxIncome: null,
        leafTax: null,
        totalCost: null,
        startItemCost: null,
        extraCost: null,
        batchProfit: null,
        profitRate: null,
        totalTime: null,
        processNodeCount: nodes.value.filter(n => n.kind === "func" && !!n.actionHrid && (n.funcClass === "A" || n.catalystRank != null)).length,
        sellLeafCount: nodes.value.filter(n => n.kind === "var" && n.varKind === "green").length,
        hourlyProfit: null,
        dailyProfit: null
      }
    }
    return {
      leafAfterTaxIncome: r.income,
      leafTax: r.tax,
      totalCost: r.totalCost,
      startItemCost: r.startItemCost,
      extraCost: r.extraCost,
      batchProfit: r.profit,
      profitRate: r.profitRate,
      totalTime: r.totalTime,
      processNodeCount: r.processNodeCount,
      sellLeafCount: r.sellLeafCount,
      hourlyProfit: r.hourlyProfit,
      dailyProfit: r.dailyProfit
    }
  })

  const nodeResults = computed(() => balanceResult.value?.nodeInfo ?? new Map<string, NodeCalcResult>())
  /** 用时占比明细（配平后提供，未配平为空） */
  const steps = computed(() => balanceResult.value?.steps ?? [])

  return { summary, nodeResults, steps, balance, autoBalance, setAutoBalance }
}
