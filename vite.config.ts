/// <reference types="vitest/config" />

import { resolve } from "node:path"
import vue from "@vitejs/plugin-vue"
import vueJsx from "@vitejs/plugin-vue-jsx"
import UnoCSS from "unocss/vite"
import AutoImport from "unplugin-auto-import/vite"
import SvgComponent from "unplugin-svg-component/vite"
import { ElementPlusResolver } from "unplugin-vue-components/resolvers"
import Components from "unplugin-vue-components/vite"
import { defineConfig, loadEnv } from "vite"
import svgLoader from "vite-svg-loader"

// Configuring Vite: https://cn.vite.dev/config
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "") as ImportMetaEnv
  const { VITE_PUBLIC_PATH, VITE_BUILD_MODE } = env
  console.log("VITE_BUILD_MODE:", VITE_BUILD_MODE)

  return {
    // 开发或打包构建时用到的公共基础路径
    base: VITE_PUBLIC_PATH,
    resolve: {
      alias: {
        // @ 符号指向 src 目录
        "@": resolve(__dirname, "src"),
        // @@ 符号指向 src/common 通用目录
        "@@": resolve(__dirname, "src/common"),
        // ~ 符号指向 types 类型目录
        "~": resolve(__dirname, "types")
      }
    },
    // 开发环境服务器配置
    server: {
      // 是否监听所有地址
      host: true,
      // 端口号
      port: 3333,
      // 端口被占用时，是否直接退出
      strictPort: false,
      // 是否自动打开浏览器
      open: true,
      // 反向代理
      proxy: {
        "/api/v1": {
          target: "https://mock.mengxuegu.com/mock/63218b5fb4c53348ed2bc212",
          // 是否为 WebSocket
          ws: false,
          // 是否允许跨域
          changeOrigin: true
        }
      },
      // 是否允许跨域
      cors: true,
      // 预热常用文件，提高初始页面加载速度
      warmup: {
        clientFiles: [
          "./src/layouts/**/*.*",
          "./src/pinia/**/*.*",
          "./src/router/**/*.*"
        ]
      }
    },
    // 构建配置
    build: {
      // 自定义底层的 Rollup 打包配置
      rollupOptions: {
        output: {
          /**
           * @name 分块策略
           * @description 1. 注意这些包名必须存在，否则打包会报错
           * @description 2. 如果你不想自定义 chunk 分割策略，可以直接移除这段配置
           */
          // manualChunks 已移除 —— 手工拆分 Vue/Element 会导致循环依赖，
          // 触发 TDZ 错误：Cannot access 'Mo' before initialization
        }
      },
      // 是否开启 gzip 压缩大小报告，禁用时能略微提高构建性能
      reportCompressedSize: true,
      // 单个 chunk 文件的大小超过 2048kB 时发出警告
      chunkSizeWarningLimit: 2048
    },
    // 混淆器
    esbuild:
      mode === "public"
        ? {
            // 打包构建时移除 console.log
            pure: ["console.log"],
            // 打包构建时移除 debugger
            drop: ["debugger"],
            // 打包构建时移除所有注释
            legalComments: "none"
          }
        : undefined,
    // 插件配置
    plugins: [
      vue(),
      // 支持 JSX、TSX 语法
      vueJsx(),
      // 条件构建插件 - 在公开版本中移除私有代码
      // {
      //   name: "remove-private-code",
      //   transform(code: string, id: string) {
      //     // 只在公开版本构建时处理
      //     if (VITE_BUILD_MODE !== "private") {
      //       // 处理路由文件
      //       if (id.includes("router/index.ts")) {
      //         // 移除私有路由的导入
      //         code = code.replace(
      //           /import\s*\{\s*privateRoutes\s*\}\s*from\s*['".].*routes\/private['"];?\s*/,
      //           ""
      //         )

      //         // 移除私有路由的使用
      //         code = code.replace(
      //           /\/\/\s*PRIVATE_ROUTES_START[\s\S]*?\/\/\s*PRIVATE_ROUTES_END/g,
      //           "// Private routes removed in public build"
      //         )

      //         console.log("Removed private routes from public build")
      //       }

      //       // 处理私有路由文件 - 返回空导出
      //       if (id.includes("routes/private")) {
      //         return "export const privateRoutes = [];"
      //       }

      //       // 处理私有页面文件 - 返回空组件
      //       if (id.includes("/pages/enhancest/")
      //         || id.includes("/pages/junglest/")
      //         || id.includes("/pages/jungle/")
      //         || id.includes("/pages/inherit/")
      //         || id.includes("/pages/decompose/")
      //         || id.includes("/pages/manualchemy/")
      //         || id.includes("/pages/demo/")
      //         || id.includes("/pages/enhanposer/enhanposest")) {
      //         return "export default { render: () => null };"
      //       }
      //     }

      //     return code
      //   }
      // },
      // 支持将 SVG 文件导入为 Vue 组件
      svgLoader({
        defaultImport: "url",
        svgoConfig: {
          plugins: [
            {
              name: "preset-default",
              params: {
                overrides: {
                  // @see https://github.com/svg/svgo/issues/1128
                  removeViewBox: false
                }
              }
            }
          ]
        }
      }),
      // 自动生成 SvgIcon 组件和 SVG 雪碧图
      SvgComponent({
        iconDir: [resolve(__dirname, "src/common/assets/icons")],
        preserveColor: resolve(__dirname, "src/common/assets/icons/preserve-color"),
        dts: true,
        dtsDir: resolve(__dirname, "types/auto")
      }),
      // 原子化 CSS
      UnoCSS(),
      // 自动按需导入 API
      AutoImport({
        imports: ["vue", "vue-router", "pinia", "vue-i18n"],
        dts: "types/auto/auto-imports.d.ts",
        resolvers: [ElementPlusResolver()]
      }),
      // 自动按需导入组件
      Components({
        dts: "types/auto/components.d.ts",
        resolvers: [ElementPlusResolver()]
      })
    ].filter(Boolean),
    // Configuring Vitest: https://cn.vitest.dev/config
    test: {
      include: ["tests/**/*.test.{ts,js}"],
      environment: "happy-dom",
      server: {
        deps: {
          inline: ["element-plus"]
        }
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
    }
  }
})
