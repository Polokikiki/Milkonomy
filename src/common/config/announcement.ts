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
  id: "v2.3.0-moo-card",
  message: {
    title: "v2.3.0 更新公告",
    content: "一、哞卡社区 Buff / 二、数据导出插件同步 / 三、脚本未安装通知 / 四、使用教程"
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
