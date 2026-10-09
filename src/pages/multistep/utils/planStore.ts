import type { MultistepPlan } from "../types"

/**
 * 配方存取：与「职业装备预设」同一机制——浏览器 localStorage（JSON 序列化）。
 * 并非 cookie，也不是本地文件夹；数据跟随浏览器与站点，清浏览器缓存会丢失。
 * 参考 src/pinia/stores/player.ts 的 PRESETS_KEY 做法。
 */

const RECIPES_KEY = "multistep-recipes"

export function loadRecipes(): MultistepPlan[] {
  try {
    const raw = localStorage.getItem(RECIPES_KEY)
    const list = raw ? (JSON.parse(raw) as MultistepPlan[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** 保存配方：同名覆盖，否则追加 */
export function saveRecipe(plan: MultistepPlan): MultistepPlan[] {
  const list = loadRecipes()
  const idx = list.findIndex(p => p.name === plan.name)
  if (idx >= 0) list[idx] = plan
  else list.push(plan)
  localStorage.setItem(RECIPES_KEY, JSON.stringify(list))
  return list
}

/** 删除配方（按名称） */
export function deleteRecipe(name: string): MultistepPlan[] {
  const list = loadRecipes().filter(p => p.name !== name)
  localStorage.setItem(RECIPES_KEY, JSON.stringify(list))
  return list
}
