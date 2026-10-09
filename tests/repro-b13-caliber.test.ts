/**
 * B1-3 口径对拍：首页排行榜（单步炼金 Calculator）vs 超级炼金页（computeSuperAlchemy 链式）
 *
 * 结论（2026-10-01）：无真口径 bug。数字不同的三层原因——
 *  1. 单位：首页行 = 每次动作利润（主原料可能一次消耗 bulk 个，如茶叶分解×2），
 *     超炼 = 每 1 件利润；比较必须 PP/mainCount 归一
 *  2. 选优准则：超炼最大化每件净收益（囤货视角），首页按时薪排行 → 多步链
 *     "每件更赚但时薪更低"属预期（criterionDiff 计数）
 *  3. 链条收益：超炼沿链递归，时薪也可能更高（chainWin 计数）
 * 附：正典收入公式 = count × rate × price（calculator/index.ts income getter），
 * superAlchemy/alchemyChain/enhance/workflow 五处一致，勿"修复"成漏乘 rate。
 * 运行：npx vitest run tests/repro-b13-caliber.test.ts
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
  const { CoinifyCalculator, DecomposeCalculator, TransmuteCalculator } = await import("@/calculator/alchemy")
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

  return { getLeaderboardDataApi, computeSuperAlchemy, CoinifyCalculator, DecomposeCalculator, TransmuteCalculator, SELL_TAX_FACTOR }
}

it("首页单步炼金 vs 超炼链式：口径对拍", async () => {
  const { getLeaderboardDataApi, computeSuperAlchemy, CoinifyCalculator, DecomposeCalculator, TransmuteCalculator, SELL_TAX_FACTOR } = await boot()

  const home = (await getLeaderboardDataApi({ includeTax: true, includeRare: true, fullList: true } as any)).list as any[]
  const homeAlc = home.filter(c => c instanceof TransmuteCalculator || c instanceof DecomposeCalculator || c instanceof CoinifyCalculator)
  const homeBest = new Map<string, number>()
  const homePerItemBest = new Map<string, number>()
  const homeCombo = new Map<string, number>()
  for (const c of homeAlc) {
    if (!Number.isFinite(c.result?.profitPH) || c.result.profitPH < 0) continue
    const key = c.result.hrid
    homeBest.set(key, Math.max(homeBest.get(key) ?? -Infinity, c.result.profitPH))
    const combo = `${key}|${c.constructor.name}|${c.catalystRank ?? 0}`
    homeCombo.set(combo, c.result.profitPH)
    // 首页行利润 = 每次动作；主原料每动作消耗 mainCount 个（茶叶类分解 bulk=2）→ 每件利润 = PP / mainCount
    const mainCount = (c as any).ingredientListWithPrice?.[0]?.count ?? 1
    const perItem = c.result.profitPP / mainCount
    homePerItemBest.set(key, Math.max(homePerItemBest.get(key) ?? -Infinity, perItem))
  }

  const superRows = computeSuperAlchemy({ catalystRanks: [0, 1, 2], sellTaxFactor: SELL_TAX_FACTOR, mode: "smart", includeRare: true })

  const TOL = 0.005 // 0.5% 相对容差
  const report: any[] = []
  let match = 0
  let chainWin = 0
  let criterionDiff = 0
  let trueBug = 0
  let noHome = 0
  for (const row of superRows) {
    const key = row.item.hrid
    const sPH = row.profitPH
    if (!Number.isFinite(sPH)) continue
    const hb = homeBest.get(key)
    if (hb == null || hb <= 0) {
      noHome++
      continue
    }
    const rel = (sPH - hb) / Math.abs(hb)
    if (Math.abs(rel) <= TOL) {
      match++
      continue
    }
    if (rel > 0) {
      chainWin++
      continue
    }
    // 时薪更低：区分"选优准则/单位差异（每件更赚）"与"真口径错误（每件也更少）"
    const homePerItem = homePerItemBest.get(key) ?? null
    if (homePerItem != null && row.profit >= homePerItem - Math.max(1e-6, Math.abs(homePerItem) * TOL)) {
      criterionDiff++
    } else {
      trueBug++
      report.push({
        hrid: key.replace("/items/", ""),
        homeBestPH: Math.round(hb),
        superPH: Math.round(sPH),
        homePerItem: homePerItem == null ? "-" : Number(homePerItem.toFixed(2)),
        superPerItem: Number(row.profit.toFixed(2)),
        gapPct: (rel * 100).toFixed(1),
        ask: row.ask,
        mainPath: row.eval.mainPath.slice(0, 4).join("→")
      })
    }
  }
  report.sort((a, b) => Math.abs(a.gapPct) - Math.abs(b.gapPct)).reverse()

  console.log(`超炼行数=${superRows.length} 首页炼金可比=${homeBest.size}`)
  console.log(`时薪一致=${match} 时薪更优(链)=${chainWin} 准则差异(每件更赚,时薪更低)=${criterionDiff} 真口径错误=${trueBug} 首页无可比=${noHome}`)
  console.table(report.slice(0, 25))

  // 诊断样例（保留一个可复算的对照：单位归一后超炼每件 ≥ 首页每件）
  {
    const leaf = "emp_tea_leaf"
    const homeRow = homeAlc.find(c => c.result.hrid === `/items/${leaf}` && c.result.profitPH > 0)
    const s = superRows.find(r => r.item.hrid === `/items/${leaf}`)
    if (homeRow && s) {
      const mainCount = (homeRow as any).ingredientListWithPrice?.[0]?.count ?? 1
      console.log(`[样例] ${leaf}: 首页PP=${homeRow.result.profitPP.toFixed(2)}/动作(主原料×${mainCount}) → 每件=${(homeRow.result.profitPP / mainCount).toFixed(2)}；超炼每件=${s.profit.toFixed(2)}`)
    }
  }

  // 期望：每件口径下超炼选优不输首页单步；时薪差异属于单位/选优准则（已在 UI 说明）
  expect(trueBug).toBe(0)
}, 180000)
