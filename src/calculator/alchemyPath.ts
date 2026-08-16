import type Calculator from "."
import type { ItemDetail } from "~/game"
import { CoinifyCalculator, DecomposeCalculator, TransmuteCalculator } from "@/calculator/alchemy"

export interface AlchemyPathResult {
  item: ItemDetail
  /** 可用的炼金方式，已按每小时利润降序 */
  paths: Calculator[]
}

/** 对比单个物品的炼金方式（转化/分解/点金 × 指定催化剂等级），按每小时利润降序返回可用列表 */
export function compareAlchemyPaths(item: ItemDetail, catalystRanks: number[], sellTaxFactor: number): AlchemyPathResult {
  const paths: Calculator[] = []
  for (const Ctor of [TransmuteCalculator, DecomposeCalculator, CoinifyCalculator]) {
    for (const catalystRank of catalystRanks) {
      try {
        const c = new Ctor({ hrid: item.hrid, catalystRank })
        c.setSellTaxFactor(sellTaxFactor)
        if (!c.available) continue
        c.run()
        if (c.result) paths.push(c)
      } catch {
        // 单个方式计算失败不影响其余方式
      }
    }
  }
  paths.sort((a, b) => (b.result?.profitPH ?? 0) - (a.result?.profitPH ?? 0))
  return { item, paths }
}
