import type { MultistepPlan } from "../types"

// 预置配方（快照 2026-10-01，收益/耗时为生成时行情）
export const PRESET_PLANS: MultistepPlan[] = [
  {
    name: "分解奶酪剑",
    profitPH: 1733220,
    savedAt: 0,
    rows: [
      {
        uid: 1,
        hrid: "/items/cheese_sword",
        count: 1
      }
    ],
    nodes: [
      {
        id: "red1",
        kind: "var",
        varKind: "red",
        hrid: "/items/cheese_sword",
        count: 1,
        rowUid: 1,
        obtain: "buy",
        x: 0,
        y: 0
      },
      {
        id: "func1",
        kind: "func",
        hrid: "",
        funcClass: "B",
        mainItemHrid: "/items/cheese_sword",
        actionHrid: "/actions/alchemy/decompose",
        catalystRank: 0,
        x: 0,
        y: 0
      },
      {
        id: "g0",
        kind: "var",
        varKind: "green",
        hrid: "/items/cheese",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g1",
        kind: "var",
        varKind: "green",
        hrid: "/items/small_artisans_crate",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g2",
        kind: "var",
        varKind: "green",
        hrid: "/items/alchemy_essence",
        createdBy: "func1",
        x: 0,
        y: 0
      }
    ],
    wires: [
      {
        id: "wire1",
        fromPinId: "red1:out:main",
        toPinId: "func1:in:main"
      },
      {
        id: "w2",
        fromPinId: "func1:out:main",
        toPinId: "g0:in:main"
      },
      {
        id: "w3",
        fromPinId: "func1:out:1",
        toPinId: "g1:in:main"
      },
      {
        id: "w4",
        fromPinId: "func1:out:2",
        toPinId: "g2:in:main"
      }
    ],
    batchSec: 4
  },
  {
    name: "分解分解催化剂",
    profitPH: 8995428,
    savedAt: 0,
    rows: [
      {
        uid: 1,
        hrid: "/items/catalyst_of_decomposition",
        count: 1
      }
    ],
    nodes: [
      {
        id: "red1",
        kind: "var",
        varKind: "red",
        hrid: "/items/catalyst_of_decomposition",
        count: 1,
        rowUid: 1,
        obtain: "buy",
        x: 0,
        y: 0
      },
      {
        id: "func1",
        kind: "func",
        hrid: "",
        funcClass: "B",
        mainItemHrid: "/items/catalyst_of_decomposition",
        actionHrid: "/actions/alchemy/decompose",
        catalystRank: 0,
        x: 0,
        y: 0
      },
      {
        id: "g0",
        kind: "var",
        varKind: "green",
        hrid: "/items/alchemy_essence",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g1",
        kind: "var",
        varKind: "green",
        hrid: "/items/medium_artisans_crate",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g2",
        kind: "var",
        varKind: "green",
        hrid: "/items/alchemy_essence",
        createdBy: "func1",
        x: 0,
        y: 0
      }
    ],
    wires: [
      {
        id: "wire1",
        fromPinId: "red1:out:main",
        toPinId: "func1:in:main"
      },
      {
        id: "w2",
        fromPinId: "func1:out:main",
        toPinId: "g0:in:main"
      },
      {
        id: "w3",
        fromPinId: "func1:out:1",
        toPinId: "g1:in:main"
      },
      {
        id: "w4",
        fromPinId: "func1:out:2",
        toPinId: "g2:in:main"
      }
    ],
    batchSec: 5
  },
  {
    name: "转化紫水晶",
    profitPH: 1598105,
    savedAt: 0,
    rows: [
      {
        uid: 1,
        hrid: "/items/amethyst",
        count: 1
      }
    ],
    nodes: [
      {
        id: "red1",
        kind: "var",
        varKind: "red",
        hrid: "/items/amethyst",
        count: 1,
        rowUid: 1,
        obtain: "buy",
        x: 0,
        y: 0
      },
      {
        id: "func1",
        kind: "func",
        hrid: "",
        funcClass: "B",
        mainItemHrid: "/items/amethyst",
        actionHrid: "/actions/alchemy/transmute",
        catalystRank: 0,
        x: 0,
        y: 0
      },
      {
        id: "g0",
        kind: "var",
        varKind: "green",
        hrid: "/items/star_fragment",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g1",
        kind: "var",
        varKind: "green",
        hrid: "/items/pearl",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g2",
        kind: "var",
        varKind: "green",
        hrid: "/items/amber",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g3",
        kind: "var",
        varKind: "green",
        hrid: "/items/garnet",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g4",
        kind: "var",
        varKind: "green",
        hrid: "/items/jade",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g5",
        kind: "var",
        varKind: "green",
        hrid: "/items/amethyst",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g6",
        kind: "var",
        varKind: "green",
        hrid: "/items/moonstone",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g7",
        kind: "var",
        varKind: "green",
        hrid: "/items/sunstone",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g8",
        kind: "var",
        varKind: "green",
        hrid: "/items/medium_artisans_crate",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g9",
        kind: "var",
        varKind: "green",
        hrid: "/items/alchemy_essence",
        createdBy: "func1",
        x: 0,
        y: 0
      }
    ],
    wires: [
      {
        id: "wire1",
        fromPinId: "red1:out:main",
        toPinId: "func1:in:main"
      },
      {
        id: "w2",
        fromPinId: "func1:out:main",
        toPinId: "g0:in:main"
      },
      {
        id: "w3",
        fromPinId: "func1:out:1",
        toPinId: "g1:in:main"
      },
      {
        id: "w4",
        fromPinId: "func1:out:2",
        toPinId: "g2:in:main"
      },
      {
        id: "w5",
        fromPinId: "func1:out:3",
        toPinId: "g3:in:main"
      },
      {
        id: "w6",
        fromPinId: "func1:out:4",
        toPinId: "g4:in:main"
      },
      {
        id: "w7",
        fromPinId: "func1:out:5",
        toPinId: "g5:in:main"
      },
      {
        id: "w8",
        fromPinId: "func1:out:6",
        toPinId: "g6:in:main"
      },
      {
        id: "w9",
        fromPinId: "func1:out:7",
        toPinId: "g7:in:main"
      },
      {
        id: "w10",
        fromPinId: "func1:out:8",
        toPinId: "g8:in:main"
      },
      {
        id: "w11",
        fromPinId: "func1:out:9",
        toPinId: "g9:in:main"
      }
    ],
    batchSec: 5
  },
  {
    name: "贤者之路·太阳石→贤者之石",
    savedAt: 0,
    rows: [
      {
        uid: 1,
        hrid: "/items/sunstone",
        count: 1
      }
    ],
    nodes: [
      {
        id: "red1",
        kind: "var",
        varKind: "red",
        hrid: "/items/sunstone",
        count: 1,
        rowUid: 1,
        obtain: "buy",
        x: 0,
        y: 0,
        triIn: true
      },
      {
        id: "func1",
        kind: "func",
        hrid: "",
        funcClass: "B",
        mainItemHrid: "/items/sunstone",
        actionHrid: "/actions/alchemy/transmute",
        catalystRank: 0,
        x: 0,
        y: 0
      },
      {
        id: "g1_0",
        kind: "var",
        varKind: "green",
        hrid: "/items/star_fragment",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g1_1",
        kind: "var",
        varKind: "green",
        hrid: "/items/moonstone",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g1_2",
        kind: "var",
        varKind: "green",
        hrid: "/items/sunstone",
        createdBy: "func1",
        x: 0,
        y: 0,
        triOut: true
      },
      {
        id: "g1_3",
        kind: "var",
        varKind: "green",
        hrid: "/items/philosophers_stone",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g1_4",
        kind: "var",
        varKind: "green",
        hrid: "/items/large_artisans_crate",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g1_5",
        kind: "var",
        varKind: "green",
        hrid: "/items/alchemy_essence",
        createdBy: "func1",
        x: 0,
        y: 0
      }
    ],
    wires: [
      {
        id: "w1a",
        fromPinId: "red1:out:main",
        toPinId: "func1:in:main"
      },
      {
        id: "w1b0",
        fromPinId: "func1:out:main",
        toPinId: "g1_0:in:main"
      },
      {
        id: "w1b1",
        fromPinId: "func1:out:1",
        toPinId: "g1_1:in:main"
      },
      {
        id: "w1b2",
        fromPinId: "func1:out:2",
        toPinId: "g1_2:in:main"
      },
      {
        id: "w1b3",
        fromPinId: "func1:out:3",
        toPinId: "g1_3:in:main"
      },
      {
        id: "w1b4",
        fromPinId: "func1:out:4",
        toPinId: "g1_4:in:main"
      },
      {
        id: "w1b5",
        fromPinId: "func1:out:5",
        toPinId: "g1_5:in:main"
      },
      {
        id: "wtri2",
        fromPinId: "g1_2:out:tri",
        toPinId: "red1:in:tri"
      }
    ],
    profitPH: -30901244,
    batchSec: 8
  },
  {
    name: "示例·红绿合并（神秘弩）",
    rows: [
      {
        uid: 1,
        hrid: "/items/arcane_log",
        count: 1
      },
      {
        uid: 2,
        hrid: "/items/redwood_crossbow",
        count: 1
      }
    ],
    nodes: [
      {
        id: "red1",
        kind: "var",
        varKind: "red",
        hrid: "/items/arcane_log",
        count: 1,
        rowUid: 1,
        obtain: "buy",
        x: 0,
        y: 0
      },
      {
        id: "red2",
        kind: "var",
        varKind: "red",
        hrid: "/items/redwood_crossbow",
        count: 1,
        rowUid: 2,
        obtain: "buy",
        x: 0,
        y: 0
      },
      {
        id: "func1",
        kind: "func",
        hrid: "",
        funcClass: "A",
        mainItemHrid: "/items/arcane_lumber",
        actionHrid: "/actions/crafting/arcane_lumber",
        x: 0,
        y: 0
      },
      {
        id: "func2",
        kind: "func",
        hrid: "",
        funcClass: "A",
        mainItemHrid: "/items/arcane_crossbow",
        actionHrid: "/actions/crafting/arcane_crossbow",
        x: 0,
        y: 0
      },
      {
        id: "var_plank",
        kind: "var",
        varKind: "blue",
        hrid: "/items/arcane_lumber",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "var_ess1",
        kind: "var",
        varKind: "green",
        hrid: "/items/crafting_essence",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "var_branch",
        kind: "var",
        varKind: "green",
        hrid: "/items/branch_of_insight",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "var_crate1",
        kind: "var",
        varKind: "green",
        hrid: "/items/large_artisans_crate",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "var_arb",
        kind: "var",
        varKind: "green",
        hrid: "/items/arcane_crossbow",
        createdBy: "func2",
        x: 0,
        y: 0
      },
      {
        id: "var_ess2",
        kind: "var",
        varKind: "green",
        hrid: "/items/crafting_essence",
        createdBy: "func2",
        x: 0,
        y: 0
      },
      {
        id: "var_crate2",
        kind: "var",
        varKind: "green",
        hrid: "/items/large_artisans_crate",
        createdBy: "func2",
        x: 0,
        y: 0
      }
    ],
    wires: [
      {
        id: "wire1",
        fromPinId: "red1:out:main",
        toPinId: "func1:in:main"
      },
      {
        id: "wire2",
        fromPinId: "func1:out:main",
        toPinId: "var_plank:in:main"
      },
      {
        id: "wire3",
        fromPinId: "func1:out:1",
        toPinId: "var_ess1:in:main"
      },
      {
        id: "wire4",
        fromPinId: "func1:out:2",
        toPinId: "var_branch:in:main"
      },
      {
        id: "wire5",
        fromPinId: "func1:out:3",
        toPinId: "var_crate1:in:main"
      },
      {
        id: "wire6",
        fromPinId: "red2:out:main",
        toPinId: "func2:in:main"
      },
      {
        id: "wire7",
        fromPinId: "var_plank:out:main",
        toPinId: "func2:in:1"
      },
      {
        id: "wire8",
        fromPinId: "func2:out:main",
        toPinId: "var_arb:in:main"
      },
      {
        id: "wire9",
        fromPinId: "func2:out:1",
        toPinId: "var_ess2:in:main"
      },
      {
        id: "wire10",
        fromPinId: "func2:out:2",
        toPinId: "var_crate2:in:main"
      }
    ],
    savedAt: 1790859890801,
    profitPH: 1480812,
    batchSec: 6
  },
  {
    name: "示例·太阳石转化环（三角引脚）",
    savedAt: 0,
    rows: [
      {
        uid: 1,
        hrid: "/items/sunstone",
        count: 1
      }
    ],
    nodes: [
      {
        id: "red1",
        kind: "var",
        varKind: "red",
        hrid: "/items/sunstone",
        count: 1,
        rowUid: 1,
        obtain: "buy",
        x: 0,
        y: 0,
        triIn: true
      },
      {
        id: "func1",
        kind: "func",
        hrid: "",
        funcClass: "B",
        mainItemHrid: "/items/sunstone",
        actionHrid: "/actions/alchemy/transmute",
        catalystRank: 0,
        x: 0,
        y: 0
      },
      {
        id: "g1_0",
        kind: "var",
        varKind: "green",
        hrid: "/items/star_fragment",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g1_1",
        kind: "var",
        varKind: "green",
        hrid: "/items/moonstone",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g1_2",
        kind: "var",
        varKind: "green",
        hrid: "/items/sunstone",
        createdBy: "func1",
        x: 0,
        y: 0,
        triOut: true
      },
      {
        id: "g1_3",
        kind: "var",
        varKind: "green",
        hrid: "/items/philosophers_stone",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g1_4",
        kind: "var",
        varKind: "green",
        hrid: "/items/large_artisans_crate",
        createdBy: "func1",
        x: 0,
        y: 0
      },
      {
        id: "g1_5",
        kind: "var",
        varKind: "green",
        hrid: "/items/alchemy_essence",
        createdBy: "func1",
        x: 0,
        y: 0
      }
    ],
    wires: [
      {
        id: "w1a",
        fromPinId: "red1:out:main",
        toPinId: "func1:in:main"
      },
      {
        id: "w1b0",
        fromPinId: "func1:out:main",
        toPinId: "g1_0:in:main"
      },
      {
        id: "w1b1",
        fromPinId: "func1:out:1",
        toPinId: "g1_1:in:main"
      },
      {
        id: "w1b2",
        fromPinId: "func1:out:2",
        toPinId: "g1_2:in:main"
      },
      {
        id: "w1b3",
        fromPinId: "func1:out:3",
        toPinId: "g1_3:in:main"
      },
      {
        id: "w1b4",
        fromPinId: "func1:out:4",
        toPinId: "g1_4:in:main"
      },
      {
        id: "w1b5",
        fromPinId: "func1:out:5",
        toPinId: "g1_5:in:main"
      },
      {
        id: "wtri",
        fromPinId: "g1_2:out:tri",
        toPinId: "red1:in:tri"
      }
    ],
    profitPH: -30901244,
    batchSec: 8
  }
]
