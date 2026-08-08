import type Calculator from "@/calculator"
import { getEquipmentTypeOf } from "../utils/game"
import { getPriceOf } from "./game"
import { normalizeProject } from "./leaderboard/tierChains"

export function handleSort(profitList: Calculator[], params: any) {
  const sorted = [...profitList]
  if (params.sort && params.sort.order) {
    const props = params.sort.prop.split(".")
    function getValue(c: any) {
      let value = c
      for (let i = 0; i < props.length; ++i) {
        value = value[props[i]]
      }
      return value
    }
    const order = params.sort.order
    sorted.sort((a, b) => {
      const va = getValue(a)
      const vb = getValue(b)
      if (va == null && vb == null) return b.result.profitPH - a.result.profitPH
      if (va == null) return 1
      if (vb == null) return -1
      const diff = order === "descending" ? vb - va : va - vb
      if (diff !== 0) return diff
      return b.result.profitPH - a.result.profitPH
    })
    // DEBUG
    const vals = sorted.map(c => getValue(c)).filter(v => v != null)
    console.log(`[handleSort] order=${order} prop=${props.join(".")} total=${sorted.length} withVal=${vals.length} first3=${JSON.stringify(vals.slice(0, 3))} last3=${JSON.stringify(vals.slice(-3))}`)
  } else {
    sorted.sort((a, b) => b.result.profitPH - a.result.profitPH)
  }
  return sorted
}

export function handlePage(profitList: Calculator[], params: any) {
  return { list: profitList.slice((params.currentPage - 1) * params.size, params.currentPage * params.size), total: profitList.length }
}

export function handlePush(profitList: Calculator[], cal: Calculator) {
  try {
    // 注意：cal.available / cal.run() 可能因为数据缺失/异常而抛错。
    // 如果这里不兜底，会导致整批利润榜计算直接中断，最终缓存空数组。
    if (!cal.available) return
    if (!cal.result) {
      cal.run()
    }
    // run() 失败或被中断时，result 可能仍为空；此时不要 push。
    if (!cal.result) return
    profitList.push(cal)
  } catch (e) {
    // 不要让单个条目影响整体列表
    console.error("[handlePush] calculator failed", {
      className: (cal as any)?.className,
      hrid: (cal as any)?.hrid,
      project: (cal as any)?.project,
      action: (cal as any)?.action
    }, e)
  }
}

export function handleSearch(profitList: Calculator[], params: any) {
  params.name && (profitList = profitList.filter((cal) => {
    const nameRegex = new RegExp(params.name!, "i")
    return cal.result.name.match(nameRegex)
  })
  )

  if (params.project) {
    const target = normalizeProject(params.project)
    profitList = profitList.filter(cal => normalizeProject(cal.project).includes(target) || cal.project.includes(params.project!))
  }
  params.banEquipment && (profitList = profitList.filter(cal => !cal.isEquipment))
  params.banJewelry && (profitList = profitList.filter(cal =>
    getEquipmentTypeOf(cal.item) !== "neck" && getEquipmentTypeOf(cal.item) !== "ring" && getEquipmentTypeOf(cal.item) !== "earrings"))

  // 排除护符（charm）
  params.banCharm && (profitList = profitList.filter(cal => !cal.item || getEquipmentTypeOf(cal.item) !== "charm"))

  const onlySkillingEquipment = !!params.onlySkillingEquipment
  const onlyCombatEquipment = !!params.onlyCombatEquipment
  if (onlySkillingEquipment !== onlyCombatEquipment) {
    if (onlySkillingEquipment) {
      profitList = profitList.filter((cal) => {
        if (!cal.isEquipment || !cal.item?.equipmentDetail) return false
        const noncombatStats = cal.item.equipmentDetail.noncombatStats
        return Object.keys(noncombatStats || {}).length > 0
      })

      if (params.onlySkillingTool !== params.onlySkillingGear) {
        profitList = profitList.filter((cal) => {
          const equipmentType = getEquipmentTypeOf(cal.item)
          const isTool = typeof equipmentType === "string" && equipmentType.endsWith("_tool")
          return params.onlySkillingTool ? isTool : !isTool
        })
      }
    } else if (onlyCombatEquipment) {
      profitList = profitList.filter((cal) => {
        if (!cal.isEquipment || !cal.item?.equipmentDetail) return false
        const noncombatStats = cal.item.equipmentDetail.noncombatStats
        return Object.keys(noncombatStats || {}).length === 0
      })
    }
  }

  params.profitRate && (profitList = profitList.filter(cal => cal.result.profitRate >= params.profitRate! / 100))
  params.maxRisk && (profitList = profitList.filter(cal => cal.result.risk <= params.maxRisk))
  return profitList
}

export function handleVolume1hSearch(profitList: Calculator[], params: any) {
  const hasMinVolume1h = params.minVolume1h !== undefined && params.minVolume1h !== null
  const hasMaxVolume1h = params.maxVolume1h !== undefined && params.maxVolume1h !== null
  if (!hasMinVolume1h && !hasMaxVolume1h) return profitList

  const minVolume1h = hasMinVolume1h ? Number(params.minVolume1h) : undefined
  const maxVolume1h = hasMaxVolume1h ? Number(params.maxVolume1h) : undefined
  return profitList.filter((item) => {
    const volume1h = getPriceOf(item.hrid, item.enhanceLevel ?? 0).vol
    if (typeof volume1h !== "number" || volume1h < 0) return false
    return (minVolume1h === undefined || volume1h >= minVolume1h)
      && (maxVolume1h === undefined || volume1h <= maxVolume1h)
  })
}
