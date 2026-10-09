/** 一次性生成器：从首页利润榜挑高利润炼金单步，生成「读取配方」预置方案 JSON。跑完即删。 */
import * as fs from "node:fs"
import * as path from "node:path"
import { it } from "vitest"

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
  const { CoinifyCalculator, DecomposeCalculator, TransmuteCalculator } = await import("@/calculator/alchemy")
  const { resolveRecipeB } = await import("@/pages/multistep/utils/recipes")
  const { getItemDetailOf } = await import("@/common/apis/game")
  const { getTrans } = await import("@/locales")
  const { getPriceOf } = await import("@/common/apis/game")
  const root = process.cwd()
  const dataJson = JSON.parse(fs.readFileSync(path.join(root, "public/data/data.json"), "utf8"))
  const marketJson = JSON.parse(fs.readFileSync(path.join(root, "public/data/market.json"), "utf8"))
  setActivePinia(pinia)
  const game = useGameStore(pinia)
  game.gameData = dataJson
  await new Promise(resolve => setTimeout(resolve, 50))
  game.marketData = await updateMarketData(null, marketJson, dataJson)
  game.clearAllCaches()
  return { getLeaderboardDataApi, CoinifyCalculator, DecomposeCalculator, TransmuteCalculator, resolveRecipeB, getItemDetailOf, getTrans, getPriceOf }
}

it.skip("gen preset plans（更新预置配方时去掉 .skip 重跑，产物贴回 utils/presetPlans.ts）", async () => {
  const { getLeaderboardDataApi, CoinifyCalculator, DecomposeCalculator, TransmuteCalculator, resolveRecipeB, getItemDetailOf, getTrans, getPriceOf } = await boot()
  const home = (await getLeaderboardDataApi({ includeTax: true, includeRare: true, fullList: true } as any)).list as any[]
  const alc = home.filter(c => c instanceof TransmuteCalculator || c instanceof DecomposeCalculator || c instanceof CoinifyCalculator)
    .filter(c => (c.catalystRank ?? 0) === 0)
    .filter(c => Number.isFinite(c.result?.profitPH) && c.result.profitPH > 0)
    .filter(c => (getPriceOf(c.result.hrid, 0).vol ?? 0) >= 5)
    .filter(c => (getPriceOf(c.result.hrid, 0).ask ?? 0) > 0)
    .sort((a, b) => b.result.profitPH - a.result.profitPH)

  const seen = new Set<string>()
  const picked: any[] = []
  const actionKind = new Map<string, number>()
  for (const c of alc) {
    const key = c.constructor.name
    if ((actionKind.get(key) ?? 0) >= 2) continue
    if (seen.has(c.result.hrid)) continue
    seen.add(c.result.hrid)
    actionKind.set(key, (actionKind.get(key) ?? 0) + 1)
    picked.push(c)
    if (picked.length >= 3) break
  }

  const plans = picked.map((c) => {
    const hrid = c.result.hrid
    const actionKey = c instanceof TransmuteCalculator ? "transmute" : c instanceof DecomposeCalculator ? "decompose" : "coinify"
    const zhName = c.actionKind = getTrans(getItemDetailOf(hrid)?.name ?? hrid)
    const recipe = resolveRecipeB(hrid, actionKey, 0)
    const greens = recipe.outputs.map((out, i) => ({ hrid: out, pin: i === 0 ? "main" : String(i) }))
    const ph = Math.round(c.result.profitPH)
    const zhAction = actionKey === "transmute" ? "转化" : actionKey === "decompose" ? "分解" : "点金"
    return {
      name: `高利润·${zhAction}${zhName}`,
      profitPH: ph,
      rows: [{ uid: 1, hrid, count: 1 }],
      nodes: [
        { id: "red1", kind: "var", varKind: "red", hrid, count: 1, rowUid: 1, obtain: "buy", x: 0, y: 0 },
        { id: "func1", kind: "func", hrid: "", funcClass: "B", mainItemHrid: hrid, actionHrid: `/actions/alchemy/${actionKey}`, catalystRank: 0, x: 0, y: 0 },
        ...greens.map((g, i) => ({ id: `g${i}`, kind: "var", varKind: "green", hrid: g.hrid, createdBy: "func1", x: 0, y: 0 }))
      ],
      wires: [
        { id: "wire1", fromPinId: "red1:out:main", toPinId: "func1:in:main" },
        ...greens.map((g, i) => ({ id: `w${i + 2}`, fromPinId: `func1:out:${g.pin}`, toPinId: `g${i}:in:main` }))
      ]
    }
  })
  console.log("PRESET_PLANS_JSON_BEGIN")
  console.log(JSON.stringify(plans, null, 2))
  console.log("PRESET_PLANS_JSON_END")
}, 180000)
