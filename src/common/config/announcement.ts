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
  id: "v2.6.0-super-alchemy",
  message: {
    title: "v2.6.0 更新公告",
    content: [
      "一、配装对比重做",
      "1. 修复对比时数值不显示的问题，对比行新增利润百分比（升绿降红）。",
      "2. 对比数据改为每个预设全量抓取 + 各预设并集，不再漏行。",
      "",
      "二、新增「炼金路径」页",
      "1. 物品多选 + 分类筛选 + 自定义组，支持批量收藏。",
      "2. 催化剂选择直接显示图标（转化/分解/点金/至高），支持自动最优。",
      "3. 买/卖价侧一键切换，自动重算。",
      "",
      "三、预设弹窗改造",
      "1. 特殊装备图标行 + 强化等级角标，手机端折叠表单。",
      "",
      "四、移动端适配",
      "1. 全站滚动条统一，修复手机侧栏子菜单展开异常。",
      "",
      "五、其他",
      "1. 神龛稀有/精华概率微调（稀有 0.01→0.015、精华 0.02→0.03）。"
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
