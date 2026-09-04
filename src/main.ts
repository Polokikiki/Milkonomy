/* eslint-disable perfectionist/sort-imports */

// core
import { pinia } from "@/pinia"
import { router } from "@/router"
import { installPlugins } from "@/plugins"
import App from "@/App.vue"

// css
import "element-plus/dist/index.css"
import "normalize.css"
import "nprogress/nprogress.css"
import "element-plus/theme-chalk/dark/css-vars.css"
import "@@/assets/styles/index.scss"
import "@@/assets/styles/mobile.scss"
import "virtual:uno.css"
import { useGameStoreOutside } from "./pinia/stores/game"

import locales from "@/locales"

import VueGtag, { trackRouter } from "vue-gtag-next"

// 创建应用实例
const app = createApp(App)

app.config.errorHandler = (err, _instance, info) => {
  console.error("[全局错误]", info, err)
  const detail = err instanceof Error ? err.message : String(err)
  ElMessage.error(`页面发生错误：${info} ${detail}（请刷新重试）`)
}

// 安装插件（全局组件、自定义指令等）
installPlugins(app)

// 国际化
app.use(locales)

trackRouter(router)
// 安装 pinia 和 router
app.use(pinia).use(router)

// 定时获取数据
setInterval(() => {
  useGameStoreOutside().tryFetchData()
}, 300 * 1000)

// 实时价格轮询：仅前台可见时拉取，60s±20% 抖动，回前台立即补拉一次
// （Worker 免费档 10 万请求/天，全量玩家 30s 固定轮询会打爆，边缘缓存之外的第二道保险）
function pollRealtimeLoop() {
  setTimeout(() => {
    if (document.visibilityState === "visible") {
      useGameStoreOutside().pollRealtime()
    }
    pollRealtimeLoop()
  }, 60 * 1000 * (0.8 + Math.random() * 0.4))
}
pollRealtimeLoop()
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") useGameStoreOutside().pollRealtime()
})

app.use(VueGtag, {
  property: {
    id: "G-XHFS0BRE7Y"
  }
})

// 立即挂载 app，数据异步加载
router.isReady().then(() => {
  app.mount("#app")
})
// 隐私浏览器（如 Firefox Focus）下 IndexedDB 可能被拒，水合失败也必须继续拉网络数据
useGameStoreOutside()
  .hydratePersistentData()
  .catch(e => console.error("[缓存水合失败]", e))
  .finally(() => useGameStoreOutside().tryFetchData())
