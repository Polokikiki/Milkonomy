import type { Action, ActionDetail, ItemDetail } from "~/game"
import * as Format from "@@/utils/format"
import { getItemDetailOf } from "@/common/apis/game"
import { getBuffOf, getPlayerLevelOf } from "@/common/apis/player"
import { getManualPriceOf } from "@/common/apis/price"
import { SELL_TAX_FACTOR } from "@/common/constants/market"
import { getTrans } from "@/locales"
import { COIN_HRID } from "@/pinia/stores/game"

export const MIN_ACTION_TIME_COST = 3 * 1000000000

export interface CalculatorConfig {
  hrid: string
  project?: string
  action?: Action
  ingredientPriceConfigList?: IngredientPriceConfig[]
  productPriceConfigList?: ProductPriceConfig[]
  /** 催化剂 1普通 2主要催化剂 */
  catalystRank?: number
  enhanceLevel?: number
  originLevel?: number
  /** 市场卖出税率因子：默认 0.98(2%税)；设为 1 表示不计税 */
  sellTaxFactor?: number
}
export default abstract class Calculator {
  hrid: string
  project: string
  action: Action
  /** 此价格配置优先级大于自定义价格 */
  ingredientPriceConfigList: IngredientPriceConfig[]
  /** 此价格配置优先级大于自定义价格 */
  productPriceConfigList: ProductPriceConfig[]
  /** 催化剂 1普通 2主要催化剂 */
  catalystRank?: number
  result: any
  favorite?: boolean
  hasManualPrice: boolean = false
  config: CalculatorConfig
  enhanceLevel: number = 0
  /** 市场卖出税率因子：默认 0.98(2%税)；设为 1 表示不计税 */
  sellTaxFactor: number = SELL_TAX_FACTOR
  constructor(config: CalculatorConfig) {
    const { hrid, project, action, ingredientPriceConfigList = [], productPriceConfigList = [], catalystRank } = config
    this.config = config
    this.hrid = hrid
    this.project = project!
    this.action = action!
    this.ingredientPriceConfigList = ingredientPriceConfigList
    this.productPriceConfigList = productPriceConfigList
    this.catalystRank = catalystRank
    if (typeof config.sellTaxFactor === "number") {
      this.sellTaxFactor = config.sellTaxFactor
    }
  }

  setSellTaxFactor(factor: number) {
    this.sellTaxFactor = factor
    return this
  }

  // #region 固定继承属性

  _item?: ItemDetail
  get item() {
    if (!this._item) {
      this._item = getItemDetailOf(this.hrid)
    }
    return this._item
  }

  get id(): string {
    return `${this.hrid}-${this.project}-${this.action}`
  }

  _key?: string
  get key() {
    if (!this._key) {
      this._key = this.item.hrid.substring(this.item.hrid.lastIndexOf("/") + 1)
    }
    return this._key
  }

  get efficiency(): number {
    return 1 + Math.max(0, (this.playerLevel - this.actionLevel) * 0.01) + getBuffOf(this.action, "Efficiency")
  }

  get speed(): number {
    return 1 + getBuffOf(this.action, "Speed")
  }

  get isEquipment(): boolean {
    return this.item.categoryHrid === "/item_categories/equipment"
  }

  handlePrice(list: Ingredient[], priceConfigList: IngredientPriceConfig[], type: "ask" | "bid") {
    const result = []
    for (let i = 0; i < list.length; i++) {
      const item = list[i]
      const priceConfig = priceConfigList[i]
      const hasManualPrice = getManualPriceOf(item.hrid, item.level)?.[type]?.manual
      const manualPrice = getManualPriceOf(item.hrid, item.level)?.[type]?.manualPrice
      if (!priceConfig?.immutable && hasManualPrice) {
        this.hasManualPrice = true
      }
      const price = priceConfig?.immutable ? priceConfig.price! : hasManualPrice ? manualPrice! : item.marketPrice
      result.push(Object.assign(item, { price }))
    }
    return result
  }

  _ingredientListWithPrice?: IngredientWithPrice[]
  get ingredientListWithPrice(): IngredientWithPrice[] {
    if (!this._ingredientListWithPrice) {
      const list = this.ingredientList.map((item) => {
        return {
          ...item,
          countPH: item.count * this.consumePH,
          counterCountPH: item.counterCount ? item.counterCount * this.consumePH : undefined
        }
      })

      this._ingredientListWithPrice = this.handlePrice(list, this.ingredientPriceConfigList, "ask")
    }

    return this._ingredientListWithPrice
  }

  _productListWithPrice?: ProductWithPrice[]
  get productListWithPrice(): ProductWithPrice[] {
    if (!this._productListWithPrice) {
      const list = this.productList.map((item) => {
        return {
          ...item,
          countPH: item.count * this.gainPH * (item.rate || 1),
          counterCountPH: item.counterCount ? item.counterCount * this.gainPH * (item.rate || 1) : undefined
        }
      })
      this._productListWithPrice = this.handlePrice(list, this.productPriceConfigList, "bid")
    }
    return this._productListWithPrice
  }

  /**
   * 单次成本
   * - 原料+消耗硬币
   * - 不包括一切 buff
   */
  get cost(): number {
    return this.ingredientListWithPrice.reduce((acc, ingredient) => {
      return acc + ingredient.count * ingredient.price
    }, 0)
  }

  /** 本体之外的消耗，一般仅用于强化 */
  get cost4Mat(): number {
    // 从第2个原料开始计算
    return this.ingredientListWithPrice.slice(1).reduce((acc, ingredient) => {
      return acc + ingredient.count * ingredient.price
    }, 0)
  }

  /**
   * 装备逃逸造成的资产折损，一般仅用于强化
   * 实际意义代表强化一直不成功的情况下的损失速度
   * 算法可简化为：总成本-100%逃逸概率时的总产出?
   * 具体公式如下：
   * 逃逸:   xAi + M = yAn + zAj   ······ ①
   * 损耗:   M + x(Ai - Aj)        ······ ②
   *
   * 不逃逸: xAi + M = xAn         ······ ③
   * 损耗:   M + x(Ai - A0)
   *      ≈ M                     ······ ④ 推导详见下文
   * 其中A为装备价值，i为初始等级, n为目标等级, j为逃逸等级,
   *    M为单位时间材料消耗，x为单位时间装备消耗数量，y为单位时间成功数量，z为单位时间逃逸数量
   * 由此可见，③是①式在 z = 0, j = 0, x = y 时的特例
   * 可推导以下特殊情况：
   * 当i = 0时，损耗 = M + x(A0-A0) = M，A0相互抵消，此为普通强化
   * 当i ≠ 0 且不逃逸时, 损耗 = M + x(Ai - A0)，此为逃逸强化 逃逸等级为-1的情况
   *    此情况需要特殊讨论，因为③式中不存在A0的价值，也无法将其消元
   *    为了简化计算，可以认为A0和Ai的价值差距很小，否则不如直接从A0开始强化
   *    所以此种情况简化为 损耗 = M
   * 将所有不逃逸的情况统一简化为 损耗 = M
   *
   * 其他情况皆为逃逸强化，符合①式
   *
   * 如果考虑继承，将①式扩展为:
   * xak + M1 = x1Ai + x2A_i+1
   * x1Ai + M2 = y1An + z1Aj
   * x2A_i+1 + M3 = y2An + z2Aj
   * 其中 a为继承前的装备价值, k为继承前的装备等级, M1为继承消耗, 其他符号含义同上
   * 上述三式相加
   * => xak + M1 + M2 + M3 = (y1+y2)An + (z1+z2)Aj
   * => xak + M = yAn + zAj
   * => 损耗 = M + x(ak - Aj)       ······ ⑤
   * 类推可得不逃逸的特例为:
   * => 损耗 = M + x(ak - A0)
   *        = M + x(ak - a0+M1/x)
   *        = M + x(ak - a0) - M1
   *        = M2 + M3 + x(ak - a0)
   *        ≈ M2 + M3               ······ ⑥ 参考④式
   *
   * 大一统公式推导如下:
   * 根据②和④:
   * 非继承时,
   * 损耗 = M + xAi - xAj 或 M
   *     = Mall - xAj 或 Mall - xAi
   * 其中 Mall 为单位时间总成本
   * 继承时,根据⑤和⑥式,
   * 损耗 = M + x(ak - Aj) 或 M2 + M3
   *     = Mall - xAj 或 M2 + M3
   */
  get gainEscapePH(): number {
    const item = this.ingredientListWithPrice[0]
    const escape = this.productListWithPrice[1]
    if (!item) return 0
    if (!escape || escape.hrid !== item.hrid) {
      // 不逃逸时，等价于逃逸到初始装备
      return item.countPH! * item.price
    }
    return item.countPH! * escape.price * this.sellTaxFactor
  }

  /**
   * 单次成功行动的收益
   * - 不包括一切 buff
   */
  get income(): number {
    const income = this.productListWithPrice.reduce((acc, product) => {
      // 硬币不收税：通过“先除后乘”抵消税因子
      const coinRate = product.hrid === COIN_HRID ? this.sellTaxFactor : 1
      return acc + product.count * (product.rate || 1) * product.price / coinRate
    }, 0)
    return income * this.sellTaxFactor
  }

  _actionsPH?: number
  get actionsPH(): number {
    if (this._actionsPH === undefined) {
      this._actionsPH = ((60 * 60 * 1000000000) / this.effectiveTimeCost) * this.efficiency
    }
    return this._actionsPH
  }

  _consumePH?: number
  get consumePH(): number {
    if (this._consumePH === undefined) {
      this._consumePH = this.actionsPH
    }
    return this._consumePH
  }

  _gainPH?: number
  get gainPH(): number {
    if (this._gainPH === undefined) {
      this._gainPH = this.actionsPH * this.successRate
    }
    return this._gainPH
  }

  /**
   * 收益是否有效
   */
  get valid(): boolean {
    for (const ingredient of this.ingredientListWithPrice) {
      if (ingredient.price === -1) {
        return false
      }
    }
    return true
  }

  get actionItem(): ActionDetail | undefined {
    return undefined
  }

  get calculator() {
    return this as Calculator
  }

  /**
   * 单次动作经验
   */
  get exp(): number {
    return (this.actionItem?.experienceGain?.value || 0) * (1 + getBuffOf(this.action, "Experience"))
  }

  run() {
    const expPH = this.exp * this.actionsPH
    const costPH = this.cost * this.consumePH
    const cost4MatPH = this.cost4Mat * this.consumePH
    const incomePH = this.income * this.gainPH
    let profitPH = incomePH - costPH
    // 单次利润
    const profitPP = profitPH / this.actionsPH
    let profitRate = costPH ? profitPH / costPH : 0

    if (!this.valid) {
      profitPH = -1 / 24
      profitRate = -1
    }

    const cost4EnhancePH = costPH - this.gainEscapePH

    const risk = cost4EnhancePH / profitPH

    this.result = {
      hrid: this.item.hrid,
      name: getTrans(this.item.name),
      project: this.project,
      successRate: this.successRate,
      costPH,
      cost4MatPH,
      consumePH: this.consumePH,
      gainPH: this.gainPH,
      incomePH,
      profitPH,
      profitRate,
      costPHFormat: Format.money(costPH),
      cost4MatPHFormat: Format.money(cost4MatPH),
      incomePHFormat: Format.money(incomePH),
      profitPHFormat: Format.money(profitPH),
      profitPDFormat: Format.money(profitPH * 24),
      profitPP,
      profitPPFormat: Format.money(profitPP),
      profitRateFormat: Format.percent(profitRate),
      efficiencyFormat: Format.percent(this.efficiency - 1),
      speedFormat: Format.percent(this.speed - 1),
      timeCostFormat: Format.costTime(this.effectiveTimeCost),
      successRateFormat: Format.percent(this.successRate),
      expPH,
      expPHFormat: Format.money(expPH),
      cost4EnhancePHFormat: Format.money(cost4EnhancePH),
      risk,
      riskFormat: Format.number(risk, 2)
    }
    return this
  }
  // #endregion

  // #region 用户配置属性
  get playerLevel(): number {
    return getPlayerLevelOf(this.action)
  }

  get essenceRatio(): number {
    return getBuffOf(this.action, "EssenceFind") || 0
  }

  get rareRatio(): number {
    return getBuffOf(this.action, "RareFind") || 0
  }

  // #endregion

  // #region 子类override属性

  abstract get timeCost(): number

  get effectiveTimeCost(): number {
    return Math.max(this.timeCost, MIN_ACTION_TIME_COST)
  }

  /**
   * 单次消耗的原料 + 硬币列表
   */
  abstract get ingredientList(): Ingredient[]

  /**
   * 单次成功行动的收益列表
   */
  abstract get productList(): Product[]

  get successRate(): number {
    return 1
  }

  /**
   * 数据是否可用
   */
  abstract get available(): boolean

  abstract get actionLevel(): number

  abstract get className(): string
  // #endregion
}

export interface Ingredient {
  hrid: string
  /** 原料产物抵消后的数量 */
  count: number
  /** 原料产物抵消的数量 */
  counterCount?: number
  marketPrice: number
  marketTime?: number
  /** 等级 */
  level?: number
}
export interface IngredientWithPrice extends Ingredient {
  /** 原料产物抵消后的数量 */
  countPH?: number
  /** 原料产物抵消的数量 */
  counterCountPH?: number
  price: number
}
export interface Product extends Ingredient {
  rate?: number
}
export interface ProductWithPrice extends Product, IngredientWithPrice {
}

export interface IngredientPriceConfig {
  hrid: string
  manual?: boolean
  immutable?: boolean
  price?: number
}
export interface ProductPriceConfig extends IngredientPriceConfig {}
