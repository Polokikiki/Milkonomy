import { debounce } from "lodash-es"
import { ref } from "vue"
// 自定义 Hook
export function useMemory(key: string, defaultValue: any, delay: number = 500) {
  // 从 localStorage 初始化
  const initialValue = () => {
    try {
      const stored = localStorage.getItem(key)
      if (!stored) return defaultValue
      const parsed = JSON.parse(stored)
      // merge new default fields missing from stored data
      if (defaultValue && typeof defaultValue === "object" && !Array.isArray(defaultValue) && parsed && typeof parsed === "object") {
        return { ...defaultValue, ...parsed }
      }
      return parsed
    } catch {
      return defaultValue
    }
  }

  // 创建响应式变量
  const value = ref(initialValue())
  const saveDebounced = debounce((val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val))
    } catch (e) {
      console.error("LocalStorage 保存失败:", e)
    }
  }, delay)

  watch(value, saveDebounced, { deep: true })

  return value
}
