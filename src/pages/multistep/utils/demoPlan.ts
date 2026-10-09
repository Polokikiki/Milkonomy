import type { MultistepPlan } from "../types"

/**
 * 首次进入的演示链：神秘原木 → 制造神秘木板；红杉弩 + 神秘木板 → 制造神秘弩。
 * 配方/掉落数据与 data.json 同源（arcane_crossbow 实际需要 162 块神秘木板）。
 * 引脚顺序对齐 resolveRecipeA：inputs = upgradeItemHrid + inputItems，
 * outputs = outputItems + essenceDropTable + rareDropTable。
 */
export function buildDemoPlan(): MultistepPlan {
  return {
    name: "演示：神秘弩",
    rows: [
      { uid: 1, hrid: "/items/arcane_log", count: 1 },
      { uid: 2, hrid: "/items/redwood_crossbow", count: 1 }
    ],
    nodes: [
      { id: "red1", kind: "var", varKind: "red", hrid: "/items/arcane_log", count: 1, rowUid: 1, obtain: "buy", x: 0, y: 0 },
      { id: "red2", kind: "var", varKind: "red", hrid: "/items/redwood_crossbow", count: 1, rowUid: 2, obtain: "buy", x: 0, y: 0 },
      { id: "func1", kind: "func", hrid: "", funcClass: "A", mainItemHrid: "/items/arcane_lumber", actionHrid: "/actions/crafting/arcane_lumber", x: 0, y: 0 },
      { id: "func2", kind: "func", hrid: "", funcClass: "A", mainItemHrid: "/items/arcane_crossbow", actionHrid: "/actions/crafting/arcane_crossbow", x: 0, y: 0 },
      { id: "var_plank", kind: "var", varKind: "blue", hrid: "/items/arcane_lumber", createdBy: "func1", x: 0, y: 0 },
      { id: "var_ess1", kind: "var", varKind: "green", hrid: "/items/crafting_essence", createdBy: "func1", x: 0, y: 0 },
      { id: "var_branch", kind: "var", varKind: "green", hrid: "/items/branch_of_insight", createdBy: "func1", x: 0, y: 0 },
      { id: "var_crate1", kind: "var", varKind: "green", hrid: "/items/large_artisans_crate", createdBy: "func1", x: 0, y: 0 },
      { id: "var_arb", kind: "var", varKind: "green", hrid: "/items/arcane_crossbow", createdBy: "func2", x: 0, y: 0 },
      { id: "var_ess2", kind: "var", varKind: "green", hrid: "/items/crafting_essence", createdBy: "func2", x: 0, y: 0 },
      { id: "var_crate2", kind: "var", varKind: "green", hrid: "/items/large_artisans_crate", createdBy: "func2", x: 0, y: 0 }
    ],
    wires: [
      { id: "wire1", fromPinId: "red1:out:main", toPinId: "func1:in:main" },
      { id: "wire2", fromPinId: "func1:out:main", toPinId: "var_plank:in:main" },
      { id: "wire3", fromPinId: "func1:out:1", toPinId: "var_ess1:in:main" },
      { id: "wire4", fromPinId: "func1:out:2", toPinId: "var_branch:in:main" },
      { id: "wire5", fromPinId: "func1:out:3", toPinId: "var_crate1:in:main" },
      { id: "wire6", fromPinId: "red2:out:main", toPinId: "func2:in:main" },
      { id: "wire7", fromPinId: "var_plank:out:main", toPinId: "func2:in:1" },
      { id: "wire8", fromPinId: "func2:out:main", toPinId: "var_arb:in:main" },
      { id: "wire9", fromPinId: "func2:out:1", toPinId: "var_ess2:in:main" },
      { id: "wire10", fromPinId: "func2:out:2", toPinId: "var_crate2:in:main" }
    ],
    savedAt: Date.now()
  }
}
