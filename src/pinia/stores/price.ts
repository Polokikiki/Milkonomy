import { defineStore } from "pinia"
import { pinia } from "@/pinia"
import { useGameStoreOutside } from "./game"

export const usePriceStore = defineStore("price", {
  state: () => ({
    map: load(),
    activated: getActivated()
  }),
  actions: {
    commit() {
      save(this.map)
      useGameStoreOutside().clearAllCaches()
    },
    setPrice(row: StoragePriceItem) {
      let price = this.map.get(priceKeyOf(row.hrid, row.level))
      if (!price) {
        price = {
          hrid: row.hrid,
          level: row.level,
          ask: { manual: false, manualPrice: undefined },
          bid: { manual: false, manualPrice: undefined }
        }
        this.map.set(priceKeyOf(row.hrid, row.level), price)
      }
      Object.assign(price.ask!, row.ask)
      Object.assign(price.bid!, row.bid)
      for (const [key, value] of this.map) {
        if (!value.ask?.manual && !value.bid?.manual) {
          this.map.delete(key)
        }
      }
    },
    deletePrice(row: StoragePriceItem) {
      this.map.delete(priceKeyOf(row.hrid, row.level))
      this.commit()
    },
    setActivated(value: boolean) {
      this.activated = value
      setActivated(String(value))
      useGameStoreOutside().clearAllCaches()
    }
  }
})
const KEY = "price-list"
export interface StoragePriceItem {
  hrid: string
  level?: number
  ask?: StoragePriceItemValue
  bid?: StoragePriceItemValue
}
export interface StoragePriceItemValue {
  manual: boolean
  manualPrice?: number
}
function load(): Map<string, StoragePriceItem> {
  const map = new Map<string, StoragePriceItem>()
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "[]")
    for (const item of data) {
      map.set(priceKeyOf(item.hrid, item.level), item)
    }
  } catch {
  }
  return map
}

function save(map: Map<string, StoragePriceItem>) {
  const list = Array.from(map.values())
  localStorage.setItem(KEY, JSON.stringify(list))
}

const ACTIVATED_KEY = "price-activated"
function getActivated() {
  return localStorage.getItem(ACTIVATED_KEY) === "true"
}
function setActivated(value: string) {
  localStorage.setItem(ACTIVATED_KEY, value)
}

export function priceKeyOf(hrid: string, level?: number) {
  return level ? `${hrid}-${level}` : hrid
}

export function usePriceStoreOutside() {
  return usePriceStore(pinia)
}
