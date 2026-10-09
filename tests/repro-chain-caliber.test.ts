/**
 * 链条页 vs 超炼页 口径对拍（2026-10-08 修复回归）
 *
 * 背景：alchemyChain.ts 曾有两处口径错误——
 *  1. 链上产出未 ×successRate（产出按"每次成功"、成本按"每次尝试"，链上增值虚高）
 *  2. 卖出价值未 ×sellTaxFactor（计税开关对链上终值几乎无效）
 * 修复后与 superAlchemy.ts（B13 已对拍首页验证过的正典实现）语义一致：
 * 产出期望 = count × rate × successRate，出售 = bid × sellTaxFactor。
 *
 * 断言（超炼选项与链条选项同为 catalystRank=0 / smart / 计税 / 含稀有）：
 *  A. directSellValue === bid × sellTaxFactor（税率必须进入直卖对照价）
 *  B. 超炼最优=直卖（无行）时，链条终值不得显著高于直卖价（修复前会虚高到 1/sr 倍）
 *  C. 超炼选了分解/转化时，链条（分解only/转化only）终值 ≤ 超炼每件净收益 + 容差
 *     ——超炼在每节点上比链条多考虑点金/转化/催化剂档，只会更优不会更差
 * 运行：npx vitest run tests/repro-chain-caliber.test.ts
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { expect, it } from "vitest"

async function boot() {
  const fakeReq = (result: unknown) => {
    const r: any = { result, error: null }
    setTimeout(() => r.onsuccess && r.onsuccess({ target: r }), 0)
    return r
  }
  const fakeStore = { get: () => fakeReq(undefined), put: () => fakeReq(undefined), delete: () => fakeReq(undefined) }
  const fakeTx: any = { objectStore: () => fakeStore, onerror: null, oncomplete: null, onabort: null }
  const fakeDb = { transaction: () => fakeTx, close: () => {} }
  ;(globalThis as any).indexedDB = { open: () => fakeReq(fakeDb) }

  const { pinia } = await import("@/pinia")
  const { setActivePinia } = await import("pinia")
  const { useGameStore, updateMarketData } = await import("@/pinia/stores/game")
  const { getLeaderboardDataApi } = await import("@/common/apis/leaderboard")
  const { computeSuperAlchemy } = await import("@/calculator/superAlchemy")
  const { DecomposeCalculator, TransmuteCalculator } = await import("@/calculator/alchemy")
  const { computeDecomposeChain, computeTransmuteChain } = await import("@/calculator/alchemyChain")
  const { getPriceOf } = await import("@/common/apis/game")
  const { SELL_TAX_FACTOR } = await import("@/common/constants/market")

  const root = process.cwd()
  const dataJson = JSON.parse(fs.readFileSync(path.join(root, "public/data/data.json"), "utf8"))
  const marketJson = JSON.parse(fs.readFileSync(path.join(root, "public/data/market.json"), "utf8"))

  setActivePinia(pinia)
  const game = useGameStore(pinia)
  game.gameData = dataJson
  await new Promise(resolve => setTimeout(resolve, 50))
  game.marketData = await updateMarketData(null, marketJson, dataJson)
  game.clearAllCaches()

  return { getLeaderboardDataApi, computeSuperAlchemy, computeDecomposeChain, computeTransmuteChain, DecomposeCalculator, TransmuteCalculator, getPriceOf, SELL_TAX_FACTOR, gameData: dataJson }
}

it("链条页(分解/转化) vs 超炼页：口径对拍", async () => {
  const { computeSuperAlchemy, computeDecomposeChain, computeTransmuteChain, getPriceOf, SELL_TAX_FACTOR, gameData } = await boot()

  const chainOpts = { mode: "smart" as const, catalystRank: 0, sellTaxFactor: SELL_TAX_FACTOR, includeRare: true }
  const superRows = computeSuperAlchemy({ catalystRanks: [0], sellTaxFactor: SELL_TAX_FACTOR, mode: "smart", includeRare: true })
  const superMap = new Map(superRows.map(r => [r.item.hrid, r]))

  // 转化环检测：链条页转化链用值迭代（环上复利收敛），超炼遇环按直卖切断——
  // 有环物品（宝石/茶/法术圈）链条高于超炼属设计差异，不参与对拍
  function hasTransmuteCycle(startHrid: string): boolean {
    const nextOf = (h: string) => (gameData.itemDetailMap[h]?.alchemyDetail?.transmuteDropTable ?? []).map((d: any) => d.itemHrid)
    const reachable = new Set<string>([startHrid])
    const queue = [startHrid]
    while (queue.length) {
      const cur = queue.shift()!
      for (const nx of nextOf(cur)) {
        if (!reachable.has(nx)) {
          reachable.add(nx)
          queue.push(nx)
        }
      }
    }
    const state = new Map<string, number>()
    let cyc = false
    const dfs = (u: string) => {
      if (cyc) return
      state.set(u, 1)
      for (const v of nextOf(u)) {
        if (!reachable.has(v)) continue
        const s = state.get(v) ?? 0
        if (s === 1) return (cyc = true)
        if (s === 0) dfs(v)
        if (cyc) return
      }
      state.set(u, 2)
    }
    dfs(startHrid)
    return cyc
  }

  const items = Object.values(gameData.itemDetailMap).filter((it: any) => it.isTradable && it.alchemyDetail)

  const violations: any[] = []
  let checkedA = 0
  let checkedB = 0
  let checkedC = 0
  let exactMatch = 0
  for (const item of items as any[]) {
    const bid = getPriceOf(item.hrid, 0).bid
    const superRow = superMap.get(item.hrid)

    if (item.alchemyDetail.decomposeItems && bid > 0) {
      const res = computeDecomposeChain(item.hrid, chainOpts)
      // A. 直卖对照价必须含税
      checkedA++
      const expectSell = bid * SELL_TAX_FACTOR
      if (Math.abs(res.directSellValue - expectSell) > 1e-6) {
        violations.push({ kind: "A-直卖含税", hrid: item.hrid.replace("/items/", ""), got: res.directSellValue, want: expectSell })
      }
      // B. 超炼最优=直卖 → 链条终值不应显著高于直卖
      if (!superRow) {
        checkedB++
        const slack = Math.max(1, res.directSellValue * 0.005)
        if (res.totalValue > res.directSellValue + slack) {
          violations.push({
            kind: "B-链条虚高(超炼选直卖)",
            hrid: item.hrid.replace("/items/", ""),
            chain: Number(res.totalValue.toFixed(2)),
            sell: Number(res.directSellValue.toFixed(2))
          })
        }
      }
      // C. 超炼选分解 → 分解链终值 ≤ 超炼每件净收益
      if (superRow && superRow.eval.action === "decompose") {
        checkedC++
        const superNet = superRow.eval.unitNet
        const slack = Math.max(1, Math.abs(superNet) * 0.005)
        if (res.totalValue > superNet + slack) {
          violations.push({
            kind: "C-链条>超炼(分解)",
            hrid: item.hrid.replace("/items/", ""),
            chain: Number(res.totalValue.toFixed(2)),
            super: Number(superNet.toFixed(2)),
            gapPct: (((res.totalValue - superNet) / Math.abs(superNet)) * 100).toFixed(1)
          })
        } else if (Math.abs(res.totalValue - superNet) <= slack) {
          exactMatch++
        }
      }
    }

    // 转化链（无环物品）：超炼选转化时终值不得高于超炼
    if (item.alchemyDetail.transmuteDropTable && superRow && superRow.eval.action === "transmute" && bid > 0 && !hasTransmuteCycle(item.hrid)) {
      const res = computeTransmuteChain(item.hrid, chainOpts)
      if (res.directSellValue > 0) {
        checkedC++
        const superNet = superRow.eval.unitNet
        const slack = Math.max(1, Math.abs(superNet) * 0.005)
        if (res.totalValue > superNet + slack) {
          violations.push({
            kind: "C-链条>超炼(转化)",
            hrid: item.hrid.replace("/items/", ""),
            chain: Number(res.totalValue.toFixed(2)),
            super: Number(superNet.toFixed(2))
          })
        }
      }
    }
  }

  console.log(`物品数=${items.length} A直卖含税=${checkedA} B超炼选直卖=${checkedB} C超炼选炼金=${checkedC} 其中口径一致=${exactMatch}`)
  if (violations.length > 0) {
    console.table(violations.slice(0, 30))
  }
  expect(violations).toHaveLength(0)
}, 180000)

/**
 * 链条页 vs 首页利润榜：恒等式对拍（2026-10-08）
 *
 * 数学关系（修复后口径下严格成立）：
 *   链上单件价值(单步链) = 首页该动作行 profitPP ÷ 主原料单次消耗 + 主原料买价
 *   分解：ev = homePP/bulk + ask；转化：ev = homePP/netInput + ask
 * 推导：homePP = sr×(Σ主产物 count×rate×bid + 稀有)×税 − (bulk×ask + 边际成本)，
 *       移项即得上式——链条页与首页共用计算器，数字必须能相互反推。
 *
 * 断言：
 *  D1. 单步分解链（根=继续分解且所有子行=直接卖）：链上终值 === homePP/bulk + ask（精确）
 *  D2. 任意分解链：链上终值 ≥ homePP/bulk + ask − 容差（链只会更优不会更差）
 *  T1. 转化链：终值 ≥ homePP/netInput + ask − 容差（等号成立当所有产物退出=直卖；
 *      产物走点金退出或值迭代更深时链条更优，属预期）
 */
it("链条页 vs 首页利润：profitPP 恒等式对拍", async () => {
  const { getLeaderboardDataApi, computeDecomposeChain, computeTransmuteChain, DecomposeCalculator, TransmuteCalculator, SELL_TAX_FACTOR, gameData } = await boot()
  const { getTrans } = await import("@/locales")
  const ADVICE_SELL = getTrans("直接卖")

  const home = (await getLeaderboardDataApi({ includeTax: true, includeRare: true, fullList: true } as any)).list as any[]
  const homeDecomp = new Map<string, any>()
  const homeTrans = new Map<string, any>()
  for (const c of home) {
    if (c.result?.profitPH === -1 / 24 || !Number.isFinite(c.result?.profitPP)) continue
    if (c instanceof DecomposeCalculator && (c.catalystRank ?? 0) === 0) homeDecomp.set(c.hrid, c)
    if (c instanceof TransmuteCalculator && (c.catalystRank ?? 0) === 0) homeTrans.set(c.hrid, c)
  }

  const chainOpts = { mode: "smart" as const, catalystRank: 0, sellTaxFactor: SELL_TAX_FACTOR, includeRare: true }
  const violations: any[] = []
  let d1 = 0
  let d2 = 0
  let t1 = 0
  let t1Near = 0

  for (const [hrid, c] of homeDecomp) {
    const res = computeDecomposeChain(hrid, chainOpts)
    const main = c.ingredientListWithPrice[0]
    const homeIdent = c.result.profitPP / main.count + main.price
    const tol = Math.max(0.01, Math.abs(homeIdent) * 0.001)
    // D2: 链上终值不劣于首页单步每件边际
    d2++
    if (res.totalValue < homeIdent - tol) {
      violations.push({ kind: "D2-分解链劣于首页", hrid: hrid.replace("/items/", ""), chain: Number(res.totalValue.toFixed(2)), homeIdent: Number(homeIdent.toFixed(2)) })
    }
    // D1: 单步链精确相等
    const root = res.rows[0]
    const oneLevel = root.children.length > 0 && root.children.every((ch: any) => ch.children.length === 0 && ch.advice === ADVICE_SELL)
    if (oneLevel) {
      d1++
      if (Math.abs(res.totalValue - homeIdent) > tol) {
        violations.push({
          kind: "D1-单步分解链≠首页",
          hrid: hrid.replace("/items/", ""),
          chain: Number(res.totalValue.toFixed(2)),
          homeIdent: Number(homeIdent.toFixed(2)),
          gapPct: (((res.totalValue - homeIdent) / Math.abs(homeIdent)) * 100).toFixed(2)
        })
      }
    }
  }

  // 转化环检测（同上一用例：有环物品值迭代复利，不参与恒等式）
  function hasTransmuteCycle(startHrid: string): boolean {
    const nextOf = (h: string) => (gameData.itemDetailMap[h]?.alchemyDetail?.transmuteDropTable ?? []).map((d: any) => d.itemHrid)
    const reachable = new Set<string>([startHrid])
    const queue = [startHrid]
    while (queue.length) {
      const cur = queue.shift()!
      for (const nx of nextOf(cur)) {
        if (!reachable.has(nx)) {
          reachable.add(nx)
          queue.push(nx)
        }
      }
    }
    const state = new Map<string, number>()
    let cyc = false
    const dfs = (u: string) => {
      if (cyc) return
      state.set(u, 1)
      for (const v of nextOf(u)) {
        if (!reachable.has(v)) continue
        const s = state.get(v) ?? 0
        if (s === 1) return (cyc = true)
        if (s === 0) dfs(v)
        if (cyc) return
      }
      state.set(u, 2)
    }
    dfs(startHrid)
    return cyc
  }

  for (const [hrid, c] of homeTrans) {
    if (hasTransmuteCycle(hrid)) continue
    const res = computeTransmuteChain(hrid, chainOpts)
    if (res.directSellValue <= 0) continue
    const main = c.ingredientListWithPrice[0]
    const homeIdent = c.result.profitPP / main.count + main.price
    const tol = Math.max(0.01, Math.abs(homeIdent) * 0.001)
    t1++
    if (res.totalValue < homeIdent - tol) {
      violations.push({ kind: "T1-转化链劣于首页", hrid: hrid.replace("/items/", ""), chain: Number(res.totalValue.toFixed(2)), homeIdent: Number(homeIdent.toFixed(2)) })
    } else if (Math.abs(res.totalValue - homeIdent) <= Math.max(1, Math.abs(homeIdent) * 0.005)) {
      t1Near++
    }
  }

  console.log(`首页分解行=${homeDecomp.size}(其中单步链恒等=${d1}/全部D2校验=${d2}) 转化行=${homeTrans.size} 可比=${t1}(其中≈恒等=${t1Near})`)
  if (violations.length > 0) {
    console.table(violations.slice(0, 30))
  }
  expect(violations).toHaveLength(0)
}, 180000)
