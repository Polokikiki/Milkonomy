import { handleSearch } from "@@/apis/utils"

import { describe, expect, it } from "vitest"

describe("handleSearch - banCharm", () => {
  const charmCal: any = {
    item: { equipmentDetail: { type: "/equipment_types/charm" } },
    isEquipment: true,
    project: "",
    result: { name: "Some Charm", profitRate: 0, risk: 0 }
  }

  const ringCal: any = {
    item: { equipmentDetail: { type: "/equipment_types/ring" } },
    isEquipment: true,
    project: "",
    result: { name: "Some Ring", profitRate: 0, risk: 0 }
  }

  const nonEquipmentCal: any = {
    item: {},
    isEquipment: false,
    project: "",
    result: { name: "Some Item", profitRate: 0, risk: 0 }
  }

  it("filters out charms when banCharm is true", () => {
    const list = handleSearch([charmCal, ringCal, nonEquipmentCal], { banCharm: true })
    expect(list.map((x: any) => x.result.name)).toEqual(["Some Ring", "Some Item"])
  })

  it("does not filter out charms when banCharm is false", () => {
    const list = handleSearch([charmCal, ringCal, nonEquipmentCal], { banCharm: false })
    expect(list.map((x: any) => x.result.name)).toEqual(["Some Charm", "Some Ring", "Some Item"])
  })
})
