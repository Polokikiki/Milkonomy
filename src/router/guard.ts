import type { Router } from "vue-router"
import { setRouteChange } from "@@/composables/useRouteListener"
import { useTitle } from "@@/composables/useTitle"
import { isInFreezePeriod, isRouteAllowed } from "@@/config/freeze"
import NProgress from "nprogress"
import { usePermissionStoreOutside } from "@/pinia/stores/permission"

NProgress.configure({ showSpinner: false })
const { setTitle } = useTitle()

export function registerNavigationGuard(router: Router) {
  // 全局前置守卫
  router.beforeEach(async (to, _from) => {
    NProgress.start()
    usePermissionStoreOutside().setRoutes([])

    // 检查冻结期间的路由访问权限
    if (isInFreezePeriod()) {
      const routeName = to.name as string
      // 如果访问的不是允许的页面，重定向到英灵殿
      if (!isRouteAllowed(routeName)) {
        NProgress.done()
        return { name: "Valhalla" }
      }
    }
  })

  // 全局后置钩子
  router.afterEach((to) => {
    setRouteChange(to)
    setTitle(to.meta.title)
    NProgress.done()
  })
}
