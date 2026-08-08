interface PaginationData {
  total?: number
  currentPage?: number
  pageSizes?: number[]
  pageSize?: number
  layout?: string
}

/** 默认的分页参数 */
const DEFAULT_PAGINATION_DATA = {
  total: 0,
  currentPage: 1,
  pageSizes: [10, 20, 50],
  pageSize: 20,
  layout: "total, sizes, prev, pager, next, jumper"
}

/** 分页 Composable */
export function usePagination(initPaginationData: PaginationData = {}, memoryKey?: string) {
  // 尝试从 localStorage 读取已保存的 pageSize
  const loadSavedPageSize = () => {
    if (!memoryKey) return null
    try {
      const saved = localStorage.getItem(memoryKey)
      return saved ? Number.parseInt(saved, 10) : null
    } catch (e) {
      console.error("读取本地存储失败:", e)
      return null
    }
  }

  // 合并分页参数（优先级：本地存储 > 传入参数 > 默认参数）
  const initialData = {
    ...DEFAULT_PAGINATION_DATA,
    ...initPaginationData,
    pageSize: loadSavedPageSize() || initPaginationData.pageSize || DEFAULT_PAGINATION_DATA.pageSize
  }

  const paginationData = reactive(initialData)

  // 监听 pageSize 变化自动保存
  watch(
    () => paginationData.pageSize,
    (newSize) => {
      if (!memoryKey) return
      try {
        localStorage.setItem(memoryKey, String(newSize))
      } catch (e) {
        console.error("保存到本地存储失败:", e)
      }
    },
    { immediate: true } // 初始化时立即保存
  )

  // 改变当前页码
  const handleCurrentChange = (value: number) => {
    paginationData.currentPage = value
  }
  // 改变每页显示条数
  const handleSizeChange = (value: number) => {
    paginationData.pageSize = value
  }

  return { paginationData, handleCurrentChange, handleSizeChange }
}
