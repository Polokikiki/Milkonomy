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
  id: "v2.9.0",
  message: {
    title: "v2.9.0 更新公告",
    content: [
      "一、新栏目「链条自定义」（测试版）",
      "1. 可视化结点图：把「买什么 → 做什么 → 卖什么」画成一张链路图，自由连线组合多步生产链（制造/炼金/采集可混搭，支持转化循环回流）。",
      "2. 自动配平 + 自动排版：以第一行数量为基准，其余数量按配方与成功率期望自动推平；节点自动分层排版，也可拖动微调。",
      "3. 内置预置高利润配方与演示链，一键读取；支持保存自己的方案，快捷键 / 全屏 / 手机端均已适配。",
      "4. 冲泡配方入图：茶/咖啡类产物可直接作为链条产物参与配平；「自定义价格」与首页同源，手动价在本页同样生效。",
      "",
      "二、链条页口径修复（重要）",
      "1. 链上产出此前未按成功率折算、卖出未计市场税，两处已对齐首页利润榜口径：分解链/转化链的「链上终值」从此更保守也更真实（此前偏高）。",
      "2. 同名产物双条目误并（如分解主产物炼金精华×20 与平凡掉落精华×1.6 被当同一条）：已按条目分开计价，「链条自定义」页同步修复。",
      "3. 已与首页利润榜全量对拍：43 条单步链与首页利润严格相等，725 条分解行全部通过校验；超炼页补充「选优目标=每件净收益」口径说明。",
      "4. 游戏数据精炼物品名由「(R)」改为「★」后词典翻译失效：已加回退兼容，精炼物品在各语言下恢复显示译名。",
      "",
      "三、鸣谢",
      "1. 本期更新由赞助商 Joey 赞助的智谱（GLM）会员提供开发支持，特此鸣谢！",
      "2. 新栏目「链条自定义」基于 gcaxe 的开源项目 milkonomy（MIT 协议）改编而来，感谢原作者的代码分享！"
    ].join("\n")
  },
  link: {
    url: "https://www.milkonomy.top/#/changelog",
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
