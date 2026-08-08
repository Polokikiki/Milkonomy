<div align="center">
  <img alt="logo" width="120" height="120" src="./src/common/assets/images/layouts/logo.jpg">
  <h1>Milkonomy 牛牛经济学</h1>
  <p>银河放置（Milky Way Idle）利润计算与打野工具站</p>
</div>

## 项目介绍

Milkonomy 是一个为放置游戏 银河放置（Milky Way Idle） 打造的利润计算工具站。
它能帮玩家快速判断做什么最赚钱，自动拉取游戏市场实时价格，计算每种生产、强化、采集动作的收益，并提供一整套打野（低成本捡漏装备）辅助工具。

核心功能：

- 利润排行：一键计算所有动作（锻造、制造、烹饪、炼金、采集）的每小时收益并排序
- 逐级制作 / 目标材质：按技能显示材质制作链，筛选从什么材质做到什么材质
- 打野工具全家桶：强化打野、继承打野、挑品打野、超级打野，帮你在市场里捡漏低价可强化装备
- 精确等级 / 等级联动：可动态增删的精确等级筛选，目标等级左右框自动联动约束
- 多语言：简体中文、繁体中文、English

## 在线使用

部署在 GitHub Pages，打开即用，无需安装。

## 技术栈

Vue 3 + TypeScript ｜ Vite ｜ Element Plus ｜ Pinia ｜ Vue Router ｜ UnoCSS + SCSS ｜ pnpm

## 项目结构说明

点进来看这一节就能明白每个文件夹是干嘛的（下方为缩进代码块）：

    milkonomy/
      .github/workflows/     自动部署、数据更新流水线（推代码就自动打包上线）

      public/                静态资源（不打包，原样输出）
        data/                游戏基础数据（物品、配方等 JSON）
        sprites/             游戏图标精灵图
        media/               音频等媒体文件
        favicon.jpg          网站小图标

      scripts/               辅助脚本
        fetch_game_data.py   从游戏抓取最新基础数据
        trans-convert/       翻译转换工具（游戏原文转多语言）
        update-version.ts    自动更新版本号

      src/                   源代码主目录（核心都在这）
        main.ts              程序入口（应用从这里启动）
        App.vue              根组件（整个页面最外层的壳）

        calculator/          核心计算逻辑（整个项目的大脑）
          index.ts           计算总入口
          enhance.ts         强化收益计算
          manufacture.ts     制造收益计算
          alchemy.ts         炼金收益计算
          gather.ts          采集收益计算
          workflow.ts        工作流 / 逐级制作链计算
          utils.ts           计算通用工具函数

        pages/               各个功能页面（一个文件夹等于一个页面）
          dashboard/         首页：利润排行 + 逐级制作筛选
          jungle/            打野工具（强化打野 + 挑品打野 pickout）
          junglest/          超级打野（含继承）
          inherit/           继承打野页
          enhancer/          强化模拟器
          enhancest/         强化模拟器（进阶）
          enhanposer/        强化姿态相关
          manualchemy/       手动炼金
          decompose/         分解计算
          philosopher/       哲人石相关
          burial/            墓地 / 阵亡记录
          valhalla/          英灵殿相关
          sponsor/           赞助页
          changelog/         更新日志页
          error/             报错页（403 / 404）
          redirect/          路由重定向中转页

        common/              公共资源（多个页面共用）
          apis/              数据接口（按功能分文件夹）
            leaderboard/     利润排行 + 逐级制作筛选逻辑
            jungle/          打野数据接口
            price/           市场价格接口
            game/            游戏基础数据接口
            player/          玩家数据接口
          assets/            图片、图标、样式（logo、主题皮肤）
          components/        可复用小组件（搜索框、通知、图标等）
          composables/       组合式函数（缓存、主题、分页等复用逻辑）
          config/            全局配置（公告、开关等）
          constants/         常量定义（缓存键名等）
          utils/             通用工具（格式化、校验、日期等）

        layouts/             页面布局（导航栏、侧边栏、页脚的排版框架）
        locales/             多语言翻译（中 / 繁 / 英）
        pinia/               全局状态管理（跨页面共享的数据）
        plugins/             插件注册（图标、SVG 等）
        router/              路由配置（哪个网址对应哪个页面）

      tests/                 单元测试
      types/                 TypeScript 类型定义

      index.html             网页 HTML 模板（入口页面）
      vite.config.ts         Vite 构建配置
      uno.config.ts          UnoCSS 样式配置
      eslint.config.js       代码规范检查配置
      tsconfig.json          TypeScript 配置
      package.json           项目依赖清单 + 命令脚本
      pnpm-lock.yaml         依赖版本锁定文件

## 本地开发

1. 安装 pnpm（已装可跳过）：npm i -g pnpm
2. 安装项目依赖：pnpm install
3. 本地预览、打包、代码检查：见 package.json 里 scripts 定义的脚本

## 致谢

本项目基于 hyhfish/milkonomy 二次开发，原项目模板来自 luyh7。感谢原作者的开源贡献。

新增 / 优化功能：打野工具全系列（强化、继承、挑品、超级）、精确等级动态筛选、目标等级联动约束、首页逐级制作 / 目标材质筛选。

## 许可

MIT License
