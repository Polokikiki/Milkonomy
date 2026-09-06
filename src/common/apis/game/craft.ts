import { getActionDetailOf, getPriceOf } from "@/common/apis/game"
import { useGameStoreOutside } from "@/pinia/stores/game"

/** 制造系动作（锻造/制造/裁缝），与强化页 calcBestManufacturePlan 同口径 */
const MANUFACTURE_ACTIONS = ["cheesesmithing", "crafting", "tailoring"] as const

const craftCostCache = new Map<string, number>()

/**
 * 递归估算：有卖单直接用卖单价；无卖单按配方原料逐级自制
 * （无卖单的中间品继续往下递归），深度耗尽仍无法定价返回 -1。
 * 估算口径：忽略茶水补正与工匠折减。
 */
function craftCostRecursive(hrid: string, depth: number): number {
  const ask = getPriceOf(hrid, 0).ask
  if (ask >= 0) return ask
  if (depth <= 0) return -1
  const key = hrid.substring(hrid.lastIndexOf("/") + 1)
  let best = -1
  for (const action of MANUFACTURE_ACTIONS) {
    const ad = getActionDetailOf(`/actions/${action}/${key}`)
    if (!ad) continue
    let cost = 0
    let ok = true
    if (ad.upgradeItemHrid) {
      const p = craftCostRecursive(ad.upgradeItemHrid, depth - 1)
      if (p < 0) {
        ok = false
        break
      }
      cost += p
    }
    for (const input of ad.inputItems) {
      const p = craftCostRecursive(input.itemHrid, depth - 1)
      if (p < 0) {
        ok = false
        break
      }
      cost += p * input.count
    }
    if (ok && (best < 0 || cost < best)) best = cost
  }
  return best
}

/**
 * 无卖单物品的制造成本（有卖单时返回卖单价本身）。
 * 买价侧专用：买不到就自己造，按配方估算。
 * 返回 -1 = 既无卖单也算不出自制成本。
 * 结果按市场数据时间戳缓存，市场刷新自动失效。
 */
export function getCraftCostOf(hrid: string): number {
  const ts = useGameStoreOutside().marketData?.timestamp ?? 0
  const cacheKey = `${ts}|${hrid}`
  const cached = craftCostCache.get(cacheKey)
  if (cached !== undefined) return cached
  const value = craftCostRecursive(hrid, 3)
  craftCostCache.set(cacheKey, value)
  return value
}
