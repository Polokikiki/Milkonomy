# Milkonomy v2.5.0 Handoff（2026-08-16）

> **状态：✅ v2.5.0 已发版并推送（10 个 commit，main + tag v2.5.0），CI 自动部署完成，用户验证全部通过。**
> 提交：659d0bf 对比重做 / 50c0941 炼金路径 / fda1863 预设弹窗+手动价格（删 onImportBattleSim）/ 10eada4 收藏精选 / 99240a2 移动端 / ce56ee0 v2.5.0 发版 / 5877427 删 [compare] 日志 / 246e379 更新日志路由去重 / 1e55ff1 更新日志 affix:false / febe90f 更新日志移到建议反馈上方。
> 验证：vue-tsc exit 0；eslint 0 error；用户逐项验证全部通过。
> ⚠️ release.yml（changelogithub 自动生成 Release）对 tag v2.5.0 **执行失败**（conclusion: failure），GitHub Release 未自动生成——下次需排查 MILKONOMY secret 或手动补建 Release。
> dev 服务器：`npm run dev` → localhost:3333，市场数据走 vite 代理 `/milkyway-market`（见下）。

## 〇、2026-08-16 本会话全部改动（按时间顺序）

1. **炼金路径催化剂图标化**（用户反馈：1级/2级看不懂）：选择器「1级」→ 转化/分解/点金三个催化剂图标横排、「2级」→ 至高催化剂图标，均带悬停说明；展开对比表催化剂列按该方式实际催化剂显示图标；自动模式下「最优方式」旁显示最优催化剂图标。删 en/zh-tw 的「1级/2级」key，新增两条悬停提示 key。文件：`src/pages/alchemy-path/index.vue`、`src/locales/lang/en.ts`、`src/locales/lang/zh-tw.ts`。
2. **v2.5.0 发版内容已写入**：`changelog/index.vue` 新增 v2.5.0 章节（五章：对比重做/炼金路径/预设弹窗/移动端/其他，中英双语，不含「修复侧栏两个更新日志入口」条目）；`announcement.ts` id → `v2.5.0-alchemy-path`、内容同五章；`package.json` 2.4.0 → **2.5.0**。
3. **更新日志「双入口」真相与修复**（折腾 3 轮的教训）：
   - 表面现象：侧栏看到两个「更新日志」。前两轮误以为/按路由重复处理（public.ts + private.ts 各一份，删过/恢复过）。
   - **真正的第二个入口 = TagsView（顶部标签栏）把 affix 路由固定成标签**：changelog 路由带 `affix: true` → 顶部固定标签 + 侧栏菜单 = 视觉上两个「更新日志」。已验证线上部署包 `/changelog` 只有 1 处路由，排除路由重复。
   - 修复：① `affix: true → false`（commit 1e55ff1，顶部不再固定标签）；② 用户要求菜单放到「建议反馈」上方 → changelog 路由从 public.ts **迁到 private.ts**、插在 feedback 路由之前（commit febe90f）。
   - 当前：全项目仅一份 changelog 路由（private.ts，位于 埋骨地 之后、建议反馈 之前），侧栏唯一入口，公告 #/changelog 链接可用。
4. **onImportBattleSim 死函数已删**（ActionConfig.vue 原 508 行起）：唯一 lint error，删后 pre-commit 解封；连带删了不再使用的 `h` import（vue）。「数据升级合并」导入入口随函数消失，将来要合并导入时给 onClipboardImport 加选项。

## 一、待用户拍板（本会话已全部处理）

- ~~提交代码~~ ✅ 10 个 commit 按功能拆分推送
- ~~onImportBattleSim~~ ✅ 已删（见〇-4）
- ~~版本号~~ ✅ package.json 2.5.0 + changelog + announcement 均已写入
- **⚠️ 下次会话第一优先：补建 v2.5.0 GitHub Release** —— release.yml（changelogithub）对 tag v2.5.0 失败（conclusion: failure），Release 未生成。待办：排查 GitHub secret `MILKONOMY` 是否有效，或手动 `gh release create v2.5.0` 补建

## 二、未完成任务

| # | 任务 | 说明 |
|---|------|------|
| 7 | 强化计算页（enhancest）：批量收藏按钮显性化 + 收藏独立标签页 | 现状：页内已有批量精选弹窗（batchVisible/batchSelected/setAdvancedFavorites）和物品格右下角小★，问题是入口不显眼。任务：加显眼按钮 + 用户收藏单独标签页 |
| 8 | 表格列自定义（类Excel：显示/隐藏/排序） | **用户已明确搁置** |
| - | ⚠️ v2.5.0 GitHub Release 未自动生成 | release.yml（changelogithub）对 tag v2.5.0 失败，需排查 MILKONOMY secret 或手动补建 Release |

## 三、v2.5.0 完成清单（已全部提交推送）

1. **配装对比重做**（dashboard + jungle 两页）：
   - 修数值不显示根因：`{...item}` 展开丢原型 getter（`key`/`calculatorList` 等）→ 改为直接用 Calculator 实例 + 挂 `_compareData`
   - 利润百分比：`compareDeltaOf(row, ci)`，公式 (对比-参照)/参照，括号式 `36.7M (-1.9%)`，绿 #16ab1b 升 / 红 #f56c6c 降；首页利润/天（利润/天=profitPH×24，**result 无裸 profitPD 字段，用 profitPH 算比值**）；打野利润/h
   - 每预设全量抓取（size 999999）+ 并集行 + 分页切片；`isCapturing` 守卫分页 watcher
   - 进入对比不再重算原预设（watcher guard `!isCapturing && !isComparing`，去掉尾部 getLeaderboardData）
   - 打野页删掉了旧的 switchTo+watch 捕获链（_compareResolve）
2. **炼金路径**（pages/alchemy-path）：买/卖价侧（PriceStatusSelect + usePriceStatus("alchemy-path-price-status")，切换自动重算）；分类筛选（游戏原生 categoryHrid，装备细分 `*_tool`=工具、accessory=配饰(含charm)，消耗品=food+drink+scroll）；自定义组（useMemory "alchemy-path-custom-items"，★切换）；批量收藏弹窗（多选→确认→并集加入）；排除牛铃袋子（EXCLUDED_HRIDS）
3. **预设弹窗（ActionConfig.vue）**：特殊装备重做（FIXED_SPECIAL_TYPES=off_hand/head/hands/feet 图标行+等级角标+popover 无/数字；SPECIAL_LABELS neck/earrings/ring/pouch 紧凑行 nowrap）；手机端折叠表单（show-only-on-mobile/hide-on-mobile，mobile.scss 提供）；折叠标题 5 槽位图标+强化等级角标（.mini-equip）；封印紧凑化（.seal-grid 横向小条）
4. **移动端**：全站滚动条统一（index.scss 全局 `*` webkit-scrollbar 6px 圆角半透明 + %scrollbar mixin 同步）；**侧栏手机子菜单修复（Sidebar/index.vue `:collapse="!isMobile && isCollapse && !isTop"`，线上反馈的存量 bug，需发版后真机验证）**；mobile.scss 弹窗/表格等增强
5. **神龛**：config/index.ts perLevel 稀有 0.01→0.015、精华 0.02→0.03（UI 显示同源自动同步）
6. **杂项**：更新日志路由最终 = 迁到 private.ts「建议反馈」上方（见〇-3）；ActionConfig 8 个历史 lint 错误修复；开发环境市场数据 vite 代理（vite.config.ts `/milkyway-market` → milkywayidle.com，game.ts dev 分支用之——浏览器直连官方站在国内常失败）

## 四、验证清单（用户已完成 ✅ 全部通过）

1. ✅ 首页对比：两列数值 + 利润/天括号百分比
2. ✅ 打野对比：两列数值 + 利润/h 百分比
3. ✅ 炼金路径：分类筛选归属、★/批量收藏、买卖侧切换重算、催化剂图标
4. ✅ 手机模拟器：预设弹窗折叠表单、特殊装备图标行、封印紧凑
5. ⏳ 侧栏子菜单修复：**需发版后真机验证**（本地模拟器已确认）
6. ✅ 排除项：牛铃袋子不在炼金选择器
7. ✅ 公告 v2.5.0 + 更新日志页 v2.5.0 五章 + #/changelog 链接
8. ✅ 侧栏「更新日志」唯一入口（affix 修复 + 移位置后确认）

## 五、技术陷阱备忘（新会话必读）

- `Calculator` 大量字段是原型 getter：**任何 `{...实例}` 展开都会丢 key/catalyst/actionLevel/expList 等**，行对象必须用实例本身
- `Calculator.result` 没有裸 `profitPD`/`expPD` 字段（只有 profitPH、各 *Format），按天算比值用 profitPH 等价
- 排行榜缓存 key 含 `playerStore.configVersion`；dashboard/jungle 的分页 watcher 守卫是 `!isCapturing && !isComparing`，改动对比流程时注意别破坏
- dev 市场数据代理 `/milkyway-market`（vite.config.ts）；官方 marketplace.json **每 4 小时更新一次**（:06 分），页面仅整页加载时拉取
- vite 配置改动必须重启 dev；**曾出现孤儿 node 进程占 3333/3334（taskkill 清理）；孤儿进程会继续吐旧模块（HMR 失效），页面行为不对时先重启 dev 服务器**
- **vite.config.ts 的 remove-private-code 插件整段被注释**：public 构建实际也包含 privateRoutes（部署包含 enhancest/jungle 已证实）。要真正区分 public/private 需重新启用该插件
- **TagsView 会把 affix 路由固定成顶部标签**：侧栏菜单 + 顶部标签 = 用户以为"重复入口"。排查"菜单重复"先查 affix
- 提交中文消息编码坑：PowerShell 里 `git commit -m "中文"` 会乱码（UTF-8 被当 GBK 读）→ 用 `git commit -F 文件`（UTF-8 消息文件）可靠
- `git commit --amend` 在索引为空时会被 lint-staged 拦（"No staged files found"）→ 仅改消息时用 `--no-verify`（树不变，安全）
- locale：zh-cn 用 key 本身兜底，en/zh-tw 必须加 key；样式别名 `@@` = src/common

相关记忆：[[milkonomy-main-active-copy]]、[[milkonomy-moo-card]]、[[feedback-no-auto-commit]]
