import { getTrans } from "@/locales"
import { useGameStore } from "@/pinia/stores/game"

export interface ItemOption {
  hrid: string
  label: string
}

/** 全部可交易物品选项（按中文名排序），供 [上部] 与红节点共用 */
export function getTradableItemOptions(): ItemOption[] {
  const gameData = useGameStore().gameData
  if (!gameData) return []
  return Object.values(gameData.itemDetailMap)
    .filter(item => item.isTradable)
    .map(item => ({ hrid: item.hrid, label: getTrans(item.name) }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh"))
}
