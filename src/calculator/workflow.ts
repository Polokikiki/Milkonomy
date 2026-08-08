import type { Arrayable } from "unocss"
import type { Ingredient, IngredientWithPrice, Product, ProductWithPrice } from "."
import type { StorageCalculatorItem } from "@/pinia/stores/favorite"
import * as Format from "@@/utils/format"
import { getTrans } from "@/locales"

import Calculator from "."
import { EnhanceCalculator } from "./enhance"
import { getCalculatorInstance } from "./utils"
import { SELL_TAX_FACTOR } from "@/common/constants/market"

export class WorkflowCalculator extends Calculator {
  get ingredientList(): Ingredient[] {
    return []
  }

  get productList(): Product[] {
    return []
  }

  get className(): string {
    return "WorkflowCalculator"
  }

  // 子步骤链相同的 workflow 视为同一个 id，避免不同链在排行榜里因终态相同而互相覆盖
  get id(): string {
    const subKeys = this.configs
      .flat()
      .map(c => `${c.hrid}-${c.project}-${c.action}-${c.catalystRank ?? ""}`)
      .join("|")
    return `wf:${this.project}:${subKeys}`
  }

  get catalyst() {
    return (this.calculatorList[this.calculatorList.length - 1] as any).catalyst
  }

  calculatorList: Arrayable<Calculator>[] = []
  configs: Arrayable<StorageCalculatorItem>[] = []
  /**
   * 是否启用跨步用料平衡：
   * - false（默认）：workMultiplier 仅按相邻阶段产物-消耗匹配，跨步消耗的物料按市场补齐、不占用上游工时
   * - true：workMultiplier 倒推时聚合所有下游阶段对同一 hrid 的消耗，使上游产能匹配全部下游需求
   * 含数组阶段（继承→强化分支）的工作流不支持新算法，会自动回退
   */
  crossStepBalance: boolean = false

  /**
   * configs为工作流顺序排列
   */
  constructor(configs: Arrayable<StorageCalculatorItem>[], project: string, sellTaxFactor: number = 0.98, crossStepBalance: boolean = false) {
    let last = configs[configs.length - 1]
    if (Array.isArray(last)) {
      last = last[0]
    }
    super({
      hrid: last.hrid,
      project,
      action: last.action
    })
    this.setSellTaxFactor(sellTaxFactor)
    this.crossStepBalance = crossStepBalance
    this.configs = configs

    for (let i = configs.length - 1; i >= 0; i--) {
      const config = configs[i]
      /**
       * 扩展:最后一步处理多个产物
       * 目前只实现了继承->强化的组合
       */
      if (Array.isArray(config)) {
        if (i !== configs.length - 1) {
          throw new Error("Workflow只支持最后一个阶段为数组")
        }
        const prev = configs[i - 1] as StorageCalculatorItem
        prev.productPriceConfigList = config.map(c => ({ immutable: true, price: 0, hrid: c.hrid }))

        const cList = [] as Calculator[]
        config.forEach((c) => {
          c.ingredientPriceConfigList = [{ immutable: true, price: 0, hrid: prev.hrid }]
          const cal = getCalculatorInstance(c)
          cal.setSellTaxFactor(sellTaxFactor)
          cal.available && cal.run()

          if (cal.hasManualPrice) {
            this.hasManualPrice = true
          }
          cList.push(cal)
        })
        this.calculatorList.push(cList)
        continue
      }

      if (i > 0) {
        config.ingredientPriceConfigList = [{ immutable: true, price: 0, hrid: config.hrid }]
      }
      // 适配继承强化
      if (i < configs.length - 1 && !config.productPriceConfigList) {
        config.productPriceConfigList = [{ immutable: true, price: 0, hrid: config.hrid }]
      }
      let cal = getCalculatorInstance(config)
      cal.setSellTaxFactor(sellTaxFactor)

      let modified = false
      if (cal.available && i > 0) {
        // 如果cal的第k个原料和第0个原料相同，则第k个原料的价格也为0
        const firstIng = cal.ingredientList[0]
        for (const k in cal.ingredientList) {
          const ing = cal.ingredientList[k]
          if (ing.hrid === firstIng.hrid && (ing.level || 0) === (firstIng.level || 0)) {
            config.ingredientPriceConfigList![k] = { immutable: true, price: 0, hrid: config.hrid }
            modified = true
          }
        }

        if (modified) {
          cal = getCalculatorInstance(config)
          cal.setSellTaxFactor(sellTaxFactor)
        }
      }

      cal.available && cal.run()
      if (cal.hasManualPrice) {
        this.hasManualPrice = true
      }
      this.calculatorList.push(cal)
    }
    this.calculatorList.reverse()
  }

  private _ingredientPreprocess?: { list: IngredientWithPrice[], map: Map<string, number> }
  private _productPreprocess?: { list: ProductWithPrice[], map: Map<string, number> }

  // 预处理并缓存原料列表及数量映射
  get ingredientListPreprocess(): { list: IngredientWithPrice[], map: Map<string, number> } {
    if (!this._ingredientPreprocess) {
      const list = this.calculatorList.flat().map(cal => cal.ingredientListWithPrice).flatMap(
        (list, i) => list.map(item => ({
          ...item,
          countPH: item.countPH! * this.workMultiplier.flat()[i]
        }))
      )
      const merged = this.mergeIngredient(list)
      const map = new Map<string, number>()
      merged.forEach(item => map.set(`${item.hrid}-${item.level || 0}`, item.countPH!))
      this._ingredientPreprocess = { list: merged, map }
    }
    return this._ingredientPreprocess
  }

  // 预处理并缓存产品列表及数量映射
  get productListWithPricePreprocess(): { list: ProductWithPrice[], map: Map<string, number> } {
    if (!this._productPreprocess) {
      const list = this.calculatorList.flat().map(cal => cal.productListWithPrice).flatMap(
        (list, i) => list.map(item => ({
          ...item,
          countPH: item.countPH! * this.workMultiplier.flat()[i]
        }))
      )
      const merged = this.mergeIngredient(list)
      const map = new Map<string, number>()
      merged.forEach(item => map.set(`${item.hrid}-${item.level || 0}`, item.countPH!))
      this._productPreprocess = { list: merged, map }
    }
    return this._productPreprocess
  }

  // 优化抵消映射计算
  get sameItemCounterMap(): Map<string, number> {
    const { map: leftMap } = this.ingredientListPreprocess
    const { map: rightMap } = this.productListWithPricePreprocess
    const sameItemMap = new Map<string, number>()

    rightMap.forEach((rightCount, key) => {
      if (leftMap.has(key)) {
        sameItemMap.set(key, Math.min(leftMap.get(key)!, rightCount))
      }
    })
    return sameItemMap
  }

  // 优化最终原料列表生成
  get ingredientListWithPrice(): IngredientWithPrice[] {
    const { list } = this.ingredientListPreprocess
    const sameItemMap = this.sameItemCounterMap

    return list
      .map(item => ({
        ...item,
        countPH: item.countPH! - (sameItemMap.get(`${item.hrid}-${item.level || 0}`) || 0)
      }))
      .filter(item => item.countPH! > 1e-8)
  }

  // 优化最终产品列表生成
  get productListWithPrice(): ProductWithPrice[] {
    const { list } = this.productListWithPricePreprocess
    const sameItemMap = this.sameItemCounterMap
    return list
      .map(item => ({
        ...item,
        countPH: item.countPH! - (sameItemMap.get(`${item.hrid}-${item.level || 0}`) || 0)
      }))
      .filter(item => item.countPH! > 1e-8)
  }

  // 把相同hrid的原料合并，用于左右抵消
  mergeIngredient(list: IngredientWithPrice[]): IngredientWithPrice[] {
    const map = new Map<string, IngredientWithPrice>()
    list.forEach((item) => {
      const key = `${item.hrid}-${item.level || 0}`
      if (map.has(key)) {
        const target = map.get(key)!
        target.count += item.count
        target.countPH! += item.countPH!
      } else {
        map.set(key, { ...item })
      }
    })
    return Array.from(map.values())
  }

  get available(): boolean {
    return this.calculatorList.flat().every(cal => cal.available)
  }

  get actionLevel(): number {
    return Math.max(...this.calculatorList.flat().map(cal => cal.actionLevel))
  }

  get timeCost() {
    return this.calculatorList.flat()[0].effectiveTimeCost / this.workMultiplier.flat()[0]
  }

  get calculator() {
    return this.calculatorList.flat()[this.calculatorList.flat().length - 1]
  }

  get expList() {
    const map = new Map<string, number>()
    this.resultList.flat().forEach((item) => {
      map.set(item.action, map.get(item.project) || 0 + item.expPH)
    })
    return Array.from(map.entries()).map(([action, expPH]) => ({
      action,
      expPH,
      expPHFormat: Format.money(expPH)
    }))
  }

  _workMultiplier?: Arrayable<number>[]
  /**
   * 工作流阶段倍率\
   * 以第一阶段为基准，第一阶段产生的产物作为原料，后面的阶段刚好消耗完毕\
   *
   * 假设四个阶段原料->产品为 a->2b, b->3c, c->5d, d->7e 耗时都为 1h\
   * 那么按照本算法计算出来的单步倍率为 [1, 2, 3, 5], 整体倍率为[1, 1x2, 1x2x3, 1x2x3x5]\
   * 最终以整个工作流 1h 计算, 所有阶段的耗时为分别为 [1/39h, 2/39h, 6/39h, 30/39h]\
   *
   * 如果最后一个阶段为数组
   * 假设四个阶段原料->产品为 a->2b, b->3c, c->5d\6e, [d->f, e->g], 耗时都为 1h
   * 那么按照本算法计算出来的单步倍率为 [1, 2, 3, [5, 6]], 整体倍率为[1, 1x2, 1x2x3, [1x2x3x5, 1x2x3x6]]\
   * 最终以整个工作流 1h 计算, 所有阶段的耗时为分别为 [1/75h, 2/75h, 6/75h, [30/75h, 36/75h]]\
   *
   *
   */
  get workMultiplier() {
    if (this._workMultiplier) {
      return this._workMultiplier
    }
    // 跨步用料平衡：仅在没有数组阶段时启用，否则回退到旧算法
    if (this.crossStepBalance && this.calculatorList.every(c => !Array.isArray(c))) {
      const balanced = this._computeBalancedWorkMultiplier()
      if (balanced) {
        this._workMultiplier = balanced
        return this._workMultiplier
      }
    }
    const singleMultiplier: Arrayable<number>[] = [1]

    const resultList = this.calculatorList.map(cal => Array.isArray(cal) ? cal.map(c => c.result) : cal.result)
    for (let i = 0; i < this.calculatorList.length; i++) {
      const cal = this.calculatorList[i] as Calculator
      const next = this.calculatorList[i + 1]
      if (!next) break
      if (Array.isArray(next)) {
        const multi = []
        for (let j = 0; j < next.length; ++j) {
          const n = next[j]
          const nIList = n.ingredientList
          const targetProduct = cal.productList.find(p =>
            p.hrid === nIList[0].hrid && (p.level || 0) === (nIList[0].level || 0)
          )!
          const targetOutput = targetProduct.count * (targetProduct.rate || 1) * resultList[i].gainPH

          const targetIngredientList = nIList.filter(i => i.hrid === nIList[0].hrid && (i.level || 0) === (nIList[0].level || 0))
          const targetIngredientCount = targetIngredientList.reduce((acc, curr) => acc + curr.count!, 0)
          const targetInput = targetIngredientCount * resultList[i + 1][j].consumePH
          multi.push(targetOutput / targetInput)
        }
        singleMultiplier.push(multi)
        continue
      }
      // todo 未来 target 可能不固定
      const target = cal.hrid
      const targetProduct = cal.productList.find(p => p.hrid === target)!
      const targetOutput = targetProduct.count * (targetProduct.rate || 1) * resultList[i].gainPH
      // 下一阶段的原料有可能同时出现多次，例如护符
      const targetIngredientList = next.ingredientList.filter(i => i.hrid === target)
      const targetIngredientCount = targetIngredientList.reduce((acc, curr) => acc + curr.count!, 0)
      const targetInput = targetIngredientCount * resultList[i + 1].consumePH

      singleMultiplier.push(targetOutput / targetInput)
    }

    const multiplier: Arrayable<number>[] = []
    for (let i = 0; i < singleMultiplier.length; i++) {
      const sm = singleMultiplier[i]
      multiplier[i] = Array.isArray(sm)
        ? sm.map(m => m * ((multiplier[i - 1] as number) || 1))
        : sm * ((multiplier[i - 1] as number) || 1)
    }
    const total = multiplier.flat().reduce((prev, curr) => prev + curr, 0)
    this._workMultiplier = multiplier.map(m => Array.isArray(m) ? m.map(j => j / total) : m / total)
    return this._workMultiplier
  }

  /**
   * 跨步用料平衡版倍率计算：
   * 以最后一步相对工时为 1，倒推时聚合 j>i 所有下游阶段对 hrid_i 的消耗，
   * 使上游产能匹配下游全部需求，最后整体归一化到总工时 1h。
   * 若数据缺失（找不到目标产物 / 产能为 0 / 总和为 0），返回 null 触发旧算法回退。
   */
  private _computeBalancedWorkMultiplier(): number[] | null {
    const cals = this.calculatorList as Calculator[]
    const n = cals.length
    if (n === 0) return null
    const resultList = cals.map(c => c.result)
    const multipliers = Array.from({ length: n }, () => 0)
    multipliers[n - 1] = 1

    for (let i = n - 2; i >= 0; i--) {
      const cal = cals[i]
      const target = cal.hrid
      const targetProduct = cal.productList.find(p => p.hrid === target)
      if (!targetProduct) return null
      const productionRate = targetProduct.count * (targetProduct.rate || 1) * resultList[i].gainPH
      if (productionRate <= 0) return null

      let totalConsumption = 0
      for (let j = i + 1; j < n; j++) {
        const matched = cals[j].ingredientList.filter(ing => ing.hrid === target)
        if (matched.length === 0) continue
        const consumptionCount = matched.reduce((acc, curr) => acc + curr.count, 0)
        totalConsumption += consumptionCount * resultList[j].consumePH * multipliers[j]
      }
      multipliers[i] = totalConsumption / productionRate
    }

    const total = multipliers.reduce((s, v) => s + v, 0)
    if (total <= 0) return null
    return multipliers.map(m => m / total)
  }

  run() {
    const item = this.calculator.item
    const costPH = this.resultList.flat().reduce((acc, curr) => acc + curr.costPH, 0)
    const incomePH = this.resultList.flat().reduce((acc, curr) => acc + curr.incomePH, 0)
    let profitPH = this.resultList.flat().reduce((acc, curr) => acc + curr.profitPH, 0)
    const profitRate = profitPH / costPH

    if (this.calculatorList.flat().some(cal => !cal.valid)) {
      profitPH = -1 / 24
    }
    const expPH = this.resultList.flat().reduce((acc, curr) => acc + (curr.expPH || 0), 0)

    // 计算最后一个动作整体执行一次的利润
    // 如果最后一个动作为数组，则以倒数第二个动作为准
    let lastCal = this.calculatorList[this.calculatorList.length - 1]
    let lastRes = this.resultList[this.resultList.length - 1] as any
    if (Array.isArray(lastCal)) {
      lastCal = this.calculatorList[this.calculatorList.length - 2] as Calculator
      lastRes = this.resultList[this.resultList.length - 2] as any
    }
    const ac = lastCal.actionsPH * lastRes.workMultiplier
    let profitPP = profitPH / ac
    // 如果最后一步是强化，则乘以单个成品的强化次数
    if (lastCal instanceof EnhanceCalculator) {
      profitPP *= lastCal.enhancelate().actions
    }

    const lastEnhance = this.calculatorList[this.calculatorList.length - 1]
    const lastEnhanceRes = this.resultList[this.resultList.length - 1]
    const isEscape = ([lastEnhance].flat()[0] as EnhanceCalculator).escapeLevel !== -1
    /**
     * 逃逸时损耗  = 总成本 - 强化步骤逃逸收益
     * 不逃逸时损耗 = 强化步骤cost4Mat
     */
    const cost4EnhancePH = isEscape
      ? costPH - [lastEnhanceRes].flat().reduce((acc, curr) => acc + curr.gainEscapePH, 0)
      : [lastEnhanceRes].flat().reduce((acc, curr) => acc + curr.cost4MatPH, 0)

    const risk = cost4EnhancePH / profitPH

    this.result = {
      workMultiplier: this.workMultiplier,
      hrid: item.hrid,
      name: getTrans(item.name),
      project: this.project,
      successRate: 1,
      costPH,
      consumePH: -1,
      gainPH: -1,
      incomePH,
      profitPH,
      profitRate,
      costPHFormat: Format.money(costPH),
      incomePHFormat: Format.money(incomePH),
      profitPHFormat: Format.money(profitPH),
      profitPDFormat: Format.money(profitPH * 24),
      profitPPFormat: Format.money(profitPP),
      profitRateFormat: Format.percent(profitRate),
      efficiencyFormat: Format.percent(0),
      timeCostFormat: Format.costTime(this.effectiveTimeCost),
      successRateFormat: Format.percent(1),
      expPHFormat: Format.money(expPH),
      cost4EnhancePHFormat: Format.money(cost4EnhancePH),
      risk,
      riskFormat: Format.number(risk, 2)
    }
    return this
  }

  constructResult(cal: Calculator, workMultiplier: number) {
    const result = cal.result
    return {
      action: cal.action,
      workMultiplier,
      hrid: cal.item.hrid,
      name: cal.item.name,
      project: cal.project,
      successRate: cal.successRate,
      costPH: result.costPH * workMultiplier,
      consumePH: result.consumePH * workMultiplier,
      gainPH: result.gainPH * workMultiplier,
      incomePH: result.incomePH * workMultiplier,
      profitPH: result.profitPH * workMultiplier,
      expPH: result.expPH * workMultiplier,
      profitRate: result.profitRate,
      gainEscapePH: cal.gainEscapePH * workMultiplier,
      cost4MatPH: result.cost4MatPH * workMultiplier,
      costPHFormat: Format.money(result.costPH * workMultiplier),
      incomePHFormat: Format.money(result.incomePH * workMultiplier),
      profitPHFormat: Format.money(result.profitPH * workMultiplier),
      profitPDFormat: Format.money(result.profitPH * 24 * workMultiplier),
      profitRateFormat: Format.percent(result.profitRate),
      efficiencyFormat: Format.percent(cal.efficiency - 1),
      timeCostFormat: Format.costTime(cal.effectiveTimeCost),
      successRateFormat: Format.percent(result.successRate),
      expPHFormat: Format.money(result.expPH * workMultiplier)
    }
  }

  _resultList?: Arrayable<ReturnType<WorkflowCalculator["constructResult"]>>[]
  get resultList() {
    if (this._resultList) {
      return this._resultList
    }

    this._resultList = this.calculatorList.map((cal, i) => {
      if (!Array.isArray(cal)) {
        return this.constructResult(cal, this.workMultiplier[i] as number)
      }
      const workMultiplier = this.workMultiplier[i] as number[]
      return cal.map((c, j) => this.constructResult(c, workMultiplier[j]))
    })
    return this._resultList
  }
}
