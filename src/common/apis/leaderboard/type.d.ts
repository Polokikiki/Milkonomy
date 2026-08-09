import type { Sort } from "element-plus"
import type Calculator from "@/calculator"

export interface RequestData {
  /** 当前页码 */
  currentPage: number
  /** 查询条数 */
  size: number
  /** 查询参数：名称 */
  name?: string
  /** 查询参数：项目 */
  project?: string
  /** 查询参数：利润率% */
  profitRate?: number
  /** 查询参数：排除装备 */
  banEquipment?: boolean
  /** 查询参数：排除护符(charm) */
  banCharm?: boolean
  /** 是否计算市场卖出税率(2%)；默认 true */
  includeTax?: boolean
  /** 多步产量修正：开启后多步工作流按跨步用料平衡重新分配工时 */
  crossStepBalance?: boolean
  enhanposer?: boolean
  sort?: Sort
  actionLevel?: number
  maxItemLevel?: number
  minVolume1h?: number
  maxVolume1h?: number
  /** 逐级制作：材质链 key（裁缝分皮/布） */
  tierChainKey?: string
  /** 起始材质档位（itemLevel） */
  startTierLevel?: number | string
  /** 逐级制作终点档位（itemLevel） */
  endTierLevel?: number | string
  /** 纯净火车：仅显示名称匹配当前材质链的产物 */
  pureOnly?: boolean
}

export type ResponseData = ApiResponseData<{
  list: LeaderboardData[]
  total: number
}>

export interface LeaderboardData {
  calculator: Calculator
  // todo
  calculatorList?: Calculator[]
  resultList?: any[]
  workMultiplier?: number[]

  hrid: string
  name: string
  project: string
  successRate: number
  costPH: number
  consumePH: number
  gainPH: number
  incomePH: number
  profitPH: number
  profitRate: number

  costPHFormat: string
  incomePHFormat: string
  profitPHFormat: string
  profitPDFormat: string
  profitRateFormat: string
  efficiencyFormat: string
  timeCostFormat: string
  successRateFormat: string

}
