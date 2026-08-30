# Handoff — Milkonomy 市场税率 2% → 5%（v2.4.0）

**最终状态**：已推送 GitHub。commit `57af1c5`，分支 `main`。
**日期**：2026-08-14

---

## 任务全貌

把 Milkonomy 计算器项目的市场卖出税率从 2% 改成 5%，同步更新文档、版本号、changelog，并修一个 UI 绑定 bug。最终一个原子 commit 推送。

---

## 已完成

### 1. 设计文档勘误（先做）
- 文件：`Desktop/Milkonomy_市场税率5%_安全修改与验证文档_修正版.docx`
- 备份：`...修正版.bak.docx`
- 12 处替换 + 新增 4.6 节，修正：行号 243→242、`taxRate=2`→`taxRate: 2`、伪 import 说明、enhance.ts:404 从"待确认"升级为"一并改"

### 2. 代码（10 文件，commit `57af1c5`）

**税率核心**
| 文件 | 改动 |
|---|---|
| `src/common/constants/market.ts:1` | `SELL_TAX_FACTOR` 0.98 → 0.95 |
| `src/calculator/workflow.ts:51` | 默认参数 `0.98` → `SELL_TAX_FACTOR`（激活此前未使用的伪 import） |
| `src/calculator/enhance.ts` | 顶部 +import、`:404` `* 0.98` → `* SELL_TAX_FACTOR` |
| `src/pages/enhancer/index.vue` | taxRate 2→5、marketTaxRate get、sellTaxFactor、注释 |
| `src/pages/enhancest/index.vue` | taxRate 2→5、marketTaxRate get、两处 sellTaxFactor、3 处 98%→95% 注释/tooltip |
| `src/calculator/index.ts:22,40` | 注释 0.98(2%税)→0.95(5%税) |
| `src/common/apis/leaderboard/type.d.ts:19` | 注释 (2%)→(5%) |

**UI 锁定（用户决策：市场税率锁死，不需要框）**
- `enhancer/index.vue` + `enhancest/index.vue` 的 3 个「税率」`el-input-number` 加 `disabled`（显示 5% 灰色）

**附带 bug 修复（用户发现的）**
- `enhancest/index.vue:767`「溢价率」框绑定错误：原绑 `marketTaxRate`（标签写溢价率但实际是市场税率），改为 `enhancerStore.advancedConfig.taxRate`（真溢价率，和 enhancer 一致），去 disabled、step=1、无 max

**版本管理**
- `package.json` version: `2.2.14` → `2.4.0`
- `src/pages/changelog/index.vue`：新增 v2.4.0 中英双语条目
- `.husky/pre-commit`：移除 `tsx scripts/update-version.ts` 和 `git add package.json` 两行 —— **版本号以后手动管**（用户明确决定）

### 3. 验证（三层全过）
- **静态**：git diff 10 文件 = 计划清单，无夹带
- **残留**：`0.98` 仅剩 TombstoneCard rgba 透明度（已知无关项）；`2%`/`98%`/`taxRate: 2` 清零
- **数学**：100→95、1000→950、12345→11727.75 ✅
- **类型检查**：`vue-tsc --noEmit` exit 0

### 4. 推送
- `git push origin main`：`458bd87..57af1c5`
- 远程：`git@github.com:Polokikiki/Milkonomy.git`

---

## 三个用户决策（驱动了本次设计）

1. **目录**：仅改 `milkonomy-main`（不动 `Milkonomy-fresh` / `Milkonomy-local`）
2. **enhance.ts:404**：本次一并改（核对确认为市场税率，非疑似）
3. **反推公式精度**：保持现状只改数值（不重构 `totalCost *= (1+taxRate/100)`）

后续追加决策：
4. **市场税率 UI**：锁死（disabled），不提供选择框
5. **enhancest:767 溢价率框**：改对绑定（B 方案，绑真溢价率 `advancedConfig.taxRate`）
6. **版本号**：`2.4.0`，且以后版本号手动管（去掉 hook 里的自动脚本）

---

## 遗留事项（未处理，等用户决定）

### 1. 切换预设 bug（已诊断，未修）
**现象**：在 dashboard 等页面切换玩家预设（buff/茶/神龛配置）后，enhancer / enhancest 页的计算结果不刷新。
**根因**（不是缓存）：
- `results` computed 只读 `enhancerStore.config.*`，没读 `usePlayerStore().config`（预设数据所在）
- `EnhanceCalculator` 内部的 `getBuffOf / getPlayerLevelOf / getEnhanceSuccessRatio` 读 player config，但这些是普通函数调用，Vue 追踪不到响应式依赖
- enhancer 页有个 watch 触发 `onSelect`，但 `onSelect` 只改 `enhancementCosts/protectionList`，不改 `currentItem` 引用 → computed 依赖不变 → 不重算
- enhancest 页的 watch 更不完整

**修法**（两选一，未实施）：
- (a) `results` computed 顶部显式读 `usePlayerStore().config` 或 `presetIndex`，强制纳入依赖
- (b) watch 改成监听 `presetIndex`，触发 `currentItem.value = { ...currentItem.value }` 强制重算

**注意**：`enhance.ts` 的 `_maxProfitApproximate` 缓存**不背锅**（每次 new 新实例）。`enhancelate()` 用全局 `getEnhancelateCache`，但只缓存 `actions/protects/targetRate`（和预设无关），`speed/efficiency/exp/actionsPH` 走 `getBuffOf/getPlayerLevelOf` 会随预设变 —— 所以这个 bug 不是缓存失效，是响应式追踪。

### 2. 历史遗留 stash
- `stash@{0}: 9b52c61` — 更早 `2.2.2→2.2.3` 那次的 lint-staged 自动备份，含 150MB `data.json` 改动
- **不是本次造的，建议保留不动**（误删可能丢用户旧工作）

### 3. 其它目录未同步
- `Milkonomy-fresh`（无 git，market.ts 内容相同）— 如要同步可直接 `git apply` 这次 diff
- `Milkonomy-local`（结构完全不同，无 `SELL_TAX_FACTOR`）— 是另一版本，需单独评估

### 4. 运行时层提示
- enhancer/enhancest 的 `taxRate` 持久化在 localStorage，老用户本地可能仍是 2。但**本次把输入框 disabled 了**，所以用户改不了——如果 localStorage 是 2 会显示 2 灰色。要清需手动清 localStorage（DevTools → Application → Local Storage）。

### 5. 公告弹窗未更新
- `src/common/config/announcement.ts` 还是 `v2.2.3-moo-card` 那条（id 没改，老用户不会再看到弹窗）
- 用户明确说"不需要提示"，所以本次没动 announcement.ts
- 如果以后想让所有用户重新看到 v2.4.0 弹窗：改 `id`（如 `v2.4.0-tax-5pct`）+ 改 `title`/`content` 即可

---

## dev server

- 任务 ID：`bp51z6fsn`（后台运行）
- 地址：http://localhost:3333
- 版本号：`2.4.0`（vite 启动横幅已确认 `milkonomy@2.4.0`）
- 验证完了用户会让停

---

## 关键文件参考

- 核心常量：`src/common/constants/market.ts`
- 两个原漏网点：`src/calculator/workflow.ts:51`、`src/calculator/enhance.ts:404`
- 设计文档（已勘误）：`Desktop/Milkonomy_市场税率5%_安全修改与验证文档_修正版.docx`
- changelog：`src/pages/changelog/index.vue` 顶部 v2.4.0 块
- hook 改动：`.husky/pre-commit`（去掉了 update-version.ts 自动版本脚本）

---

## 下一步可选

- 修切换预设 bug（诊断已就绪，等用户点头）
- 重启 dev server（已重启，footer 应显示 2.4.0）
- 清 stash（建议不清）
- 同步到 Milkonomy-fresh（可选，git apply）
