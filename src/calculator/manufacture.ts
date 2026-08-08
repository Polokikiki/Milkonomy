import type { CalculatorConfig, Ingredient, Product } from "."
import type { ActionDetail } from "~/game"
import { getActionDetailOf, getPriceOf } from "@/common/apis/game"
import { getBuffOf, getTeaIngredientList } from "@/common/apis/player"
import { isRefined } from "@/common/utils/game"
import Calculator from "."

export class ManufactureCalculator extends Calculator {
  get className() {
    return "ManufactureCalculator"
  }

  get actionLevel(): number {
    return this.actionItem.levelRequirement.level
  }

  get available(): boolean {
    return !!this.actionItem
  }

  originLevel: number
  constructor(config: CalculatorConfig) {
    super(config)
    this.originLevel = config.originLevel || 0
  }

  _actionItem?: ActionDetail
  get actionItem() {
    if (!this._actionItem) {
      this._actionItem = getActionDetailOf(`/actions/${this.action}/${this.key}`)
    }
    return this._actionItem
  }

  get timeCost(): number {
    return this.actionItem.baseTimeCost / this.speed
  }

  _ingredientList?: Ingredient[]
  get ingredientList(): Ingredient[] {
    if (!this._ingredientList) {
      let list: Ingredient[] = []
      if (this.actionItem.upgradeItemHrid) {
        list.push({
          hrid: this.actionItem.upgradeItemHrid,
          count: 1,
          level: this.originLevel,
          marketPrice: getPriceOf(this.actionItem.upgradeItemHrid, this.originLevel).ask
        })
      }
      const artisanBuff = getBuffOf(this.action, "Artisan")
      list = list.concat(this.actionItem.inputItems.map(input => ({
        hrid: input.itemHrid,
        // 工匠茶补正
        count: input.count * (1 - artisanBuff),
        marketPrice: getPriceOf(input.itemHrid).ask
      })))

      list = list.concat(getTeaIngredientList(this))
      this._ingredientList = list
    }
    return this._ingredientList
  }

  get targetLevel(): number {
    let targetLevel = Math.round(this.originLevel * 0.7 * 100) / 100
    // 精炼继承保留原等级
    if (isRefined(this.item)) {
      targetLevel = this.originLevel
    }
    return targetLevel
  }

  _productList?: Product[]
  get productList(): Product[] {
    if (!this._productList) {
      const gourmetBuff = getBuffOf(this.action, "Gourmet")
      let list: Product[] = []
      const levelUpRate = this.targetLevel % 1
      if (this.targetLevel % 1 === 0) {
        list = this.actionItem.outputItems.map(output => ({
          hrid: output.itemHrid,
          // 双倍茶补正
          count: output.count * (1 + gourmetBuff),
          level: Math.floor(this.targetLevel),
          marketPrice: getPriceOf(output.itemHrid, Math.floor(this.targetLevel)).bid
        }))
      // 如果targetLevel不是整数，则再添加一个level为targetLevel+1的产品
      } else {
        let levelUpPrice = getPriceOf(this.item.hrid, Math.ceil(this.targetLevel)).bid
        if (levelUpPrice <= 0) {
          levelUpPrice = getPriceOf(this.item.hrid, Math.floor(this.targetLevel)).bid
        }
        list = list.concat([
          {
            hrid: this.item.hrid,
            count: 1 - levelUpRate,
            level: Math.floor(this.targetLevel),
            marketPrice: getPriceOf(this.item.hrid, Math.floor(this.targetLevel)).bid
          },
          {
            hrid: this.item.hrid,
            count: levelUpRate,
            level: Math.ceil(this.targetLevel),
            marketPrice: levelUpPrice
          }
        ])
      }

      list = list.concat(this.actionItem.essenceDropTable?.map(essence => ({
        hrid: essence.itemHrid,
        count: essence.maxCount,
        rate: essence.dropRate * (1 + this.essenceRatio),
        marketPrice: getPriceOf(essence.itemHrid).bid
      })) || [])
      list = list.concat(this.actionItem.rareDropTable?.map(rare => ({
        hrid: rare.itemHrid,
        count: rare.maxCount,
        rate: rare.dropRate * (1 + this.rareRatio),
        marketPrice: getPriceOf(rare.itemHrid).bid
      })) || []
      )
      this._productList = list
    }
    return this._productList
  }
}
