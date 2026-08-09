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
import "virtual:uno.css"
import { useGameStoreOutside } from "./pinia/stores/game"

import locales from "@/locales"

import VueGtag, { trackRouter } from "vue-gtag-next"

// 创建应用实例
const app = createApp(App)

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

app.use(VueGtag, {
  property: {
    id: "G-XHFS0BRE7Y"
  }
})

// 立即挂载 app，数据异步加载
router.isReady().then(() => {
  app.mount("#app")
})
useGameStoreOutside().hydratePersistentData().then(() => useGameStoreOutside().tryFetchData())
