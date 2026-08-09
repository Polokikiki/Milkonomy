import type { RouteRecordRaw } from "vue-router"
import locale from "@/locales"

const Layouts = () => import("@/layouts/index.vue")
const { t } = locale.global

/**
 * 公开路由配置
 * 这些路由将在公开版本中包含
 */
export const publicRoutes: RouteRecordRaw[] = [
  {
    path: "/redirect",
    component: Layouts,
    meta: {
      hidden: true
    },
    children: [
      {
        path: ":path(.*)",
        component: () => import("@/pages/redirect/index.vue")
      }
    ]
  },
  {
    path: "/403",
    component: () => import("@/pages/error/403.vue"),
    meta: {
      hidden: true
    }
  },
  {
    path: "/404",
    component: () => import("@/pages/error/404.vue"),
    meta: {
      hidden: true
    },
    alias: "/:pathMatch(.*)*"
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/dashboard",
    children: [
      {
        path: "dashboard",
        component: () => import("@/pages/dashboard/index.vue"),
        name: "Dashboard",
        meta: {
          title: t("首页"),
          svgIcon: "dashboard",
          affix: true
        }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/enhancer",
    children: [
      {
        path: "enhancer",
        component: () => import("@/pages/enhancer/index.vue"),
        name: "Enhancer",
        meta: {
          title: t("强化计算"),
          elIcon: "MagicStick",
          affix: true
        }
      }
    ]
  },
{
    path: "/",
    component: Layouts,
    redirect: "/jungle",
    meta: {
      title: t("强化工具"),
      elIcon: "Compass"
    },
    children: [
      {
        path: "jungle",
        component: () => import("@/pages/jungle/index.vue"),
        name: "Jungle",
        meta: {
          title: t("打野工具"),
          affix: false,
          elIcon: "Compass"
        }
      },
      {
        path: "junglerit",
        component: () => import("@/pages/junglest/inherit.vue"),
        name: "junglerit",
        meta: {
          title: t("继承打野工具"),
          affix: false,
          elIcon: "Compass"
        }
      },
      {
        path: "inherit",
        component: () => import("@/pages/inherit/index.vue"),
        name: "inherit",
        meta: {
          title: t("继承"),
          affix: false,
          elIcon: "Compass"
        }
      },
      {
        path: "decompose",
        component: () => import("@/pages/decompose/index.vue"),
        name: "decompose",
        meta: {
          title: t("分解"),
          affix: false,
          elIcon: "Compass"
        }
      },
      {
        path: "pickout",
        component: () => import("@/pages/jungle/pickout.vue"),
        name: "Pickout",
        meta: {
          title: t("捡漏工具"),
          affix: false,
          elIcon: "Compass"
        }
      },
      {
        path: "enhanposer",
        component: () => import("@/pages/enhanposer/index.vue"),
        name: "Enhanposer",
        meta: {
          title: t("强化分解"),
          affix: false,
          elIcon: "Box"
        }
      },
      {
        path: "enhanposest",
        component: () => import("@/pages/enhanposer/enhanposest.vue"),
        name: "Enhanposest",
        meta: {
          title: t("超级强化分解"),
          affix: false,
          elIcon: "Box"
        }
      }
    ]
  },
    {
    path: "/",
    component: Layouts,
    redirect: "/philosopher",
    children: [
      {
        path: "philosopher",
        component: () => import("@/pages/philosopher/index.vue"),
        name: "Philosopher",
        meta: {
          title: t("贤者镜计算"),
          itemIconHrid: "/items/philosophers_mirror",
          affix: false
        }
      }
    ]
  },
]
