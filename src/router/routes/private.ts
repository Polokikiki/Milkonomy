import type { RouteRecordRaw } from "vue-router"
import locale from "@/locales"

const Layouts = () => import("@/layouts/index.vue")
const { t } = locale.global

/**
 * 私有路由配置
 * 这些路由只会在私有版本中包含
 * 在构建公开版本时，这些路由和对应的页面文件将不会被打包
 */
export const privateRoutes: RouteRecordRaw[] = [
    {
    path: "/",
    component: Layouts,
    redirect: "/enhancest",
    children: [
      {
        path: "enhancest",
        component: () => import("@/pages/enhancest/index.vue"),
        name: "Enhancest",
        meta: {
          title: t("超级强化计算"),
          elIcon: "MagicStick",
          affix: false
        }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/manualchemy",
    children: [
      {
        path: "manualchemy",
        component: () => import("@/pages/manualchemy/index.vue"),
        name: "Manualchemy",
        meta: {
          title: t("制作炼金"),
          svgIcon: "dashboard"
        }
      }
    ]
  },
  {
    path: "/demo",
    component: Layouts,
    redirect: "/demo/unocss",
    name: "Demo",
    meta: {
      title: "示例集合",
      elIcon: "DataBoard",
      hidden: true
    },
    children: [
      {
        path: "unocss",
        component: () => import("@/pages/demo/unocss/index.vue"),
        name: "UnoCSS",
        meta: {
          title: "UnoCSS"
        }
      },
      {
        path: "level2",
        component: () => import("@/pages/demo/level2/index.vue"),
        redirect: "/demo/level2/level3",
        name: "Level2",
        meta: {
          title: "二级路由",
          alwaysShow: true
        },
        children: [
          {
            path: "level3",
            component: () => import("@/pages/demo/level2/level3/index.vue"),
            name: "Level3",
            meta: {
              title: "三级路由",
              keepAlive: true
            }
          }
        ]
      },
      {
        path: "composable-demo",
        redirect: "/demo/composable-demo/use-fetch-select",
        name: "ComposableDemo",
        meta: {
          title: "组合式函数"
        },
        children: [
          {
            path: "use-fetch-select",
            component: () => import("@/pages/demo/composable-demo/use-fetch-select.vue"),
            name: "UseFetchSelect",
            meta: {
              title: "useFetchSelect"
            }
          },
          {
            path: "use-fullscreen-loading",
            component: () => import("@/pages/demo/composable-demo/use-fullscreen-loading.vue"),
            name: "UseFullscreenLoading",
            meta: {
              title: "useFullscreenLoading"
            }
          },
          {
            path: "use-watermark",
            component: () => import("@/pages/demo/composable-demo/use-watermark.vue"),
            name: "UseWatermark",
            meta: {
              title: "useWatermark"
            }
          }
        ]
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/valhalla",
    children: [
      {
        path: "valhalla",
        component: () => import("@/pages/valhalla/index.vue"),
        name: "Valhalla",
        meta: {
          title: t("英灵殿"),
          elIcon: "User",
          affix: false
        }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/burial",
    children: [
      {
        path: "burial",
        component: () => import("@/pages/burial/index.vue"),
        name: "Burial",
        meta: {
          title: t("埋骨地"),
          elIcon: "User",
          affix: false
        }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/feedback",
    children: [
      {
        path: "feedback",
        component: () => import("@/pages/feedback/index.vue"),
        name: "Feedback",
        meta: {
          title: t("建议反馈"),
          elIcon: "ChatLineSquare",
          affix: true
        }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/sponsor",
    children: [
      {
        path: "sponsor",
        component: () => import("@/pages/sponsor/index.vue"),
        name: "Sponsor",
        meta: {
          title: t("打赏"),
          elIcon: "Coin",
          affix: true
        }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/changelog",
    children: [
      {
        path: "changelog",
        component: () => import("@/pages/changelog/index.vue"),
        name: "Changelog",
        meta: {
          title: t("更新日志"),
          elIcon: "Document",
          affix: true
        }
      }
    ]
  },
  {
    path: "/link",
    meta: {
      title: t("相关链接"),
      elIcon: "Link"
    },
    children: [
      {
        path: "https://github.com/luyh7/milkonomy",
        component: () => {},
        name: "Link0",
        meta: {
          title: "Milkonomy Source Code"
        }
      },
      {
        path: "https://www.milkywayidle.com/",
        component: () => {},
        name: "Link1",
        meta: {
          title: "Milky Way Idle"
        }
      },
      {
        path: "https://test-ctmd6jnzo6t9.feishu.cn/docx/KG9ddER6Eo2uPoxJFkicsvbEnCe",
        component: () => {},
        name: "Link2",
        meta: {
          title: "牛牛手册(攻略/插件)"
        }
      },
      {
        path: "https://github.com/holychikenz/MWIApi",
        component: () => {},
        name: "Link3",
        meta: {
          title: "MWI Api"
        }
      },
      {
        path: "https://docs.google.com/spreadsheets/d/13yBy3oQkH5N4y7UJ0Pkux2A8O5xM1ZsVTNAg6qgLEcM/edit?gid=2017655058#gid=2017655058",
        component: () => {},
        name: "Link4",
        meta: {
          title: "MWI Data"
        }
      }

    ]
  }
]
