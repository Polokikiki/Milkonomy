import type { CalculatorConfig } from "@/calculator"
import { find } from "lodash-es"
import { defineStore } from "pinia"
import { pinia } from "@/pinia"

export const useFavoriteStore = defineStore("favorite", {
  state: () => ({
    list: loadList()
  }),
  actions: {
    setList() {
      saveList(this.list)
    },
    addFavorite(row: StorageCalculatorItem) {
      // 不允许重复添加
      if (this.hasFavorite(row)) {
        throw new Error("请勿重复添加")
      }
      this.list.push(row)
      this.setList()
    },
    deleteFavorite(row: StorageCalculatorItem) {
      const find = this.findFavorite(row)
      if (!find) {
        throw new Error("未找到该记录")
      }
      this.list.splice(this.list.indexOf(find), 1)
      this.setList()
    },
    hasFavorite(row: StorageCalculatorItem) {
      return this.findFavorite(row) !== undefined
    },
    findFavorite(row: StorageCalculatorItem) {
      return find(this.list, item => item.id === row.id && item.catalystRank === row.catalystRank)
    }
  }
})
const LIST_KEY = "manual-list"
export interface StorageCalculatorItem extends CalculatorConfig {
  id: string
  className?: string
  /** WorkflowCalculator 收藏时使用，记录每一步的子配置 */
  subConfigs?: StorageCalculatorItem[]
}
function loadList(): StorageCalculatorItem[] {
  try {
    return JSON.parse(localStorage.getItem(LIST_KEY) || "[]")
  } catch {
    return []
  }
}

function saveList(list: StorageCalculatorItem[]) {
  localStorage.setItem(LIST_KEY, JSON.stringify(list))
}

export function useFavoriteStoreOutside() {
  return useFavoriteStore(pinia)
}
