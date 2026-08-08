import type { CalculatorConfig, Ingredient, Product } from "."
import { getActionDetailOf, getPriceOf, getProcessingProduct } from "@/common/apis/game"
import { getBuffOf, getTeaIngredientList } from "@/common/apis/player"
import Calculator from "."

export class GatherCalculator extends Calculator {
  get className() {
    return "GatherCalculator"
  }

  get actionLevel(): number {
    return this.actionItem.levelRequirement.level
  }

  get available(): boolean {
    return !!this.actionItem
  }

  constructor(config: CalculatorConfig) {
    super(config)
  }

  get actionItem() {
    // 彩虹奶酪是特例
    if (this.item.hrid === "/items/rainbow_milk" && this.action === "milking") {
      return getActionDetailOf(`/actions/milking/unicow`)
    }
    const actionKey = this.key?.replace(/milk$/, "cow").replace(/log$/, "tree")
    return getActionDetailOf(`/actions/${this.action}/${actionKey}`)
  }

  get timeCost(): number {
    return this.actionItem.baseTimeCost / this.speed
  }

  get ingredientList(): Ingredient[] {
    return getTeaIngredientList(this) || []
  }

  get productList(): Product[] {
    const gatheringBuff = getBuffOf(this.action, "Gathering")
    const processingBuff = getBuffOf(this.action, "Processing")

    const processingInfo = getProcessingProduct(this.hrid)
    let list = this.actionItem.dropTable!.map((output) => {
      const baseCount = (output.maxCount + output.minCount) / 2
      // 主产物只在存在加工映射时才被加工茶吃掉
      const effectiveProcessingBuff = processingInfo && output.itemHrid === this.hrid ? processingBuff : 0
      return {
        hrid: output.itemHrid,
        // 采集茶补正
        count: baseCount * (1 - effectiveProcessingBuff) * (1 + gatheringBuff),
        marketPrice: getPriceOf(output.itemHrid).bid
      }
    })

    // 加工茶：被吃掉的原料按配方比例（一般 2:1）转化成加工产物
    if (processingInfo && processingBuff) {
      const rawDrop = this.actionItem.dropTable!.find(d => d.itemHrid === this.hrid)
      if (rawDrop) {
        const baseCount = (rawDrop.maxCount + rawDrop.minCount) / 2
        list.push({
          hrid: processingInfo.hrid,
          count: baseCount * processingBuff * (1 + gatheringBuff) / processingInfo.inputCount,
          marketPrice: getPriceOf(processingInfo.hrid).bid
        })
      }
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
    return list
  }
}
