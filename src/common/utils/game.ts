import type { Equipment, ItemDetail } from "~/game"

export function getKeyOf(hrid?: string) {
  return hrid?.split("/").pop()
}
export function getTypeOf(hrid?: string) {
  return hrid?.split("/")[1]
}
export function getIconOf(hrid?: string) {
  const type = getTypeOf(hrid)
  const key = getKeyOf(hrid)
  return `${import.meta.env.BASE_URL}sprites/${type}.svg#${key}`
}

export function getEquipmentTypeOf(item: ItemDetail): Equipment {
  return item.equipmentDetail?.type?.split("/").pop() as Equipment
}

export function isRefined(item: ItemDetail) {
  return item.hrid.endsWith("_refined")
}
