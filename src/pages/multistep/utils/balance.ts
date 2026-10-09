import type { GraphNode, GraphWire, NodeCalcResult, UpupItemRow } from "../types"
import type { Product } from "@/calculator"
import type { Action } from "~/game"
import { CoinifyCalculator, DecomposeCalculator, TransmuteCalculator } from "@/calculator/alchemy"
import { GatherCalculator } from "@/calculator/gather"
import { ManufactureCalculator } from "@/calculator/manufacture"
import { getPriceOf } from "@/common/apis/game"
import { initBuffMap } from "@/common/apis/player"
import { getManualPriceOf } from "@/common/apis/price"
import { SELL_TAX_FACTOR } from "@/common/constants/market"
import { getTrans } from "@/locales"
import { COIN_HRID, PriceStatus } from "@/pinia/stores/game"
import { getGatherActionsOf } from "./recipes"

/** 首页自定义价格：手动 ask/bid 已设置时优先（getManualPriceOf 自带启用开关；与首页计算器 handlePrice、链条页同口径） */
function manualAskOf(hrid: string): number | null {
  const manual = getManualPriceOf(hrid, 0)?.ask
  return manual?.manual && manual.manualPrice != null ? manual.manualPrice : null
}

function manualBidOf(hrid: string): number | null {
  const manual = getManualPriceOf(hrid, 0)?.bid
  return manual?.manual && manual.manualPrice != null ? manual.manualPrice : null
}

/** 单批配平结果 */
export interface BalanceResult {
  /** 驱动节点（[上部] 第一行对应的红节点） */
  driver: GraphNode | null
  /** 每函数：单批动作次数 / 单次有效耗时(ns，已按效率折算) / 隐藏输入（金币/茶）总成本 */
  funcInfo: Map<string, { actions: number, timeCost: number, hiddenCost: number }>
  /** 每节点计算结果（展示在节点上） */
  nodeInfo: Map<string, NodeCalcResult>
  /** 单批处理耗时（ns） */
  totalTime: number
  /** 单批成本 */
  totalCost: number
  /** 起始物品成本（驱动节点） */
  startItemCost: number
  /** 额外材料成本 */
  extraCost: number
  /** 单批税后收入 */
  income: number
  /** 市场税（非金币叶子按税前 4% 逐个累计，金币叶子不计税） */
  tax: number
  profit: number
  profitRate: number
  hourlyProfit: number | null
  dailyProfit: number | null
  processNodeCount: number
  sellLeafCount: number
  /** 用时占比明细（新功能） */
  steps: BalanceStep[]
}

/** 用时占比明细行（p11_3 参考） */
export interface BalanceStep {
  funcId: string
  /** 主要处理物品 hrid */
  mainHrid: string
  /** 动作名（非炼金=动作名；炼金=点金/分解/转化·催化剂） */
  actionLabel: string
  /** 该批处理的主要物品数量（输入或输出） */
  processCount: number
  /** 单批动作次数 */
  actions: number
  /** 单批耗时 ns */
  batchTime: number
  /** 占总处理耗时比例 0-1 */
  share: number
  /** 动作次数/h */
  actionsPerHour: number
}

function emptyNodeCalc(): NodeCalcResult {
  return { actions: null, timeCost: null, extraCost: null, preTaxIncome: null, tax: null, afterTaxIncome: null }
}

/** 构造某紫节点对应的首页计算器实例（数量/耗时口径与首页一致） */
function buildFuncCalculator(n: GraphNode) {
  const cfg = { hrid: n.mainItemHrid!, project: getTrans("处理方式"), catalystRank: n.catalystRank ?? 0 }
  if (n.funcClass === "A") {
    const action = n.actionHrid!.split("/")[2] as Action
    return new ManufactureCalculator({ ...cfg, action })
  }
  const key = n.actionHrid!.split("/").pop()
  if (key === "coinify") return new CoinifyCalculator(cfg)
  if (key === "transmute") return new TransmuteCalculator(cfg)
  return new DecomposeCalculator(cfg)
}

function isFuncResolved(n: GraphNode): boolean {
  return n.kind === "func" && !!n.actionHrid && (n.funcClass === "A" || n.catalystRank != null)
}

/** 单次传播的结果 */
interface PassResult {
  nodeQ: Map<string, number>
  funcActions: Map<string, { actions: number, calc: ReturnType<typeof buildFuncCalculator> }>
  gatherTime: number
}

/**
 * 自动配平：以第一行用户填写数量为基准，其余数量按配方期望值传播。
 * 传播是双向的：变量 → 消费紫节点（正向），变量 → 生产紫节点（按产量反推）。
 * 存在三角回流连接（防环）时：回流源的数量加回驱动节点重新传播，至多迭代 3 轮。
 */
export function balanceAndMutate(nodes: GraphNode[], wires: GraphWire[], rows: UpupItemRow[]): BalanceResult {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const nodeInfo = new Map<string, NodeCalcResult>()
  const funcInfo = new Map<string, { actions: number, timeCost: number, hiddenCost: number }>()
  // 配平前强制初始化 buffs（装备/等级/茶/星空加成），保证 speed/successRate 与首页一致
  initBuffMap()

  const empty = (): BalanceResult => ({
    driver: null,
    funcInfo,
    nodeInfo,
    totalTime: 0,
    totalCost: 0,
    startItemCost: 0,
    extraCost: 0,
    income: 0,
    tax: 0,
    profit: 0,
    profitRate: 0,
    hourlyProfit: null,
    dailyProfit: null,
    processNodeCount: nodes.filter(isFuncResolved).length,
    sellLeafCount: nodes.filter(n => n.kind === "var" && n.varKind === "green").length,
    steps: []
  })

  const driver = nodes.find(n => n.kind === "var" && n.rowUid != null && rows[0] && n.rowUid === rows[0].uid) ?? null
  if (!driver || !driver.hrid) {
    for (const n of nodes) nodeInfo.set(n.id, emptyNodeCalc())
    return empty()
  }
  // 闭包内 TS 收窄失效，这里固定为非空引用
  const driverNode: GraphNode = driver

  // 以第一行用户填写的数量为配平基准（不再固定 100）
  const baseQ = rows[0]?.count ?? 100

  /**
   * 输出变量节点 → 对应的 productList 条目。
   * 同名产物会有多个条目（如分解：主产物炼金精华 ×25 + 平凡掉落炼金精华 ×1.576@9.33%），
   * 按输出 pin 的顺序逐个消费同 hrid 条目，保证各节点取各自的 count/rate。
   */
  function matchOutputEntries(func: GraphNode, calc: ReturnType<typeof buildFuncCalculator>): Map<string, Product> {
    const entryMap = new Map<string, Product>()
    const byHrid = new Map<string, Product[]>()
    for (const e of calc.productList) {
      const arr = byHrid.get(e.hrid) ?? []
      arr.push(e)
      byHrid.set(e.hrid, arr)
    }
    const cursor = new Map<string, number>()
    for (const ow of wires.filter(x => x.fromPinId.startsWith(`${func.id}:`))) {
      const tgt = nodeMap.get(ow.toPinId.split(":")[0])
      if (!tgt || tgt.kind !== "var" || !tgt.hrid) continue
      const list = byHrid.get(tgt.hrid)
      if (!list) continue
      const i = cursor.get(tgt.hrid) ?? 0
      if (i >= list.length) continue
      entryMap.set(tgt.id, list[i])
      cursor.set(tgt.hrid, i + 1)
    }
    return entryMap
  }

  /** 纯传播一轮：返回节点数量、函数动作次数与采集耗时，不写回也不结算 */
  function runPass(base: number): PassResult {
    const nodeQ = new Map<string, number>()
    nodeQ.set(driverNode.id, base)
    const funcActions = new Map<string, { actions: number, calc: ReturnType<typeof buildFuncCalculator> }>()
    const processedFuncs = new Set<string>()
    const visited = new Set<string>()
    const queue: GraphNode[] = [driverNode]
    let gatherTime = 0

    /** 处理一个紫节点的配方：传播其他输入输出数量 */
    function processFunc(func: GraphNode, calc: ReturnType<typeof buildFuncCalculator>, actions: number) {
      processedFuncs.add(func.id)
      funcActions.set(func.id, { actions, calc })
      // 其他输入变量
      for (const iw of wires.filter(x => x.toPinId.startsWith(`${func.id}:`) && x.toPinId !== `${func.id}:in:main`)) {
        const src = nodeMap.get(iw.fromPinId.split(":")[0])
        if (!src || src.kind !== "var") continue
        if (nodeQ.has(src.id)) continue
        const entry = calc.ingredientList.find(i => i.hrid === src.hrid)
        if (!entry) continue
        const qIn = actions * entry.count
        nodeQ.set(src.id, qIn)
        queue.push(src)
      }
      // 主输入变量（触发线可能来自红/蓝节点）
      for (const iw of wires.filter(x => x.toPinId === `${func.id}:in:main`)) {
        const src = nodeMap.get(iw.fromPinId.split(":")[0])
        if (!src || src.kind !== "var" || nodeQ.has(src.id)) continue
        const entry = calc.ingredientList.find(i => i.hrid === src.hrid)
        if (!entry) continue
        const qIn = actions * entry.count
        nodeQ.set(src.id, qIn)
        queue.push(src)
      }
      // 输出变量（期望 = count × rate × 成功率）：count 已按 /成功率 放大（正典口径：失败不消耗物品，
      // 重试到成功的产出），此处再乘成功率还原为「每动作期望」——实测与首页利润榜对拍一致
      // （转化紫水晶 1.76M≈快照1.60M、分解奶酪剑 1.75M≈1.73M），不能删掉这个乘法
      // 同名产物按条目逐个匹配（见 matchOutputEntries），不能取 find 第一个
      const outputEntries = matchOutputEntries(func, calc)
      for (const ow of wires.filter(x => x.fromPinId.startsWith(`${func.id}:`))) {
        const tgt = nodeMap.get(ow.toPinId.split(":")[0])
        if (!tgt || tgt.kind !== "var") continue
        const entry = outputEntries.get(tgt.id)
        if (!entry) continue
        const qOut = actions * entry.count * (entry.rate ?? 1) * calc.successRate
        nodeQ.set(tgt.id, qOut)
        queue.push(tgt)
      }
    }

    while (queue.length) {
      const v = queue.shift()!
      if (visited.has(v.id)) continue
      visited.add(v.id)
      const q = nodeQ.get(v.id) ?? 0

      // 红节点三采集：累计采集耗时（效率同样折算：单次有效耗时 = effectiveTimeCost / efficiency）
      if (v.kind === "var" && v.varKind === "red" && v.hrid && v.obtain === "gather") {
        const gatherAction = getGatherActionsOf(v.hrid)[0]
        if (gatherAction) {
          const action = gatherAction.split("/")[2] as Action
          const g = new GatherCalculator({ hrid: v.hrid, project: getTrans("处理方式"), action })
          const yieldPerAction = g.productList.find(p => p.hrid === v.hrid)?.count || 1
          gatherTime += (q / yieldPerAction) * (g.effectiveTimeCost / g.efficiency)
        }
      }

      // 1) 上游：该变量的生产紫节点（in-wire 来源）——按产量反推动作次数
      const producerWire = wires.find(w => w.toPinId === `${v.id}:in:main`)
      if (producerWire) {
        const func = nodeMap.get(producerWire.fromPinId.split(":")[0])
        if (func && func.kind === "func" && isFuncResolved(func) && !processedFuncs.has(func.id)) {
          const calc = buildFuncCalculator(func) /* 现场构造：speed/buff 取当前玩家配置 */
          const outEntry = calc.productList.find(p => p.hrid === v.hrid)
          if (outEntry) {
            // 反推同样折算成功率：每动作期望产出 = count × rate × successRate
            processFunc(func, calc, q / (outEntry.count * (outEntry.rate ?? 1) * calc.successRate))
          }
        }
      }
      // 2) 下游：消费该变量的紫节点（out-wire 目标）——按消耗量正向传播
      for (const w of wires.filter(x => x.fromPinId === `${v.id}:out:main`)) {
        const func = nodeMap.get(w.toPinId.split(":")[0])
        if (!func || func.kind !== "func" || !isFuncResolved(func)) continue
        if (processedFuncs.has(func.id)) continue
        const calc = buildFuncCalculator(func) /* 现场构造：speed/buff 取当前玩家配置 */
        const inEntry = calc.ingredientList.find(i => i.hrid === v.hrid)
        if (inEntry) {
          processFunc(func, calc, q / inEntry.count)
        }
      }
    }
    return { nodeQ, funcActions, gatherTime }
  }

  // 三角回流迭代：
  // 基线轮 A=用户值；随后每轮以「回流源（C）上一轮的数量」作为 A 重新传播，结果累加。
  // 总共至多计算 3 轮（基线 1 轮 + 回流 2 轮）；小于 0.001 的回流忽略（3 位小数精度）。
  const triWire0 = wires.find(w => w.toPinId === `${driverNode.id}:in:tri`)
  const triSourceId = triWire0?.fromPinId.split(":")[0] ?? null

  const accumulateQ = new Map<string, number>()
  const accumulateFuncActions = new Map<string, { actions: number, calc: ReturnType<typeof buildFuncCalculator> }>()
  let accumulateGatherTime = 0

  function mergePass(p: PassResult) {
    for (const [id, q] of p.nodeQ) {
      accumulateQ.set(id, (accumulateQ.get(id) ?? 0) + q)
    }
    for (const [id, fa] of p.funcActions) {
      const cur = accumulateFuncActions.get(id)
      accumulateFuncActions.set(id, cur ? { actions: cur.actions + fa.actions, calc: fa.calc } : { ...fa })
    }
    accumulateGatherTime += p.gatherTime
  }

  let nodeQ: Map<string, number>
  let funcActions: Map<string, { actions: number, calc: ReturnType<typeof buildFuncCalculator> }>
  let gatherTime: number

  if (triSourceId) {
    // 存在三角回流：迭代累加，驱动保持用户值，与驱动同物品的节点（回流载体 B/C）归零
    let pass = runPass(baseQ)
    mergePass(pass)
    let reflux = pass.nodeQ.get(triSourceId) ?? 0
    for (let round = 0; round < 2; round++) {
      if (reflux < 0.001) break
      pass = runPass(reflux)
      mergePass(pass)
      reflux = pass.nodeQ.get(triSourceId) ?? 0
    }
    nodeQ = new Map<string, number>()
    for (const [id, q] of accumulateQ) {
      const n = nodeMap.get(id)
      if (!n) continue
      if (id === driverNode.id) nodeQ.set(id, baseQ)
      else if (n.hrid === driverNode.hrid) nodeQ.set(id, 0)
      else nodeQ.set(id, q)
    }
    funcActions = accumulateFuncActions
    gatherTime = accumulateGatherTime
  } else {
    // 无三角回流：单轮传播直接结算。
    // 与驱动同物品的产物按配方自然取值：转化自产的 B 由计算器 sameItem 逻辑为 0，
    // 下游转化得到的 C 正常算出正数（无需三角连线）
    const pass = runPass(baseQ)
    nodeQ = pass.nodeQ
    funcActions = pass.funcActions
    gatherTime = pass.gatherTime
  }

  // —— 结算：按累计结果汇总成本/耗时/收入并回写节点数量 ——
  let totalTime = gatherTime
  let totalCost = 0
  let startItemCost = 0
  let income = 0
  let taxTotal = 0

  for (const v of nodes) {
    if (v.kind !== "var") continue
    // 仅三角回流模式下，与驱动同物品的节点（回流载体）固定归零
    if (triSourceId && v.hrid === driverNode.hrid && v.id !== driverNode.id) {
      v.count = 0
      continue
    }
    const q = nodeQ.get(v.id)
    if (q == null) continue
    v.count = Math.round(q * 1000) / 1000
  }
  driverNode.count = Math.round((nodeQ.get(driverNode.id) ?? baseQ) * 1000) / 1000
  if (rows[0]) rows[0].count = driverNode.count

  for (const v of nodes) {
    if (v.kind !== "var") continue
    const q = nodeQ.get(v.id)
    if (q == null) continue
    // 购买红节点计入成本（价侧按节点下拉：左价=ask 挂单最低卖 / 右价=bid 最高买单）
    if (v.varKind === "red" && v.hrid) {
      if (v.obtain === "gather") continue
      const cost = q * (manualAskOf(v.hrid) ?? getPriceOf(v.hrid, 0, v.buySide === "bid" ? PriceStatus.BID : PriceStatus.ASK).ask)
      totalCost += cost
      if (v.id === driverNode.id) startItemCost = cost
    }
    // 绿色叶子计入税后收入：单价取生产计算器条目的 marketPrice（点金金币 = 卖价×5×bulk 等特例靠它）
    if (v.varKind === "green" && v.hrid) {
      let price = manualBidOf(v.hrid) ?? getPriceOf(v.hrid, 0, undefined, v.sellSide === "ask" ? PriceStatus.ASK : PriceStatus.BID).bid
      const producerWire = wires.find(w => w.toPinId === `${v.id}:in:main`)
      const producer = producerWire ? nodeMap.get(producerWire.fromPinId.split(":")[0]) : undefined
      if (producer && producer.kind === "func") {
        const fa = funcActions.get(producer.id)
        // 同名产物按条目逐个匹配（见 matchOutputEntries），不能取 find 第一个
        const entry = fa ? matchOutputEntries(producer, fa.calc).get(v.id) : undefined
        // 特例合成价（金币、无卖单按自制成本计价等）与普通市场价不同：保留合成价，普通物品尊重节点选的价侧
        const marketBid = manualBidOf(v.hrid) ?? getPriceOf(v.hrid).bid
        if (entry && (v.hrid === COIN_HRID || Math.abs(entry.marketPrice - marketBid) > 0.5)) price = entry.marketPrice
      }
      const pre = q * price
      // 金币（点金产物）是货币本身，不计市场税；其余叶子按 4% 计税（与首页计算器口径一致）
      const after = v.hrid === COIN_HRID ? pre : pre * SELL_TAX_FACTOR
      income += after
      taxTotal += pre - after
      nodeInfo.set(v.id, { actions: null, timeCost: null, extraCost: null, preTaxIncome: pre, tax: pre - after, afterTaxIncome: after })
    }
  }

  for (const [funcId, fa] of funcActions) {
    const func = nodeMap.get(funcId)
    if (!func) continue
    const { actions, calc } = fa
    // 效率等价于独立乘区的速度：>100% 效率时单批耗时 = 动作数 × effectiveTimeCost / efficiency
    // （与首页 actionsPH = 3600 / effectiveTimeCost × efficiency 口径一致，小时收益才能对上）
    const timeCost = calc.effectiveTimeCost / calc.efficiency
    // 隐藏输入（金币/茶）= ingredientList 中没有变量连线的条目
    const wiredHrids = new Set<string>()
    for (const iw of wires.filter(x => x.toPinId.startsWith(`${func.id}:`))) {
      const src = nodeMap.get(iw.fromPinId.split(":")[0])
      if (src?.kind === "var") wiredHrids.add(src.hrid)
    }
    let hiddenCost = 0
    for (const e of calc.ingredientList) {
      if (wiredHrids.has(e.hrid)) continue
      // 单价取计算器条目自带 marketPrice（转化/分解的金币成本是特例价，不是 1）
      hiddenCost += actions * e.count * e.marketPrice
    }
    funcInfo.set(func.id, { actions, timeCost, hiddenCost })
    totalTime += actions * timeCost
    totalCost += hiddenCost
    nodeInfo.set(func.id, {
      actions,
      timeCost: actions * timeCost,
      extraCost: hiddenCost,
      preTaxIncome: null,
      tax: null,
      afterTaxIncome: null
    })
  }

  // 市场税按叶子逐个累计（金币叶子不计税，不能由总收入反推）
  const tax = taxTotal
  const profit = income - totalCost
  const profitRate = totalCost > 0 ? profit / totalCost : 0
  const hourlyProfit = totalTime > 0 ? profit * ((3600 * 1e9) / totalTime) : null

  // 用时占比明细（p11_3 参考）：处理物品/动作/处理数量/动作次数/批次耗时/工时占比/动作次数/h
  const ALCHEMY_ACTION_LABEL: Record<string, string> = { coinify: "点金", decompose: "分解", transmute: "转化" }
  const CATALYST_LABEL: Record<number, string> = { 0: "", 1: " · 普通催化剂", 2: " · 至高催化剂" }
  const steps: BalanceStep[] = []
  for (const [funcId, fa] of funcActions) {
    const func = nodeMap.get(funcId)
    if (!func || fa.actions <= 0) continue
    const actionHrid = func.actionHrid!
    const actionLabel = func.funcClass === "A"
      ? getTrans(actionHrid.split("/")[2] as any)
      : `${ALCHEMY_ACTION_LABEL[actionHrid.split("/").pop() as string]}${CATALYST_LABEL[func.catalystRank ?? 0]}`
    const batchTime = fa.actions * (fa.calc.effectiveTimeCost / fa.calc.efficiency)
    // 主要物品数量：输入线连着的变量 hrid（非炼金=主产物经反推也成立，取原料优先）
    let processCount = 0
    for (const iw of wires.filter(x => x.toPinId.startsWith(`${funcId}:`))) {
      const src = nodeMap.get(iw.fromPinId.split(":")[0])
      if (src?.kind === "var" && src.hrid) {
        const q = nodeQ.get(src.id)
        if (q != null && q > processCount) processCount = q
      }
    }
    if (processCount <= 0 && func.mainItemHrid) {
      // 兜底：主原料动作数 × 每动作消耗
      const entry = fa.calc.ingredientList.find(i => i.hrid === func.mainItemHrid)
      processCount = entry ? fa.actions * entry.count : fa.actions
    }
    steps.push({
      funcId,
      mainHrid: func.mainItemHrid ?? "",
      actionLabel,
      processCount,
      actions: fa.actions,
      batchTime,
      share: totalTime > 0 ? batchTime / totalTime : 0,
      actionsPerHour: totalTime > 0 ? fa.actions * ((3600 * 1e9) / totalTime) : 0
    })
  }
  steps.sort((a, b) => b.batchTime - a.batchTime)

  return {
    driver,
    funcInfo,
    nodeInfo,
    totalTime,
    totalCost,
    startItemCost,
    extraCost: totalCost - startItemCost,
    income,
    tax,
    profit,
    profitRate,
    hourlyProfit,
    dailyProfit: hourlyProfit != null ? hourlyProfit * 24 : null,
    processNodeCount: nodes.filter(isFuncResolved).length,
    sellLeafCount: nodes.filter(n => n.kind === "var" && n.varKind === "green").length,
    steps
  }
}
