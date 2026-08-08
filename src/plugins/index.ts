import type { App } from "vue"
import { installElementPlusIcons } from "./element-plus-icons"
import { installSvgIcon } from "./svg-icon"

export function installPlugins(app: App) {
  installElementPlusIcons(app)
  installSvgIcon(app)
}
