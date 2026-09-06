/**
 * 公告配置
 * 用于在页面顶部展示全局公告信息
 */

export interface AnnouncementConfig {
  /** 是否启用公告 */
  enabled: boolean
  /** 公告唯一标识，用于localStorage记录关闭状态，修改id可让已关闭的用户重新看到公告 */
  id: string
  /** 公告消息的i18n key */
  message: {
    title: string
    content: string
  }
  /** 相关链接 */
  link?: {
    url: string
    text: string
  }
}

export const announcementConfig: AnnouncementConfig = {
  enabled: true,
  id: "v2.7.0-tax-fix",
  message: {
    title: "v2.7.0 更新公告",
    content: [
      "一、报价税率修复（重要）",
      "1. 强化/贤者「给定工时费算报价」补税公式修正（×1.05 → ÷0.95）：旧版每单少收 0.25%。",
      "2. 强化模拟页指导价曾双重计税（等效税率 10.53%），现修正为 5%。",
      "",
      "二、新增「贤者路径计算」页",
      "1. 全市场扫描贤者之石最便宜的获取途径（转化装备 + 分解首饰排行），进页面即出结果。",
      "",
      "三、制造成本回退（新）",
      "1. 买价遇到无挂单物品时自动按制造成本估算（按配方递归折算原料），此类行不再作废。",
      "",
      "四、列设置扩展",
      "1. 列设置齿轮扩展到首页、手动炼金、打野、超级打野、物品炼金路径对比。",
      "",
      "五、首页排序",
      "1. 利润排行新增「利润/天」「利润/h」「利润/次」点击排序。",
      "",
      "六、修复",
      "1. 「制作装备」模式下装备成本残留旧值（显示 1 且按 1 计算）的问题，现一律按配方成本。"
    ].join("\n")
  },
  link: {
    url: "https://polokikiki.github.io/Milkonomy/#/changelog",
    text: "查看详情"
  }
}

const STORAGE_KEY = "announcement-dismissed-2026"

/**
 * 检查公告是否应该显示
 */
export function shouldShowAnnouncement(): boolean {
  if (!announcementConfig.enabled) return false
  const dismissed = localStorage.getItem(STORAGE_KEY)
  return dismissed !== announcementConfig.id
}

/**
 * 关闭/忽略公告
 */
export function dismissAnnouncement(): void {
  localStorage.setItem(STORAGE_KEY, announcementConfig.id)
}
