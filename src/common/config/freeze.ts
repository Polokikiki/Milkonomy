/**
 * 网站冻结配置
 * 在冻结期间，用户只能访问指定的页面
 */

export interface FreezeConfig {
  enabled: boolean
  startDate: Date
  endDate: Date
  allowedRoutes: string[]
  message: {
    title: string
    content: string
  }
}

export const freezeConfig: FreezeConfig = {
  // 是否启用冻结功能
  enabled: true,

  // 冻结开始时间
  startDate: new Date("2025-10-28T00:00:00"),

  // 冻结结束时间 (12月4日)
  endDate: new Date("2025-11-04T00:00:00"),

  // 冻结期间允许访问的路由名称
  allowedRoutes: ["Valhalla", "Burial", "Feedback", "Sponsor"],

  // 提示信息
  message: {
    title: "暂停服务",
    content: "#暂停公告"
  }
}

/**
 * 检查当前是否在冻结期间
 */
export function isInFreezePeriod(): boolean {
  if (!freezeConfig.enabled) return false

  const now = new Date()
  return now >= freezeConfig.startDate && now < freezeConfig.endDate
}

/**
 * 检查路由是否被允许访问
 */
export function isRouteAllowed(routeName: string | undefined | null): boolean {
  if (!routeName) return false
  return freezeConfig.allowedRoutes.includes(routeName)
}

/**
 * 获取距离重新开放的剩余时间（毫秒）
 */
export function getTimeUntilReopen(): number {
  const now = new Date()
  return Math.max(0, freezeConfig.endDate.getTime() - now.getTime())
}

/**
 * 格式化倒计时显示
 */
export function formatCountdown(milliseconds: number): { days: number, hours: number, minutes: number, seconds: number } {
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  return {
    days,
    hours: hours % 24,
    minutes: minutes % 60,
    seconds: seconds % 60
  }
}
