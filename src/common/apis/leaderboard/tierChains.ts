/**
 * 逐级制作 / 起始材质 —— 材质档位配置
 *
 * 游戏里锻造/制造/裁缝的装备是逐级升级的（cheese→verdant→...→holy），
 * 每一档对应一个固定的 itemLevel。用 itemLevel 作为绝对锚点来筛选：
 *   - 起始材质：workflow 链条起点（configs[0]）的 itemLevel
 *   - 逐级制作（终点）：workflow 最终产物的 itemLevel
 *
 * 基础主链档位用颜色名；顶端特殊装备档位（无统一颜色名）用等级数命名（Lv85/90/95）。
 */

export interface TierOption {
  itemLevel: number
  label: string
  /** 商店购买价格（金币），存在表示该档位物品可在商店直接购买 */
  shopCost?: number
}

/** 起始材质带商店标记的复合值，格式为 "itemLevel_shop" */
export function isShopTier(value: string | number | undefined | null): boolean {
  return typeof value === 'string' && value.endsWith('_shop')
}
export function parseTierLevel(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const s = String(value).replace('_shop', '')
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

export interface TierChain {
  key: string
  label: string
  tiers: TierOption[]
}

export const TIER_CHAINS: Record<string, TierChain[]> = {
  锻造: [
    {
      key: "cheese",
      label: "奶酪",
      tiers: [
        { itemLevel: 1, label: "奶酪" },
        { itemLevel: 10, label: "翠绿奶酪", shopCost: 5000 },
        { itemLevel: 20, label: "蔚蓝奶酪" },
        { itemLevel: 35, label: "深紫奶酪" },
        { itemLevel: 50, label: "绛红奶酪" },
        { itemLevel: 65, label: "彩虹奶酪" },
        { itemLevel: 80, label: "神圣奶酪" },
        { itemLevel: 85, label: "Lv85" },
        { itemLevel: 90, label: "Lv90" },
        { itemLevel: 95, label: "Lv95" }
      ]
    }
  ],
  制造: [
    {
      key: "wood",
      label: "木材",
      tiers: [
        { itemLevel: 1, label: "原木" },
        { itemLevel: 10, label: "白桦", shopCost: 5000 },
        { itemLevel: 20, label: "雪松" },
        { itemLevel: 35, label: "紫心" },
        { itemLevel: 50, label: "银杏" },
        { itemLevel: 65, label: "红杉" },
        { itemLevel: 80, label: "神秘" },
        { itemLevel: 85, label: "Lv85" },
        { itemLevel: 90, label: "Lv90" },
        { itemLevel: 95, label: "Lv95" }
      ]
    }
  ],
  裁缝: [
    {
      key: "leather",
      label: "皮革",
      tiers: [
        { itemLevel: 1, label: "粗糙皮革" },
        { itemLevel: 15, label: "爬行动物皮革" },
        { itemLevel: 35, label: "哥布林皮革" },
        { itemLevel: 55, label: "野兽皮革" },
        { itemLevel: 75, label: "暗影皮革" },
        { itemLevel: 85, label: "狮鹫皮革" },
        { itemLevel: 90, label: "Lv90" },
        { itemLevel: 95, label: "Lv95" }
      ]
    },
    {
      key: "fabric",
      label: "布料",
      tiers: [
        { itemLevel: 1, label: "棉花布料" },
        { itemLevel: 15, label: "亚麻布料" },
        { itemLevel: 35, label: "竹子布料" },
        { itemLevel: 55, label: "丝绸" },
        { itemLevel: 75, label: "光辉布料" },
        { itemLevel: 85, label: "Lv85" },
        { itemLevel: 90, label: "Lv90" },
        { itemLevel: 95, label: "Lv95" }
      ]
    }
  ]
}

// 动作名归一化：英文/繁体动作名统一映射回简体中文 key，
// 保证中英文界面下逐级制作过滤器都能正确匹配 TIER_CHAINS。
const PROJECT_ALIAS: Record<string, string> = {
  // 挤奶
  "挤奶": "挤奶",
  "Milking": "挤奶",
  // 采摘
  "采摘": "采摘",
  "Foraging": "采摘",
  // 伐木
  "伐木": "伐木",
  "Woodcutting": "伐木",
  // 锻造
  "锻造": "锻造",
  "Smithing": "锻造",
  "Cheesesmithing": "锻造",
  // 制造
  "制造": "制造",
  "Crafting": "制造",
  // 裁缝 / 缝纫
  "裁缝": "裁缝",
  "缝纫": "裁缝",
  "Tailoring": "裁缝",
  // 烹饪
  "烹饪": "烹饪",
  "Cooking": "烹饪",
  // 冲泡
  "冲泡": "冲泡",
  "Brewing": "冲泡",
  // 点金
  "点金": "点金",
  "Coinify": "点金",
  // 分解
  "分解": "分解",
  "Decompose": "分解",
  // 转化
  "转化": "转化",
  "Transmute": "转化"
}

export function normalizeProject(project: string): string {
  return PROJECT_ALIAS[project] || project
}

export function supportsTierFilter(project: string): boolean {
  const p = normalizeProject(project)
  return p === "锻造" || p === "制造" || p === "裁缝"
}
