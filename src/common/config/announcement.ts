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
  id: "v2.4.0-tax-5pct",
  message: {
    title: "v2.4.0 更新公告",
    content: [
      "一、市场税率调整",
      "1. 市场卖出税率由 2% 调整为 5%（税后因子 0.98 → 0.95）。",
      "2. 全链路同步：主计算器、强化分解、超级强化、排行榜、收藏夹五条计算路径统一应用新税率。",
      "",
      "二、强化页面 UI 调整",
      "1. 强化分解 / 超级强化页的「税率」输入框已锁定为 5%（市场税率不再可配置，避免与全局常量冲突）。",
      "2. 修复超级强化页「溢价率」输入框绑定错误：原绑定指向市场税率，已改为真正的溢价率字段。",
      "3. 修复税率输入框残留 max=2 导致显示被钳制为 2% 的问题；贤者计算页税率同步补齐为 5%，旧配置自动迁移。",
      "4. 价格档位跟随游戏补丁细化：加减价档位增量缩小至原来的 1/10（如 1000 金物品 +1 档 = +5）。",
      "5. 修复强化分解 / 超级强化页切换预设后计算结果不刷新的问题。"
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
