/**
 * 链条自定义配方解析：冲泡茶/咖啡配方回归（2026-10-09 收编 gcaxe 冲泡配方修复）
 *
 * 背景：findProducingActionOf / findConsumingActionsOf 此前把「产物是茶/咖啡类消耗品」的
 * 冲泡配方整体排除（70 条冲泡配方中 64 条产茶/咖啡），冲泡在结点图里找不到生产动作。
 * 修复后茶/咖啡可作为链条产物（茶仍不生成输入连线，成本由计算器自动补正）。
 *
 * 运行：npx vitest run tests/multistep-recipes.test.ts
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
  const { findConsumingActionsOf, findProducingActionOf } = await import("@/pages/multistep/utils/recipes")

  const root = process.cwd()
  const dataJson = JSON.parse(fs.readFileSync(path.join(root, "public/data/data.json"), "utf8"))
  const marketJson = JSON.parse(fs.readFileSync(path.join(root, "public/data/market.json"), "utf8"))

  setActivePinia(pinia)
  const game = useGameStore(pinia)
  game.gameData = dataJson
  await new Promise(resolve => setTimeout(resolve, 50))
  game.marketData = await updateMarketData(null, marketJson, dataJson)
  game.clearAllCaches()

  return { findConsumingActionsOf, findProducingActionOf }
}

it("冲泡产茶/咖啡配方可作为生产与消耗配方被找到", async () => {
  const { findConsumingActionsOf, findProducingActionOf } = await boot()

  // 茶：修复前被 isTeaItem 排除，findProducingActionOf 返回 null
  expect(findProducingActionOf("/items/alchemy_tea")).toBe("/actions/brewing/alchemy_tea")
  // 咖啡：同为冲泡产消耗品
  expect(findProducingActionOf("/items/attack_coffee")).toBe("/actions/brewing/attack_coffee")
  // 非茶产物（茶箱）修复前后都可用，回归保护
  expect(findProducingActionOf("/items/advanced_coffee_crate")).toBe("/actions/brewing/advanced_coffee_crate")

  // 消耗侧：黑茶叶是炼金茶的输入，修复前该冲泡配方不列入下游建议
  const consumers = findConsumingActionsOf("/items/black_tea_leaf")
  expect(consumers.some(c => c.actionHrid === "/actions/brewing/alchemy_tea")).toBe(true)
}, 180000)
