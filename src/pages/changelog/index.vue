<template>
 <div class="changelog-page">
 <!-- ================== v2.2.3 ================== -->
 <template v-if="locale !== 'en'">
 <h2>v2.2.3 -- 2026-08-08</h2>

 <p><strong>一、哞卡社区 Buff</strong></p>
 <ol>
 <li>预设配置新增「哞卡（Moo Card）」社区 Buff，排在首位。</li>
 </ol>

 <p><strong>二、数据导出插件同步</strong></p>
 <ol>
 <li>导出脚本已适配哞卡数据，一键导入即可带哞卡等级。</li>
 <li>安装/更新脚本后刷新页面生效。</li>
 </ol>

 <p><strong>三、脚本未安装通知</strong></p>
 <ol>
 <li>未杀安装导出脚本时，点击「一键导入」弹出下载指引，含直接下载和 GreasyFork 链接。</li>
 </ol>

 <p><strong>四、经验排序</strong></p>
 <ol>
 <li>首页经验/h列新增排序（降序/升序）。</li>
 <li>打野工具经验/h列同步支持排序。</li>
 </ol>
 </template>
 <template v-else>
 <h2>v2.2.3 -- 2026-08-08</h2>

 <p><strong>1. Moo Card Community Buff</strong></p>
 <ol>
 <li>New "Moo Card" community buff added to preset configuration, listed first.</li>
 </ol>

 <p><strong>2. Data Exporter Plugin Sync</strong></p>
 <ol>
 <li>Exporter script now includes moo card data for one-click import.</li>
 <li>Install/update the script and refresh to take effect.</li>
 </ol>

 <p><strong>3. Script Not Installed Notification</strong></p>
 <ol>
 <li>When clicking "One-Click Import" without the exporter script, a download guide pops up.</li>
 </ol>

 <p><strong>4. Experience Sorting</strong></p>
 <ol>
 <li>Dashboard exp/h column now supports sorting (descending/ascending).</li>
 <li>Jungle tool exp/h column also supports sorting.</li>
 </ol>
 </template>
 
<!-- ==================== v2.2.2 ==================== -->
 <template v-if="locale !== 'en'">
 <h2>v2.2.2 — 2026-07-16</h2>

 <p><strong>一、纯净火车修复</strong></p>
 <ol>
 <li>锻造补全制造链木材前缀：锤子、枪正常显示，不再被纯净火车误过滤。</li>
 <li>纯净火车自动排除非材质链装备：护符、探照灯、火把、斗篷/披风。</li>
 <li>制造基础材质修正："木板"→"原木"，匹配游戏实际原料名。</li>
 </ol>

 <p><strong>二、超级强化分解性能优化</strong></p>
 <ol>
 <li>计算结果持久化到本地存储，带市场数据时间戳校验。</li>
 <li>同一批市场数据下打开页面秒开，不再每次重算数百万次循环。</li>
 </ol>

 <p><strong>三、一键导入</strong></p>
 <ol>
 <li>仪表盘新增"一键导入"按钮，从 Tampermonkey 脚本或剪贴板直接导入数据。</li>
 <li>旧的"快速导入数据"按钮已移除，功能整合到顶部按钮栏。</li>
 </ol>
 <p><strong>四、使用教程</strong></p>
 <ol>
 <li>安装脚本（文末链接）→ 刷新利润网和 MilkyWay Idle → 点击"一键导入"即可。</li>
 </ol>
 <p>📥 <a href="https://home.greasyfork.org.cn/zh-hans/info#/zh-CN/scripts/587094/detail" target="_blank" style="color:#409eff">安装脚本</a></p>
 </template>
 <template v-else>
 <h2>v2.2.2 — 2026-07-16</h2>

 <p><strong>1. Pure Train Fixes</strong></p>
 <ol>
 <li>Smithing now collects crafting wood prefixes: hammers and spears display correctly in Pure Train mode.</li>
 <li>Pure Train auto-excludes non-chain gear: charms, beacons, torches, capes/shrouds/cloaks.</li>
 <li>Crafting base material corrected: "Plank" → "Log" to match actual in-game ingredient names.</li>
 </ol>

 <p><strong>2. Super Enhance + Decompose Performance</strong></p>
 <ol>
 <li>Results cached to localStorage with market data timestamp validation.</li>
 <li>Instant page load when market data is unchanged; heavy computation only runs on data refresh.</li>
 </ol>

 <p><strong>3. One-Click Import</strong></p>
 <ol>
 <li>New "一键导入" button on dashboard: imports from Tampermonkey script or clipboard.</li>
 <li>Old "Quick Import" button removed; functionality integrated into top action bar.</li>
 </ol>
 <p><strong>4. How to Use</strong></p>
 <ol>
 <li>Install script (link below) → Refresh Milkonomy + MilkyWay Idle → Click "一键导入".</li>
 </ol>
 <p>📥 <a href="https://home.greasyfork.org.cn/zh-hans/info#/zh-CN/scripts/587094/detail" target="_blank" style="color:#409eff">Import Script</a></p>
 </template>

 <hr />

 <!-- ==================== v2.2.1 ==================== -->
 <template v-if="locale !== 'en'">
 <h2>v2.2.1 — 2026-07-16</h2>

 <p><strong>一、利润网修复</strong></p>
 <ol>
 <li>排行榜缓存修复：切换买/卖价后排行榜价格不再锁死。此前缓存未区分价格模式，切换后仍返回旧数据。</li>
 <li>丛林/打野缓存修复：同上，切换买/卖价后丛林和超级打野页面价格正确刷新。</li>
 <li>制造纯火车修复：开启纯净火车并选择起始材质后不再空白。修复了起始材质过滤只检查链路第一步的 bug。</li>
 <li>制造纯火车护符排除：纯净火车模式下自动排除护符，不再混入非材质链产物。</li>
 <li>「排除装备」功能完善：排除装备时保留多步制作链条，只隐藏单步制造装备项。</li>
 </ol>

 <p><strong>二、材质链改进</strong></p>
 <ol>
 <li>裁缝档位补全：皮革链新增 Lv90，布料链新增 Lv85。</li>
 <li>「全部」模式上限提升：75→95，现在可看到高端档位。</li>
 <li>纯净火车提示文字修正：「黄油、树枝、毛线」→「精通之油、洞察之枝、专精之线」。</li>
 </ol>

 <p><strong>三、商店价格</strong></p>
 <ol>
 <li>新增商店固定售价硬编码兜底（38 个物品），覆盖基础工具/武器（5,000 金币）和实习护符（250,000 金币）。</li>
 </ol>

 <p><strong>四、快速导入数据脚本教程</strong></p>
 <ol>
 <li>左侧栏新增图文教程页面，从脚本安装到数据导入细致教学。</li>
 </ol>

 <p><strong>五、导出脚本更新</strong></p>
 <ol>
 <li>茶叶自动导出：读取每个技能当前喝的茶，茶槽里有就导出，不跳过已过期茶叶。</li>
 <li>修复神龛：读取个人等级而非公会等级。</li>
 <li>房屋等级修正：当没修建房屋时会设置成0级，而非四级。</li>
 </ol>
 </template>
 <template v-else>
 <h2>v2.2.1 — 2026-07-16</h2>

 <p><strong>1. Profit Board Fixes</strong></p>
 <ol>
 <li>Leaderboard cache fix: switching buy/sell price mode no longer locks prices. Previously the cache did not differentiate price modes.</li>
 <li>Jungle/Hunting cache fix: same as above, jungle and super hunting pages now refresh prices correctly.</li>
 <li>Crafting Pure Train fix: no longer shows blank after enabling Pure Train with a starting material. Fixed a bug where tier filtering only checked the first step of the chain.</li>
 <li>Crafting charm exclusion: charms are now auto-excluded in Pure Train mode.</li>
 <li>Exclude Gear improved: multi-step crafting chains are preserved when excluding gear; only single-step crafted items are hidden.</li>
 </ol>

 <p><strong>2. Material Chain Improvements</strong></p>
 <ol>
 <li>Tailoring tiers: Leather chain now has Lv90; Cloth chain now has Lv85.</li>
 <li>"All" mode cap raised: 75 → 95, high-end tiers are now visible.</li>
 <li>Pure Train hint text corrected: "Butter, Branch, Yarn" → "Oil of Mastery, Branch of Insight, Thread of Focus".</li>
 </ol>

 <p><strong>3. Shop Prices</strong></p>
 <ol>
 <li>Added hardcoded shop prices as fallback (38 items), covering basic tools/weapons (5,000 gold) and Apprentice Charm (250,000 gold).</li>
 </ol>

 <p><strong>4. Quick Import Tutorial</strong></p>
 <ol>
 <li>New tutorial page in sidebar with step-by-step guide from script installation to data import.</li>
 </ol>

 <p><strong>5. Export Script Updates</strong></p>
 <ol>
 <li>Tea auto-export: reads each skill's active tea; exports tea from slots without skipping expired teas.</li>
 <li>Shrine fix: reads personal shrine level instead of guild level.</li>
 <li>House level fix: sets to level 0 when no house is built, instead of level 4.</li>
 </ol>
 </template>

 <hr />

 <!-- ==================== v2.2.0 ==================== -->
 <details>
 <summary style="cursor:pointer;font-weight:bold;font-size:18px;margin:16px 0 8px">{{ locale === 'en' ? 'v2.2.0 — 2026-07-15' : 'v2.2.0 — 2026-07-15' }}</summary>
 <div style="padding-left:16px">
 <template v-if="locale !== 'en'">
 <p><strong>一、一键导入数据脚本</strong></p>
 <ol>
 <li>映射修复：护符、背部、身体、腿部及房屋的导入映射已修复，各部位装备均可正确录入。</li>
 <li>批量提取：仓库内高品质装备、身体、腿部、护符支持一次性全量导出，无需逐件操作。</li>
 <li>生活技能提取：适配一键提取生活等级脚本，无需手动逐项录入。</li>
 </ol>
 <p>一键导入脚本：<a href="https://home.greasyfork.org.cn/zh-hans/info#/zh-CN/scripts/587094/detail" target="_blank" style="color:#409eff">安装脚本</a></p>

 <p><strong>二、利润网</strong></p>
 <ol>
 <li>纯净火车：锻造、制造、裁缝新增开关，开启后仅保留基础材料制造链路，战斗掉落及精通之油、洞察之枝、专精之线不纳入计算。</li>
 <li>材质链区分：裁缝支持全部、布料、皮革三种模式独立切换，档位筛选仅在所选材质范围内生效。</li>
 <li>神龛导入：新增神龛数据导入与利润计算支持，补齐原版利润网的缺失模块。</li>
 <li>逐级制作：多步制作链路新增起始材质与终点档位设置按钮，支持自定义链条起止点。</li>
 <li>预设对比：支持同时加载两套预设方案，直观对比不同配置下的利润差异。</li>
 <li>加载优化：页面改为先渲染后加载数据，首次打开不再长时间白屏。</li>
 <li>档位修正：布料档位名称由 "辐光" 更正为 "光辉"。</li>
 <li>版本公告：每版本首次访问弹出更新说明，关闭后本版不再重复显示。</li>
 </ol>

 <p><strong>三、社区功能</strong></p>
 <ol>
 <li>建议反馈：新增反馈页面，支持提交 Bug 报告和功能建议，数据直达维护者。</li>
 <li>中英双语：打赏页面和反馈页面全面支持中英文切换，海外玩家也能用。</li>
 <li>新赞助者：感谢 Laulau01（¥28.88）和 Blue（¥30）的支持！</li>
 </ol>
 <p style="color:#e6a23c">⚠ 请在打赏时留下您的游戏昵称，这很重要！！</p>
 <p style="color:#e6a23c">⚠ 今天打赏的微信名"空"的朋友请来找我认领游戏名称，我暂且将您命名为 Blue。</p>
 </template>
 <template v-else>
 <p><strong>1. One-Click Import Script</strong></p>
 <ol>
 <li>Mapping fixes: charm, back, body, legs, and house import mappings fixed; all equipment slots now import correctly.</li>
 <li>Batch export: high-quality gear, body, legs, and charms in warehouse can be exported in one click.</li>
 <li>Life skill export: one-click life skill level extraction via script; no manual entry needed.</li>
 </ol>
 <p>Import Script: <a href="https://home.greasyfork.org.cn/zh-hans/info#/zh-CN/scripts/587094/detail" target="_blank" style="color:#409eff">Import Script</a></p>

 <p><strong>2. Profit Board</strong></p>
 <ol>
 <li>Pure Train: added toggle for Smithing, Crafting, and Tailoring. When enabled, only base material crafting chains are shown; combat drops and Oils/Branches/Threads are excluded from calculations.</li>
 <li>Material chain separation: Tailoring supports All, Cloth, and Leather modes with independent switching; tier filtering applies only within the selected material type.</li>
 <li>Shrine import: added shrine data import and profit calculation support, filling a gap from the original profit board.</li>
 <li>Step-by-step crafting: multi-step chains now have start material and end tier selection buttons for custom chain ranges.</li>
 <li>Preset comparison: load two preset configurations side by side to compare profit differences visually.</li>
 <li>Loading optimization: pages now render first then load data; no more long white screens on first open.</li>
 <li>Tier name fix: Cloth tier "辐光" corrected to "光辉".</li>
 <li>Version announcement: update notes pop up on first visit per version; dismissed after closing.</li>
 </ol>

 <p><strong>3. Community</strong></p>
 <ol>
 <li>Feedback: new feedback page for submitting bug reports and feature suggestions, delivered directly to the maintainer.</li>
 <li>Bilingual: donation and feedback pages now fully support Chinese/English switching for international players.</li>
 <li>New sponsors: thanks to Laulau01 (¥28.88) and Blue (¥30) for your support!</li>
 </ol>
 <p style="color:#e6a23c">⚠ Please include your in-game nickname when donating — this is important!</p>
 <p style="color:#e6a23c">⚠ The WeChat donor named "空" — please contact me to claim your in-game name. I've temporarily named you Blue.</p>
 </template>
 </div>
 </details>

 <hr />

 <!-- ==================== v2.1.0 ==================== -->
 <details>
 <summary style="cursor:pointer;font-weight:bold;font-size:18px;margin:16px 0 8px">v2.1.0 — 2026-07-15</summary>
 <div style="padding-left:16px">
 <template v-if="locale !== 'en'">
 <p><strong>1. 神龛数据</strong></p>
 <p>导入生活数据时自动识别公会神龛等级，支持五种神龛：力量、节奏、精神、稀有、学者。数据来源于游戏内公会建筑等级，导出脚本自动提取，导入时自动映射填入。</p>
 <p><strong>2. 导入升级</strong></p>
 <p>导入对话框从简单文本框改为完整交互界面。粘贴 JSON 数据后，勾选「数据升级」并通过下拉框选择目标预设，即可一键合并。界面新增提示图标，悬停显示功能说明。</p>
 <p><strong>3. 数据合并</strong></p>
 <p>勾选「数据升级」后导入数据与选中预设自动对比取优。合并规则：装备、技能、房子、神龛取两者最高等级，社区 Buff 使用最新导入数据，预设颜色与封印保持不变。不勾选则按原有逻辑创建新预设。</p>
 <p><strong>4. 修复</strong></p>
 <ul>
 <li>加号按钮在超过 5 个预设后不再消失。</li>
 </ul>
 <p><strong>5. 导出脚本 v1.2.0</strong></p>
 <p><a href="https://home.greasyfork.org.cn/zh-hans/info#/zh-CN/scripts/587094/detail" target="_blank">Milkonomy Data Exporter</a></p>
 <ul>
 <li>根据游戏域名自动适配中英文界面。</li>
 <li>新增神龛数据导出。</li>
 </ul>
 </template>
 <template v-else>
 <p><strong>1. Shrine Data</strong></p>
 <p>Shrine levels are now auto-detected when importing life data, supporting five shrines: Power, Rhythm, Spirit, Rarity, Scholar. Data comes from in-game guild building levels, auto-extracted by the export script and mapped on import.</p>
 <p><strong>2. Import Upgrade</strong></p>
 <p>Import dialog upgraded from a simple text box to a full interactive interface. Paste JSON data, check "Data Upgrade", select a target preset from the dropdown, and merge in one click. Tooltip icons added for feature explanations on hover.</p>
 <p><strong>3. Data Merge</strong></p>
 <p>When "Data Upgrade" is checked, imported data is auto-compared with the selected preset, keeping the best values. Merge rules: equipment, skills, house, and shrine take the highest level from either source; community buffs use the latest import data; preset color and seal remain unchanged. Unchecked creates a new preset as before.</p>
 <p><strong>4. Fixes</strong></p>
 <ul>
 <li>The "+" button no longer disappears when exceeding 5 presets.</li>
 </ul>
 <p><strong>5. Export Script v1.2.0</strong></p>
 <p><a href="https://home.greasyfork.org.cn/zh-hans/info#/zh-CN/scripts/587094/detail" target="_blank">Milkonomy Data Exporter</a></p>
 <ul>
 <li>Auto-adapts UI language (Chinese/English) based on game domain.</li>
 <li>Added shrine data export.</li>
 </ul>
 </template>
 </div>
 </details>

 <hr />

 <!-- ==================== v2.0.0 ==================== -->
 <details>
 <summary style="cursor:pointer;font-weight:bold;font-size:18px;margin:16px 0 8px">v2.0.0 — 2026-07-14</summary>
 <div style="padding-left:16px">
 <template v-if="locale !== 'en'">
 <ul>
 <li>生活数据一键导入（技能、装备、房子、社区 Buff、成就）</li>
 <li>独立油猴导出脚本</li>
 <li>9 个利润页面全部支持预设对比</li>
 <li>商店物品标注来源</li>
 </ul>
 </template>
 <template v-else>
 <ul>
 <li>One-click life data import (skills, equipment, house, community buffs, achievements)</li>
 <li>Standalone Tampermonkey export script</li>
 <li>All 9 profit pages support preset comparison</li>
 <li>Shop items labeled with source</li>
 </ul>
 </template>
 </div>
 </details>
 </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n"
const { locale } = useI18n()
</script>

<style scoped>
.changelog-page {
 max-width: 720px;
 margin: 0 auto;
 padding: 24px;
 line-height: 1.8;
 color: var(--el-text-color-primary);
}
.changelog-page h2 {
 font-size: 20px;
 margin: 24px 0 12px;
 padding-bottom: 8px;
 border-bottom: 1px solid var(--el-border-color);
}
.changelog-page p {
 font-size: 14px;
 color: var(--el-text-color-regular);
}
.changelog-page li {
 font-size: 14px;
 color: var(--el-text-color-regular);
 margin: 4px 0;
}
.changelog-page a {
 color: var(--el-color-primary);
}
.changelog-page hr {
 margin: 24px 0;
 border: none;
 border-top: 1px solid var(--el-border-color);
}
</style>
