/** 画布快捷键绑定：localStorage 持久化，可在「快捷键设置」面板自定义 */
export interface HotkeyBindings {
  /** 按方向切换选中节点（跳到该方向最近的节点） */
  navUp: string
  navDown: string
  navLeft: string
  navRight: string
  /** 删除选中节点 */
  deleteNode: string
  /** 呼出选中节点的快捷菜单（等同右键；无选中=空白菜单） */
  openMenu: string
}

const STORAGE_KEY = "multistep-hotkeys"

export const DEFAULT_HOTKEYS: HotkeyBindings = {
  navUp: "w",
  navDown: "s",
  navLeft: "a",
  navRight: "d",
  deleteNode: "Delete",
  openMenu: "q"
}

export function loadHotkeys(): HotkeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_HOTKEYS }
    const parsed = JSON.parse(raw) as Record<string, string>
    // 旧结构（moveUp/cycle 时代）里 WASD=移动视图；新版 WASD=切换选中节点，语义冲突 → 整体重置
    if ("cycle" in parsed || "moveUp" in parsed) return { ...DEFAULT_HOTKEYS }
    return { ...DEFAULT_HOTKEYS, ...parsed }
  } catch {
    return { ...DEFAULT_HOTKEYS }
  }
}

export function saveHotkeys(b: HotkeyBindings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b))
  } catch {
    // 隐私模式等场景静默失败
  }
}

/** 展示名：ArrowUp→↑、Delete→Del */
export function keyLabelOf(key: string): string {
  const map: Record<string, string> = {
    "ArrowUp": "↑",
    "ArrowDown": "↓",
    "ArrowLeft": "←",
    "ArrowRight": "→",
    "Delete": "Del",
    "Escape": "Esc",
    " ": "Space"
  }
  return map[key] ?? (key.length === 1 ? key.toUpperCase() : key)
}
