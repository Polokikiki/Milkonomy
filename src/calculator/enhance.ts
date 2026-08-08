import type { CalculatorConfig, Ingredient, IngredientWithPrice, Product } from "."
import * as Format from "@@/utils/format"
import * as math from "mathjs"
import { getEnhancelateCache, getEnhancementExp, getEnhanceTimeCost, getEnhancingEssenceDropTable, getEnhancingRareDropTable, getGameDataApi, getItemDetailOf, getPriceOf, setEnhancelateCache } from "@/common/apis/game"
import { getBuffOf, getEnhanceSuccessRatio, getTeaIngredientList } from "@/common/apis/player"
import { getTrans } from "@/locales"
import Calculator from "."
import { DecomposeCalculator } from "./alchemy"

export interface EnhancelateResult {
  actions: number
  protects: number
  targetRate: number
  leapRate: number
  escapeRate: number
  exp: number
}
export interface EnhanceCalculatorConfig extends CalculatorConfig {
  originLevel?: number
  escapeLevel?: number
  protectLevel: number
}

export interface PhilosopherEnhanceFlowConfig {
  hrid: string
  targetLevel: number
  protectLevel: number
  philosopherProtectLevel: number
  useBlessedInPhilosopher?: boolean
}

export interface PhilosopherEnhanceFlowStep {
  level: number
  mode: "normal" | "philosopher"
  actions: number
  secondaryInputCount: number
  protectionCount: number
}

export interface PhilosopherEnhanceFlowResult {
  actionsByLevel: number[]
  baseItemCount: number
  mirrorCount: number
  protectionCount: number
  totalActions: number
  steps: PhilosopherEnhanceFlowStep[]
}

function addProducedValue(
  matrix: math.Matrix,
  targetLevel: number,
  rowLevel: number,
  colLevel: number,
  value: number
) {
  if (value === 0) return
  if (rowLevel >= targetLevel) {
    matrix.set([targetLevel - 1, colLevel], matrix.get([targetLevel - 1, colLevel]) + value)
    return
  }
  if (rowLevel <= 0) {
    return
  }
  matrix.set([rowLevel - 1, colLevel], matrix.get([rowLevel - 1, colLevel]) + value)
}

export function calculatePhilosopherEnhanceFlow(config: PhilosopherEnhanceFlowConfig): PhilosopherEnhanceFlowResult | null {
  const { hrid, targetLevel, protectLevel, philosopherProtectLevel } = config
  if (targetLevel <= 1 || philosopherProtectLevel < 1 || philosopherProtectLevel >= targetLevel) {
    return null
  }

  const item = getItemDetailOf(hrid)
  const blessedNormal = getBuffOf("enhancing", "Blessed")
  const blessedPhilosopher = config.useBlessedInPhilosopher === false ? 0 : blessedNormal
  const successRateTable = getGameDataApi().enhancementLevelSuccessRateTable
  const actionCount = targetLevel
  const matrix = math.matrix(math.zeros(targetLevel, actionCount))
  const rhs = math.matrix(math.zeros(targetLevel, 1))
  rhs.set([targetLevel - 1, 0], 1)

  for (let j = 0; j < actionCount; j++) {
    const usePhilosopher = j >= philosopherProtectLevel
    const successRate = Math.min(1, successRateTable[j] * (1 + getEnhanceSuccessRatio(item)))

    if (j > 0) {
      matrix.set([j - 1, j], matrix.get([j - 1, j]) - 1)
    }

    if (usePhilosopher) {
      if (j - 1 > 0) {
        matrix.set([j - 2, j], matrix.get([j - 2, j]) - 1)
      }
      addProducedValue(matrix, targetLevel, j + 1, j, j + 1 < targetLevel ? 1 - blessedPhilosopher : 1)
      if (j + 1 < targetLevel) {
        addProducedValue(matrix, targetLevel, j + 2, j, blessedPhilosopher)
      }
      continue
    }

    const levelUpRate = successRate * (1 - blessedNormal)
    const levelLeapRate = successRate * blessedNormal
    const failRate = 1 - successRate

    addProducedValue(matrix, targetLevel, j + 1, j, levelUpRate)
    if (j + 1 < targetLevel) {
      addProducedValue(matrix, targetLevel, j + 2, j, levelLeapRate)
    }

    const failLevel = j >= protectLevel ? j - 1 : 0
    if (failLevel > 0) {
      matrix.set([failLevel - 1, j], matrix.get([failLevel - 1, j]) + failRate)
    }
  }

  let solved: math.MathType
  try {
    solved = math.lusolve(matrix, rhs)
  } catch {
    return null
  }

  const actionsByLevel = Array.from({ length: actionCount }, (_, index) => {
    const value = Number((solved as math.Matrix).get([index, 0]))
    return Math.abs(value) < 1e-10 ? 0 : value
  })

  if (actionsByLevel.some(value => !Number.isFinite(value) || value < -1e-8)) {
    return null
  }

  let baseItemCount = actionsByLevel[0] || 0
  let mirrorCount = 0
  let protectionCount = 0
  let baseInflows = 0
  const steps: PhilosopherEnhanceFlowStep[] = []

  for (let j = 0; j < actionCount; j++) {
    const actions = actionsByLevel[j] || 0
    if (actions <= 1e-10) continue

    const usePhilosopher = j >= philosopherProtectLevel
    if (usePhilosopher) {
      mirrorCount += actions
      if (j === 1) {
        baseItemCount += actions
      }
      steps.push({
        level: j,
        mode: "philosopher",
        actions,
        secondaryInputCount: actions,
        protectionCount: 0
      })
      continue
    }

    const successRate = Math.min(1, successRateTable[j] * (1 + getEnhanceSuccessRatio(item)))
    const failRate = 1 - successRate
    if (j >= protectLevel) {
      protectionCount += actions * failRate
    } else {
      baseInflows += actions * failRate
    }
    steps.push({
      level: j,
      mode: "normal",
      actions,
      secondaryInputCount: 0,
      protectionCount: j >= protectLevel ? actions * failRate : 0
    })
  }

  baseItemCount -= baseInflows
  if (Math.abs(baseItemCount) < 1e-10) {
    baseItemCount = 0
  }

  return {
    actionsByLevel,
    baseItemCount,
    mirrorCount,
    protectionCount,
    totalActions: actionsByLevel.reduce((sum, value) => sum + value, 0),
    steps
  }
}
/**
 * 强化+分解
 */
export class EnhanceCalculator extends Calculator {
  get className() {
    return "EnhanceCalculator"
  }

  protectLevel: number
  originLevel: number
  escapeLevel: number
  protectionItem: IngredientWithPrice
  constructor(config: EnhanceCalculatorConfig) {
    super({ project: `${getTrans("强化")}+${config.enhanceLevel}`, action: "enhancing", ...config })
    this.enhanceLevel = config.enhanceLevel!
    this.protectLevel = config.protectLevel
    this.originLevel = config.originLevel ?? 0
    this.escapeLevel = config.escapeLevel ?? -1
    let protectionList = [{
      hrid: super.item.hrid,
      count: 1,
      marketPrice: getPriceOf(super.item.hrid).ask
    }]
    if (super.item.protectionItemHrids) {
      protectionList = super.item.protectionItemHrids!.map(hrid => ({
        hrid,
        count: 1,
        marketPrice: getPriceOf(hrid).ask
      }))
    }
    const list = super.handlePrice(
      protectionList.concat([{
        hrid: "/items/mirror_of_protection",
        count: 1,
        marketPrice: getPriceOf("/items/mirror_of_protection").ask
      }]),
      [],
      "ask"
    )
    this.protectionItem = list.reduce((min, item) => {
      if (min.price === -1) {
        return item
      }
      if (item.price === -1) {
        return min
      }
      return (item.price < min.price) ? item : min
    }, list[0])
  }

  get timeCost() {
    return getEnhanceTimeCost() / this.speed
  }

  get speed() {
    return super.speed + Math.max(0, this.playerLevel - this.actionLevel) * 0.01
  }

  get efficiency() {
    return 1
  }

  _ingredientList?: Ingredient[]
  get ingredientList(): Ingredient[] {
    if (!this._ingredientList) {
      // 为了与Calculator的设计理念一致，这里需要将成本和收益转换为单次成本和单次收益
      const { actions, protects } = this.enhancelate()
      this._ingredientList = [
        // 本体
        {
          hrid: this.item.hrid,
          count: 1 / actions,
          marketPrice: getPriceOf(this.item.hrid, this.originLevel).ask,
          level: this.originLevel
        },
        // 垫子
        {
          hrid: this.protectionItem.hrid,
          count: protects / actions,
          marketPrice: this.protectionItem.marketPrice
        }
      ].concat(
        // 强化材料
        this.item.enhancementCosts!.map(item => ({
          hrid: item.itemHrid,
          count: item.count,
          marketPrice: getPriceOf(item.itemHrid).ask
        }))
      )

      this._ingredientList = this._ingredientList.concat(getTeaIngredientList(this))
    }
    return this._ingredientList
  }

  _targetRate?: number
  get targetRate() {
    return this._targetRate
  }

  _productList?: Product[]
  get productList(): Product[] {
    if (!this._productList) {
      // 为了与Calculator的设计理念一致，这里需要将成本和收益转换为单次成本和单次收益
      const { actions, escapeRate, targetRate, leapRate } = this.enhancelate()
      // 暂不计算最终祝福茶狗叫的额外收益
      const successRate = targetRate + leapRate
      this._targetRate = successRate

      this._productList = [
      // 强化后的本体
        {
          hrid: this.item.hrid,
          count: 1 / actions * successRate,
          marketPrice: getPriceOf(this.item.hrid, this.enhanceLevel).bid,
          level: this.enhanceLevel
        }
      ]

      // 如果有逃逸可能，则加上逃逸的收益
      if (escapeRate > 0) {
        this._productList.push({
          hrid: this.item.hrid,
          count: 1 / actions * escapeRate,
          marketPrice: getPriceOf(this.item.hrid, this.realEscapeLevel).bid,
          level: this.realEscapeLevel
        })
      }

      this._productList = this._productList.concat(getEnhancingRareDropTable(this.item, getEnhanceTimeCost()).map(drop => ({
        hrid: drop.itemHrid,
        rate: drop.dropRate * (1 + this.rareRatio),
        count: (drop.minCount + drop.maxCount) / 2,
        marketPrice: getPriceOf(drop.itemHrid).bid
      }))).concat(getEnhancingEssenceDropTable(this.item, getEnhanceTimeCost()).map(drop => ({
        hrid: drop.itemHrid,
        count: (drop.minCount + drop.maxCount) / 2,
        rate: drop.dropRate * (1 + this.essenceRatio),
        marketPrice: getPriceOf(drop.itemHrid).bid
      })))
    }
    return this._productList
  }

  get profitable(): boolean {
    return !!this.item.enhancementCosts && this.maxProfitApproximate > 0
  }

  get available(): boolean {
    return !!this.item.enhancementCosts
      && this.originLevel < this.enhanceLevel
      && this.escapeLevel < this.originLevel
      && this.protectLevel <= this.enhanceLevel
  }

  get isEnhance(): boolean {
    return !!this.item.enhancementCosts
  }

  get actionLevel(): number {
    return this.item.itemLevel
  }

  get exp(): number {
    const { exp, actions } = this.enhancelate()
    const totalExp = exp * (1 + getBuffOf(this.action, "Experience"))
    return totalExp / actions
  }

  run() {
    super.run()
    // 0->1 的成功率显示出来
    const successRate = this.successRateEnhance(getGameDataApi().enhancementLevelSuccessRateTable[0])
    this.result.successRate = successRate
    this.result.successRateFormat = Format.percent(successRate)
    this.result.targetRateFormat = Format.percent(this.targetRate!)
    return this
  }

  get realEscapeLevel() {
    if (this.escapeLevel === -1) {
      return -1
    }
    /**
     * 当保护等级大于等于逃逸等级+1时
     * 如果此时装备低于保护等级，则失败会掉到0级，不会在逃逸等级逃逸
     */
    return this.protectLevel > this.escapeLevel + 1 ? 0 : this.escapeLevel
  }

  // #region 项目特有属性

  /**
   * 预估强化->分解最大利润
   * 最大利润小于0时，不可用
   */
  _maxProfitApproximate?: number
  get maxProfitApproximate() {
    if (this._maxProfitApproximate !== undefined) {
      return this._maxProfitApproximate
    }
    // 遍历全部催化剂 (0=基础 1=普通 2=主要)，任一种能盈利即通过预筛选
    let best = -1
    for (let rank = 2; rank >= 0; rank--) {
      const d = new DecomposeCalculator({
        hrid: this.item.hrid,
        catalystRank: rank,
        enhanceLevel: this.enhanceLevel
      })
      if (!d.available) continue

      const { actions } = this.enhancelate()
      const cost = this.ingredientListWithPrice.reduce((acc, item) => acc + item.price * item.count * actions, 0)
      const income = this.productListWithPrice.slice(1).reduce((acc, item) => acc + item.price * item.count * actions * (item.rate || 1), 0)
      const decIncome = d.successRate * d.productListWithPrice.reduce((acc, item) => acc + item.price * item.count * (item.rate || 1), 0)
      const decCost = d.ingredientListWithPrice.slice(1).reduce((acc, item) => acc + item.price * item.count, 0)
      const v = (decIncome * (this._targetRate || 1) + income) * 0.98 - cost - decCost * (this._targetRate || 1)
      if (v > best) best = v
    }
    this._maxProfitApproximate = best
    return this._maxProfitApproximate
  }

  /**
   * 用马尔科夫链计算从originLevel级强化到目标等级的期望次数
   * 其中protectLevel表示从几级开始保护，如果使用保护道具，则失败只会下降1级，否则会下降到0级
   * escapeLevel表示降到几级就逃跑，逃跑后不会再强化
   */
  enhancelate(): EnhancelateResult {
    let result = getEnhancelateCache({
      enhanceLevel: this.enhanceLevel,
      protectLevel: this.protectLevel,
      itemLevel: this.item.itemLevel,
      originLevel: this.originLevel,
      escapeLevel: this.escapeLevel
    })
    if (result) {
      return result
    }


    const targetLevel = this.enhanceLevel
    const successRateTable = getGameDataApi().enhancementLevelSuccessRateTable

    const offset = this.escapeLevel + 1
    const size = targetLevel - offset

    // 构造targetLevel x targetLevel的0矩阵
    let stMatrix = math.matrix(math.zeros(targetLevel, targetLevel))
    // 在此基础上构造转移矩阵 P
    for (let i = 0; i < targetLevel; i++) {
      if (i < targetLevel - 1) {
        stMatrix.set([i, i + 1], this.levelUpRate(successRateTable[i]))
      }
      if (i < targetLevel - 2) {
        stMatrix.set([i, i + 2], this.levelLeapRate(successRateTable[i]))
      }
      stMatrix.set([i, i >= this.protectLevel ? i - 1 : 0], this.failRate(successRateTable[i]))
    }

    // 删除 stMatrix 的前 escapeLevel+1 行和列
    stMatrix = math.subset(stMatrix, math.index(math.range(offset, targetLevel), math.range(offset, targetLevel)))

    // 计算所有level到targetLevel的期望 = (I - P)^-1 * 1
    const inv = math.inv(math.subtract(math.identity(size), stMatrix)) as math.Matrix
    const all = math.multiply(inv, math.ones(size, 1)) as math.Matrix

    // console.log("inv", inv)
    // console.log("all", all)

    // 计算从protectLevel级开始使用垫子的期望
    let protectVector = math.zeros(targetLevel, 1) as math.Matrix
    for (let i = this.protectLevel; i < targetLevel; i++) {
      protectVector.set([i, 0], this.failRate(successRateTable[i]))
    }

    protectVector = math.subset(protectVector, math.index(math.range(offset, targetLevel), 0))

    let expVector = math.zeros(targetLevel, 1) as math.Matrix
    for (let i = 0; i < targetLevel; i++) {
      expVector.set([i, 0], (this.successRateEnhance(successRateTable[i]) + 0.1 * (1 - this.successRateEnhance(successRateTable[i]))) * getEnhancementExp(this.item, i))
    }

    expVector = math.subset(expVector, math.index(math.range(offset, targetLevel), 0))

    const allExp = math.multiply(inv, expVector) as math.Matrix
    const exp = allExp.get([this.originLevel - offset, 0])

    const allMat = math.multiply(inv, protectVector) as math.Matrix
    const actions = all.get([this.originLevel - offset, 0])
    const protects = allMat.get([this.originLevel - offset, 0])
    const targetRate = this.levelLeapRate(successRateTable[targetLevel - 2]) * (size > 1 ? inv.get([this.originLevel - offset, size - 2]) : 0)
      + +this.levelUpRate(successRateTable[targetLevel - 1]) * inv.get([this.originLevel - offset, size - 1])
    const leapRate = this.levelLeapRate(successRateTable[targetLevel - 1]) * inv.get([this.originLevel - offset, size - 1])
    let escapeRate = 1 - targetRate - leapRate
    // 消除浮点数误差
    escapeRate = Math.abs(escapeRate) < 1e-10 ? 0 : escapeRate

    result = { actions, protects, targetRate, leapRate, escapeRate, exp }
    setEnhancelateCache({
      enhanceLevel: this.enhanceLevel,
      protectLevel: this.protectLevel,
      itemLevel: this.item.itemLevel,
      originLevel: this.originLevel,
      escapeLevel: this.escapeLevel
    }, result)
    return result
  }

  successRateEnhance(rate: number): number {
    return rate * (1 + getEnhanceSuccessRatio(this.item))
  }

  levelUpRate(rate: number): number {
    const successRate = this.successRateEnhance(rate) * (1 - getBuffOf(this.action, "Blessed"))
    return Math.min(1, successRate)
  }

  levelLeapRate(rate: number): number {
    return this.successRateEnhance(rate) * getBuffOf(this.action, "Blessed")
  }

  failRate(rate: number): number {
    return 1 - this.successRateEnhance(rate)
  }

  // #endregion
}
