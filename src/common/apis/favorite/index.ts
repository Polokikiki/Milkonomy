import type { RequestData } from "../leaderboard/type"
import type Calculator from "@/calculator"
import { calculatorConstructable, getCalculatorInstance, getStorageCalculatorItem } from "@/calculator/utils"
import { NO_TAX_FACTOR, SELL_TAX_FACTOR } from "@/common/constants/market"
import { getEquipmentTypeOf } from "@/common/utils/game"
import { useFavoriteStoreOutside } from "@/pinia/stores/favorite"
import { handleVolume1hSearch } from "../utils"
/** 查 */
export async function getFavoriteDataApi(params: RequestData) {
  await new Promise(resolve => setTimeout(resolve, 300))
  const sellTaxFactor = params.includeTax === false ? NO_TAX_FACTOR : SELL_TAX_FACTOR
  const crossStepBalance = params.crossStepBalance === true
  let profitList: Calculator[] = []
  try {
    profitList = calcProfit(sellTaxFactor, crossStepBalance)
  } catch (e: any) {
    console.error(e)
  }
  profitList.sort((a, b) => b.result.profitPH - a.result.profitPH)
  params.name && (profitList = profitList.filter(item => item.result.name.toLowerCase().includes(params.name!.toLowerCase())))
  params.project && (profitList = profitList.filter(item => item.project === params.project))
  params.profitRate && (profitList = profitList.filter(item => item.result.profitRate >= params.profitRate! / 100))
  params.banEquipment && (profitList = profitList.filter(item => !item.isEquipment))
  // 排除护符（charm）
  params.banCharm && (profitList = profitList.filter(item => !item.item || getEquipmentTypeOf(item.item) !== "charm"))
  profitList = handleVolume1hSearch(profitList, params)
  // 分页
  return { list: profitList.slice((params.currentPage - 1) * params.size, params.currentPage * params.size), total: profitList.length }
}

function calcProfit(sellTaxFactor: number, crossStepBalance: boolean) {
  // 所有物品列表
  const list = useFavoriteStoreOutside().list
  const profitList: Calculator[] = []
  list.filter(item => calculatorConstructable(item.className!)).forEach((item) => {
    try {
      // workflow 的子计算器在构造时就需要正确的税率，因此通过参数透传
      const instance = getCalculatorInstance(item, sellTaxFactor, crossStepBalance)
      instance.setSellTaxFactor(sellTaxFactor)
      instance.available && profitList.push(instance.run())
    } catch (e) {
      console.error(e)
    }
  })
  return profitList
}

/** 增 */
export function addFavoriteApi(row: Calculator) {
  const storageItem = getStorageCalculatorItem(row)
  useFavoriteStoreOutside().addFavorite(storageItem)
}
/** 删 */
export function deleteFavoriteApi(row: Calculator) {
  useFavoriteStoreOutside().deleteFavorite(getStorageCalculatorItem(row))
}
