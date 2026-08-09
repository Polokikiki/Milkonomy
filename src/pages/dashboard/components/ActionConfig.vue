<script setup lang="ts">
import type { AchievementBuffItem, ActionConfig, ActionConfigItem, CommunityBuffItem, PlayerEquipmentItem, ShrineBuffItem, ShrineType } from "@/pinia/stores/player"
import type { AchievementTier, Action, CommunityBuff, Equipment, ItemDetail } from "~/game"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { Plus } from "@element-plus/icons-vue"
import { ElMessageBox } from "element-plus"
import { h } from "vue"
import { getAchievementTierDetailOf, getCommunityBuffDetailOf, getPersonalBuffDetailOf } from "@/common/apis/game"
import { getEquipmentListOf, getSealList, getSpecialEquipmentListOf, getTeaListOf, getToolListOf, setActionConfigApi } from "@/common/apis/player"
import { useTheme } from "@/common/composables/useTheme"
import { DEFAULT_ACHIEVEMENT_BUFF_LIST, DEFAULT_COMMUNITY_BUFF_LIST, DEFAULT_SEPCIAL_EQUIPMENT_LIST, DEFAULT_SHRINE_LIST, SHRINE_CONFIG } from "@/common/config"
import { getEquipmentTypeOf } from "@/common/utils/game"
import { getTrans } from "@/locales"
import { ACHIEVEMENT_TIER_LIST, ACTION_LIST, useGameStore } from "@/pinia/stores/game"

import { defaultActionConfig, usePlayerStore } from "@/pinia/stores/player"

defineProps<{
  actions?: Action[]
  equipments?: Equipment[]
  communityBuffs?: CommunityBuff[]
  achievementBuffs?: AchievementTier[]
}>()
const emit = defineEmits<{
  toggleCompare: []
}>()
// 背部（披风/斗篷）可选项白名单：按技能限制可装备范围
const BACK_EQUIPMENT_HRID_WHITELIST: Record<Action, string[]> = {
  milking: ["/items/gatherer_cape", "/items/gatherer_cape_refined"],
  foraging: ["/items/gatherer_cape", "/items/gatherer_cape_refined"],
  woodcutting: ["/items/gatherer_cape", "/items/gatherer_cape_refined"],

  cheesesmithing: ["/items/artificer_cape", "/items/artificer_cape_refined"],
  crafting: ["/items/artificer_cape", "/items/artificer_cape_refined"],
  tailoring: ["/items/artificer_cape", "/items/artificer_cape_refined"],

  brewing: ["/items/culinary_cape", "/items/culinary_cape_refined"],
  cooking: ["/items/culinary_cape", "/items/culinary_cape_refined"],

  enhancing: ["/items/chance_cape", "/items/chance_cape_refined"],
  alchemy: ["/items/chance_cape", "/items/chance_cape_refined"]
}

function getBackEquipmentListOf(action: Action) {
  const allowed = new Set(BACK_EQUIPMENT_HRID_WHITELIST[action] ?? [])
  return getEquipmentListOf(action, "back")
    .filter(item => allowed.has(item.hrid))
    .sort((a, b) => a.itemLevel - b.itemLevel)
}

const playerStore = usePlayerStore()
const gameStore = useGameStore()
const visible = ref(false)
const actionList = ref<ActionConfigItem[]>([])
const specialList = ref<PlayerEquipmentItem[]>([])
const communityBuffList = ref<CommunityBuffItem[]>([])
const achievementBuffList = ref<AchievementBuffItem[]>([])
const shrineList = ref<ShrineBuffItem[]>([])
const sealList = ref<ReturnType<typeof getSealList>>([])
const seals = ref<string[]>([])
const name = ref("")
const color = ref("")
const currentIndex = ref(0)
function onDialog(config: ActionConfig, index: number) {
  const defaultConfig = defaultActionConfig("", "")
  actionList.value = structuredClone(ACTION_LIST.map((action) => {
    const map = config.actionConfigMap.get(action) ?? defaultConfig.actionConfigMap.get(action)!
    // 如果当前配置没有某些字段，则使用默认配置的字段值
    const defaultMap = defaultConfig.actionConfigMap.get(action)!
    for (const key in defaultMap) {
      const defaultValue = defaultMap[key as keyof ActionConfigItem]
      if (defaultValue !== undefined && map[key as keyof ActionConfigItem] === undefined) {
        map[key as keyof ActionConfigItem] = defaultValue as never
      }
    }
    return {
      ...toRaw(map)
    }
  }))

  specialList.value = structuredClone(DEFAULT_SEPCIAL_EQUIPMENT_LIST.map((item) => {
    return {
      ...toRaw(config.specialEquimentMap.get(item.type) ?? defaultConfig.specialEquimentMap.get(item.type)!)
    }
  }))

  communityBuffList.value = structuredClone(DEFAULT_COMMUNITY_BUFF_LIST.map((buff) => {
    return {
      ...toRaw(config.communityBuffMap.get(buff.type) ?? defaultConfig.communityBuffMap.get(buff.type)!)
    }
  }))

  achievementBuffList.value = structuredClone(DEFAULT_ACHIEVEMENT_BUFF_LIST.map((buff) => {
    return {
      ...toRaw(config.achievementBuffMap.get(buff.type) ?? defaultConfig.achievementBuffMap.get(buff.type)!)
    }
  }))

  shrineList.value = structuredClone(DEFAULT_SHRINE_LIST.map((buff) => {
    return {
      ...toRaw(config.shrineBuffMap.get(buff.type) ?? defaultConfig.shrineBuffMap.get(buff.type)!)
    }
  }))

  sealList.value = getSealList()
  seals.value = Array.isArray(config.seals)
    ? [...config.seals]
    : typeof (config as ActionConfig & { seal?: string }).seal === "string"
      ? [(config as ActionConfig & { seal?: string }).seal!]
      : []
  name.value = config.name!
  color.value = config.color!
  visible.value = true
  currentIndex.value = index
}

function onSelect(config: ActionConfig, index: number) {
  // 点击非当前预设：直接切换
  if (index === playerStore.presetIndex) {
    onDialog(config, index)
  } else {
    playerStore.switchTo(index)
  }
}

function onAdd() {
  const index = playerStore.presets.length
  onDialog(defaultActionConfig(t("{0}新预设", [index]), "#90ee90"), index)
}

function constructActionConfig() {
  const config = {
    actionConfigMap: new Map<Action, ActionConfigItem>(),
    specialEquimentMap: new Map<Equipment, PlayerEquipmentItem>(),
    communityBuffMap: new Map<CommunityBuff, CommunityBuffItem>(),
    achievementBuffMap: new Map<AchievementTier, AchievementBuffItem>(),
    shrineBuffMap: new Map<ShrineType, ShrineBuffItem>(),
    seals: [...seals.value],
    name: name.value,
    color: color.value
  }

  for (const item of actionList.value) {
    config.actionConfigMap.set(item.action, toRaw(item))
  }

  for (const item of specialList.value) {
    config.specialEquimentMap.set(item.type, toRaw(item))
  }

  for (const item of communityBuffList.value) {
    config.communityBuffMap.set(item.type, toRaw(item))
  }

  for (const item of achievementBuffList.value) {
    config.achievementBuffMap.set(item.type, toRaw(item))
  }

  for (const item of shrineList.value) {
    config.shrineBuffMap.set(item.type, toRaw(item))
  }

  return config
}

// 标记：关闭弹窗时是否跳过“点外部自动保存”逻辑
const skipAutoSave = ref(false)

function doSave(): boolean {
  try {
    const config = constructActionConfig()
    setActionConfigApi(config, currentIndex.value)
    return true
  } catch (e: any) {
    ElMessage.error(e.message)
    return false
  }
}

function onConfirm() {
  if (doSave()) {
    skipAutoSave.value = true
    visible.value = false
  }
}

// 点击弹窗外部遮罩 / ESC 关闭时：自动保存
function onDialogClose() {
  if (skipAutoSave.value) {
    // 由保存/删除按钮触发的关闭，不重复保存
    skipAutoSave.value = false
    return
  }
  // 点外部关闭 = 保存
  doSave()
}

// 弹窗内删除当前预设
function onDeleteInDialog() {
  // 新增中的预设（尚未保存，不在列表里）直接关闭
  if (currentIndex.value >= playerStore.presets.length) {
    skipAutoSave.value = true
    visible.value = false
    return
  }
  if (playerStore.presets.length <= 1) {
    ElMessage.warning(t("至少保留一个预设"))
    return
  }
  ElMessageBox.confirm(t("确定删除该预设吗？"), "", {
    confirmButtonText: t("确定"),
    cancelButtonText: t("取消"),
    type: "warning"
  }).then(() => {
    playerStore.removePreset(currentIndex.value)
    skipAutoSave.value = true
    visible.value = false
  }).catch(() => {
    // 取消删除
  })
}

const menuVisible = ref(false)
const top = ref(0)
const left = ref(0)

// 拖拽状态
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(index: number, e: DragEvent) {
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", String(index))
  }
}

function onDragOver(index: number) {
  if (dragIndex.value !== null && dragIndex.value !== index) {
    dragOverIndex.value = index
  }
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(index: number) {
  if (dragIndex.value !== null && dragIndex.value !== index) {
    playerStore.reorderPresets(dragIndex.value, index)
  }
  dragIndex.value = null
  dragOverIndex.value = null
}
const menuPreset = ref<ActionConfig>()
const menuIndex = ref(0)

function openMenu(preset: ActionConfig, index: number, e: MouseEvent) {
  const menuMinWidth = 100
  // 当前页面宽度
  const offsetWidth = document.body.offsetWidth
  // 面板的最大左边距
  const maxLeft = offsetWidth - menuMinWidth
  // 面板距离鼠标指针的距离
  const left15 = e.clientX + 10
  left.value = left15 > maxLeft ? maxLeft : left15
  top.value = e.clientY
  // 显示面板
  menuVisible.value = true
  menuIndex.value = index
  // 更新当前正在右键操作的标签页
  menuPreset.value = preset
}

/** 关闭右键菜单面板 */
function closeMenu() {
  menuVisible.value = false
}

watch(menuVisible, (value) => {
  value ? document.body.addEventListener("click", closeMenu) : document.body.removeEventListener("click", closeMenu)
})

function onCopy() {
  onDialog(menuPreset.value!, playerStore.presets.length)
}

function onRemove() {
  ElMessageBox.confirm(t("确定删除该预设吗？"), "", {
    confirmButtonText: t("确定"),
    cancelButtonText: t("取消"),
    type: "warning"
  }).then(() => {
    playerStore.removePreset(menuIndex.value)
  }).catch(() => {
    // 取消删除
  })
}

const { t } = useI18n()
const { activeThemeName } = useTheme()

// 弹窗手动复制导入
function onImport() {
  ElMessageBox.prompt(t("请粘贴导出的预设配置"), t("导入"), {
    confirmButtonText: t("确定"),
    cancelButtonText: t("取消"),
    inputPattern: /^\s*\{.*\}\s*$/,
    inputErrorMessage: t("请输入正确的JSON格式")
  }).then(({ value }) => {
    try {
      const obj = JSON.parse(value)
      if (!obj.name || !obj.color || !obj.actionConfigMap || !obj.specialEquimentMap) {
        throw new Error(t("无效的预设配置"))
      }
      const normalizeSeal = (input: unknown): string | undefined => {
        if (typeof input !== "string") {
          return undefined
        }
        const value = input.trim()
        if (!value) {
          return undefined
        }
        if (value.startsWith("/items/seal_of_")) {
          return value
        }
        const hit = getSealList().find(item =>
          item.hrid === value
          || item.hrid.split("/").pop() === value
          || item.name === value
          || getTrans(item.name) === value
        )
        return hit?.hrid
      }
      const normalizeSeals = (input: unknown): string[] => {
        const source = Array.isArray(input) ? input : typeof input === "string" ? [input] : []
        const result = source
          .map(normalizeSeal)
          .filter((item): item is string => Boolean(item))
        return [...new Set(result)]
      }
      const normalizeAchievementTier = (input: unknown): AchievementTier | undefined => {
        if (typeof input !== "string") {
          return undefined
        }
        const value = input.trim()
        if (!value) {
          return undefined
        }
        const key = value.startsWith("/achievement_tiers/")
          ? value.split("/").pop()
          : value
        if (key && (ACHIEVEMENT_TIER_LIST as readonly string[]).includes(key)) {
          return key as AchievementTier
        }
        for (const tier of ACHIEVEMENT_TIER_LIST) {
          const detail = getAchievementTierDetailOf(`/achievement_tiers/${tier}`)
          if (!detail) {
            continue
          }
          if (detail.name === value || getTrans(detail.name) === value) {
            return tier
          }
        }
        return undefined
      }
      const normalizeAchievementBuffMap = (input: unknown) => {
        const entries = Object.entries((input || {}) as Record<string, AchievementBuffItem>)
        const result = new Map<AchievementTier, AchievementBuffItem>()
        for (const [rawKey, rawValue] of entries) {
          const tier = normalizeAchievementTier(rawKey)
          if (!tier) {
            continue
          }
          result.set(tier, {
            type: tier,
            enabled: Boolean(rawValue?.enabled)
          })
        }
        return result
      }
      const config: ActionConfig = {
        name: obj.name,
        color: obj.color,
        seals: normalizeSeals(obj.seals || obj.seal),
        actionConfigMap: new Map<Action, ActionConfigItem>(Object.entries(obj.actionConfigMap) as [Action, ActionConfigItem][]),
        specialEquimentMap: new Map<Equipment, PlayerEquipmentItem>(Object.entries(obj.specialEquimentMap) as [Equipment, PlayerEquipmentItem][]),
        communityBuffMap: new Map<CommunityBuff, CommunityBuffItem>(Object.entries(obj.communityBuffMap) as [CommunityBuff, CommunityBuffItem][]),
        achievementBuffMap: normalizeAchievementBuffMap(obj.achievementBuffMap),
        shrineBuffMap: new Map(Object.entries(obj.shrineBuffMap || {}) as [ShrineType, ShrineBuffItem][])
      }
      onDialog(config, playerStore.presets.length)
    } catch (e) {
      console.error(e)
      ElMessage.error(t("无效的预设配置"))
    }
  }).catch(() => {
    // 取消导入
  })
}

// 复制到剪贴板
function onExport() {
  const config = constructActionConfig()
  const json = JSON.stringify({
    name: config.name,
    color: config.color,
    seals: config.seals,
    actionConfigMap: Object.fromEntries(config.actionConfigMap.entries()),
    specialEquimentMap: Object.fromEntries(config.specialEquimentMap.entries()),
    communityBuffMap: Object.fromEntries(config.communityBuffMap.entries()),
    achievementBuffMap: Object.fromEntries(config.achievementBuffMap.entries()),
    shrineBuffMap: Object.fromEntries(config.shrineBuffMap.entries())
  })
  navigator.clipboard.writeText(json).then(() => {
    ElMessage.success(t("已复制到剪贴板"))
  }).catch(() => {
    ElMessage.error(t("复制失败，请检查浏览器权限设置"))
  })
}

// 战斗模拟器数据导入
const HOUSE_ROOM_TO_ACTION: Record<string, Action> = {
  dairy_barn: "milking",
  garden: "foraging",
  log_shed: "woodcutting",
  forge: "cheesesmithing",
  workshop: "crafting",
  sewing_parlor: "tailoring",
  kitchen: "cooking",
  brewery: "brewing",
  laboratory: "alchemy",
  observatory: "enhancing"
}

// 完整数据导入（战斗模拟器 / Milkonomy Exporter 两种格式）
const SKILL_HRID_TO_ACTION: Record<string, Action> = {
  "/skills/milking": "milking",
  "/skills/foraging": "foraging",
  "/skills/woodcutting": "woodcutting",
  "/skills/cheesesmithing": "cheesesmithing",
  "/skills/crafting": "crafting",
  "/skills/tailoring": "tailoring",
  "/skills/cooking": "cooking",
  "/skills/brewing": "brewing",
  "/skills/alchemy": "alchemy",
  "/skills/enhancing": "enhancing"
}

const COMMUNITY_BUFF_HRID_TO_TYPE: Record<string, CommunityBuff> = {
  "/community_buff_types/moo_card": "moo_card",
  "/community_buff_types/experience": "experience",
  "/community_buff_types/gathering_quantity": "gathering_quantity",
  "/community_buff_types/production_efficiency": "production_efficiency",
  "/community_buff_types/enhancing_speed": "enhancing_speed"
}

// 检查装备是否对某个技能生效
function doesEquipmentApply(itemHrid: string | undefined, action: Action): boolean {
  if (!itemHrid) return false
  const gd = useGameStore().gameData
  if (!gd) return true // 数据未加载时放行，避免影响导入
  const item = gd.itemDetailMap[itemHrid]
  if (!item?.equipmentDetail?.noncombatStats) return false
  return Object.keys(item.equipmentDetail.noncombatStats).some(key => key.includes(action))
}

// 一键导入（从 localStorage 或剪贴板读取）
async function onClipboardImport() {
  try {
    // 1. 从 localStorage 读取 Tampermonkey 写入的数据
    let text = localStorage.getItem("milkonomy_last_export") || ""

    // 2. 备选：读剪贴板
    if (!text || !text.trim()) {
      try {
        text = await navigator.clipboard.readText()
      } catch (_) {}
    }

    if (!text || !text.trim()) {
      ElMessageBox.alert("<p>检测到未安装数据导出脚本。</p><p style=\"margin-top:8px\">📥 <a href=\"https://home.greasyfork.org.cn/zh-hans/info#/zh-CN/scripts/587094/detail\" target=\"_blank\">安装脚本</a></p><p style=\"margin-top:8px;color:#909399\">安装后刷新 MilkyWay Idle 页面，再回利润网点「一键导入」。</p>", t("未安装脚本"), { dangerouslyUseHTMLString: true, confirmButtonText: t("知道了") }); return
    }
    const data = JSON.parse(text.trim())
    if (!data.skills || data.version !== 1) {
      ElMessage.error(t("数据格式无效")); return
    }
    processImportData(text.trim(), false)
    ElMessage.success(t("已导入"))
  } catch (e: any) {
    ElMessage.error(t("导入失败"))
    console.error(e)
  }
}

function onImportBattleSim() {
  let textareaValue = ""
  let shouldMerge = false
  let mergeTargetIndex = playerStore.presetIndex

  const presetOptions = playerStore.presets.map((p, i) => {
    return h("option", { value: String(i), selected: i === mergeTargetIndex }, p.name || (`预设 ${i + 1}`))
  })

  const msgVNode = h("div", { style: "display:flex;flex-direction:column;gap:8px;width:100%" }, [
    h("span", { style: "font-size:14px" }, t("请粘贴导出的JSON数据")),
    h("textarea", {
      style: "width:100%;min-height:130px;max-height:170px;border:1px solid var(--el-border-color,#dcdfe6);border-radius:4px;padding:8px;font-size:13px;resize:vertical;background:var(--el-fill-color-blank,#fff);color:var(--el-text-color-primary,#303133);font-family:monospace;box-sizing:border-box",
      placeholder: "{\"version\":1,...}",
      onInput: (e: Event) => {
        textareaValue = (e.target as HTMLTextAreaElement).value
      }
    }),
    h("div", { style: "display:flex;align-items:center;gap:4px" }, [
      h("a", {
        href: "https://home.greasyfork.org.cn/zh-hans/info#/zh-CN/scripts/587094/detail",
        target: "_blank",
        style: "font-size:12px;color:var(--el-color-primary,#409eff);text-decoration:none;white-space:nowrap"
      }, t("Milkonomy Data Exporter 脚本安装")),
      h("span", { style: "font-size:12px;color:var(--el-text-color-secondary,#909399);white-space:nowrap" }, ` : ${t("快速复制生活数据")}`)
    ]),
    h("div", { style: "display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap" }, [
      h("input", {
        type: "checkbox",
        id: "import-merge-check",
        style: "cursor:pointer;accent-color:#16ab1b",
        onChange: (e: Event) => {
          shouldMerge = (e.target as HTMLInputElement).checked
        }
      }),
      h("label", {
        for: "import-merge-check",
        style: "cursor:pointer;font-size:13px;color:var(--el-text-color-regular);white-space:nowrap"
      }, t("数据升级")),
      h("select", {
        style: "border:1px solid var(--el-border-color,#dcdfe6);border-radius:4px;padding:2px 6px;font-size:13px;background:#222;color:#eee;max-width:160px",
        onChange: (e: Event) => {
          mergeTargetIndex = Number((e.target as HTMLSelectElement).value)
        }
      }, presetOptions),
      h("span", {
        style: "color:var(--el-text-color-secondary,#909399);font-size:12px;cursor:help",
        title: t("与选中预设对比，取两者最高等级（装备/技能/房子/神龛）。社区Buff使用最新数据。不勾选则创建新预设。")
      }, "ⓘ")
    ])
  ])

  ElMessageBox({
    title: t("导入生活数据"),
    message: msgVNode,
    showCancelButton: true,
    confirmButtonText: t("确定"),
    cancelButtonText: t("取消"),
    customClass: "import-data-dialog",
    beforeClose: (action: string, _instance: any, done: () => void) => {
      if (action === "confirm") {
        const value = textareaValue.trim()
        if (!value) {
          ElMessage.warning(t("请输入数据"))
          return
        }
        try {
          JSON.parse(value)
        } catch {
          ElMessage.error(t("请输入正确的JSON格式"))
          return
        }
        done()
        processImportData(value, shouldMerge, shouldMerge ? mergeTargetIndex : undefined)
        return
      }
      done()
    }
  }).catch(() => {})
}

function processImportData(jsonStr: string, shouldMerge: boolean, mergeTargetIndex?: number) {
  try {
    const data = JSON.parse(jsonStr)
    const defaultConfig = defaultActionConfig("", "")
    let actionConfigMap: Map<Action, ActionConfigItem>
    let useDefaults = true
    let name: string
    let color: string
    let communityBuffMap = new Map(defaultConfig.communityBuffMap)
    let shrineBuffMap = new Map(defaultConfig.shrineBuffMap)

    // ====== 构建装备映射（两种格式共用） ======
    const equipMap: Record<string, { itemHrid: string, enhancementLevel: number }> = {}

    // ====== 格式检测 ======
    if (data.skills && data.version === 1) {
      // ---- Milkonomy Exporter 格式（完整数据） ----
      name = data.name || t("完整导入")
      color = "#16ab1b"
      useDefaults = false

      for (const [locHrid, eq] of Object.entries(data.equipment || {})) {
        const loc = (locHrid as string).split("/").pop()
        const e = eq as any
        if (loc) equipMap[loc] = { itemHrid: e.hrid || "", enhancementLevel: e.enhanceLevel || 0 }
      }

      // 从仓库库存自动填入装备
      const inventoryMap = (data.inventoryMap || {}) as Record<string, number>
      const hasIv = Object.keys(inventoryMap).length > 0
      const pickBest = (candidates: ItemDetail[]): ItemDetail | null => {
        if (!hasIv || !candidates.length) return null
        const owned = candidates.filter(c => typeof inventoryMap[c.hrid] === "number")
        if (!owned.length) return null
        owned.sort((a, b) => (inventoryMap[b.hrid] || 0) - (inventoryMap[a.hrid] || 0) || b.itemLevel - a.itemLevel)
        return owned[0]
      }
      if (hasIv) {
        // 工具：按 action 扫描仓库取最佳
        for (const action of ACTION_LIST) {
          const toolKey = `${action}_tool`
          const best = pickBest(getToolListOf(action))
          if (best) equipMap[toolKey] = { itemHrid: best.hrid, enhancementLevel: inventoryMap[best.hrid] || 0 }
        }
        // 特殊装备：仓库取最佳
        for (const se of DEFAULT_SEPCIAL_EQUIPMENT_LIST) {
          const best = pickBest(getSpecialEquipmentListOf(se.type))
          if (best) equipMap[se.type] = { itemHrid: best.hrid, enhancementLevel: inventoryMap[best.hrid] || 0 }
        }
      }

      // 建立按动作分类的装备候选列表（身体/腿部/护符/披风 各有不同动作适用）
      const bodyByAction: Record<string, ItemDetail[]> = {}
      const legsByAction: Record<string, ItemDetail[]> = {}
      const charmByAction: Record<string, ItemDetail[]> = {}
      const backByAction: Record<string, ItemDetail[]> = {}
      for (const item of Object.values(gameStore.gameData!.itemDetailMap)) {
        if (!item.equipmentDetail?.noncombatStats) continue
        const eqType = getEquipmentTypeOf(item)
        if (eqType === "body") {
          for (const action of ACTION_LIST) {
            if (doesEquipmentApply(item.hrid, action)) {
              bodyByAction[action] ??= []; bodyByAction[action].push(item)
            }
          }
        } else if (eqType === "legs") {
          for (const action of ACTION_LIST) {
            if (doesEquipmentApply(item.hrid, action)) {
              legsByAction[action] ??= []; legsByAction[action].push(item)
            }
          }
        } else if (eqType === "charm") {
          for (const action of ACTION_LIST) {
            if (doesEquipmentApply(item.hrid, action)) {
              charmByAction[action] ??= []; charmByAction[action].push(item)
            }
          }
        } else if (eqType === "back") {
          for (const action of ACTION_LIST) {
            if (doesEquipmentApply(item.hrid, action)) {
              backByAction[action] ??= []; backByAction[action].push(item)
            }
          }
        }
      }

      // 技能等级映射
      const skillLevels: Partial<Record<Action, number>> = {}
      for (const [skillHrid, level] of Object.entries(data.skills || {})) {
        const action = SKILL_HRID_TO_ACTION[skillHrid as string]
        if (action && typeof level === "number") skillLevels[action] = level
      }

      // 房子映射
      const houseLevels: Partial<Record<Action, number>> = {}
      for (const [roomHrid, level] of Object.entries(data.houses || {})) {
        const room = (roomHrid as string).split("/").pop()
        const action = HOUSE_ROOM_TO_ACTION[room!]
        if (action && typeof level === "number") houseLevels[action] = level as number
      }

      // 社区Buff
      communityBuffMap = new Map<CommunityBuff, CommunityBuffItem>()
      for (const [buffHrid, level] of Object.entries(data.communityBuffs || {})) {
        const type = COMMUNITY_BUFF_HRID_TO_TYPE[buffHrid as string]
        if (type && typeof level === "number") {
          const existing = (defaultConfig.communityBuffMap.get(type)!)
          communityBuffMap.set(type, {
            type,
            hrid: existing.hrid,
            level: level as number
          })
        }
      }

      // 神龛（映射游戏 guild shrine 名称 → Milkonomy 类型）
      const GUILD_SHRINE_MAP: Record<string, ShrineType> = {
        force: "power",
        tempo: "rhythm",
        spirit: "spirit",
        rare: "rare",
        scholar: "scholar"
      }
      shrineBuffMap = new Map<ShrineType, ShrineBuffItem>()
      for (const [shrineName, level] of Object.entries(data.shrines || {})) {
        const mapped = GUILD_SHRINE_MAP[shrineName as string] || shrineName
        const validTypes = ["power", "rhythm", "spirit", "rare", "scholar"]
        if (validTypes.includes(mapped) && typeof level === "number") {
          shrineBuffMap.set(mapped as ShrineType, {
            type: mapped as ShrineType,
            level: level as number
          })
        }
      }

      // 构建 action config
      actionConfigMap = new Map<Action, ActionConfigItem>()
      for (const action of ACTION_LIST) {
        const defaultItem = defaultConfig.actionConfigMap.get(action)!
        const toolLoc = `${action}_tool`
        const toolData = equipMap[toolLoc]
        const bodyData = equipMap.body
        const legsData = equipMap.legs
        const charmData = equipMap.charm || equipMap.amulet
        const capeData = equipMap.back

        const bestBody = pickBest(bodyByAction[action] || [])
        const bestLegs = pickBest(legsByAction[action] || [])
        const bestCharm = pickBest(charmByAction[action] || [])
        const bestBack = pickBest(backByAction[action] || [])

        const bodyHrid = bodyData?.itemHrid && doesEquipmentApply(bodyData.itemHrid, action)
          ? bodyData.itemHrid
          : bestBody ? bestBody.hrid : (useDefaults ? defaultItem.body.hrid : undefined)
        const bodyLevel = bodyData?.itemHrid && doesEquipmentApply(bodyData.itemHrid, action)
          ? bodyData.enhancementLevel
          : bestBody ? (inventoryMap[bestBody.hrid] || 0) : (useDefaults ? defaultItem.body.enhanceLevel : undefined)

        const legsHrid = legsData?.itemHrid && doesEquipmentApply(legsData.itemHrid, action)
          ? legsData.itemHrid
          : bestLegs ? bestLegs.hrid : (useDefaults ? defaultItem.legs.hrid : undefined)
        const legsLevel = legsData?.itemHrid && doesEquipmentApply(legsData.itemHrid, action)
          ? legsData.enhancementLevel
          : bestLegs ? (inventoryMap[bestLegs.hrid] || 0) : (useDefaults ? defaultItem.legs.enhanceLevel : undefined)

        const charmHrid = charmData?.itemHrid && doesEquipmentApply(charmData.itemHrid, action)
          ? charmData.itemHrid
          : bestCharm ? bestCharm.hrid : (useDefaults ? defaultItem.charm.hrid : undefined)
        const charmLevel = charmData?.itemHrid && doesEquipmentApply(charmData.itemHrid, action)
          ? charmData.enhancementLevel
          : bestCharm ? (inventoryMap[bestCharm.hrid] || 0) : (useDefaults ? defaultItem.charm.enhanceLevel : undefined)

        const capeHrid = capeData?.itemHrid && doesEquipmentApply(capeData.itemHrid, action)
          ? capeData.itemHrid
          : bestBack ? bestBack.hrid : undefined
        const capeLevel = capeData?.itemHrid && doesEquipmentApply(capeData.itemHrid, action)
          ? capeData.enhancementLevel
          : bestBack ? (inventoryMap[bestBack.hrid] || 0) : undefined

        actionConfigMap.set(action, {
          action,
          playerLevel: skillLevels[action] ?? defaultItem.playerLevel,
          tool: {
            type: `${action}_tool`,
            hrid: toolData?.itemHrid ?? (useDefaults ? defaultItem.tool.hrid : undefined),
            enhanceLevel: toolData?.enhancementLevel ?? (useDefaults ? defaultItem.tool.enhanceLevel : undefined)
          },
          body: { type: "body", hrid: bodyHrid, enhanceLevel: bodyLevel },
          legs: { type: "legs", hrid: legsHrid, enhanceLevel: legsLevel },
          back: (capeHrid || bestBack)
            ? {
                ...defaultItem.back,
                hrid: capeHrid || bestBack!.hrid,
                enhanceLevel: capeLevel ?? (bestBack ? (inventoryMap[bestBack.hrid] || 0) : undefined)
              }
            : { ...defaultItem.back },
          charm: { type: "charm", hrid: charmHrid, enhanceLevel: charmLevel },
          houseLevel: houseLevels[action] ?? 0,
          tea: ((data.actionTeas && (data.actionTeas as Record<string, string[]>)[action]) || []).length > 0
            ? (data.actionTeas as Record<string, string[]>)[action]
            : structuredClone(defaultItem.tea)
        })
      }
    } else if (data.player?.equipment) {
      // ---- 战斗模拟器格式（旧版兼容） ----
      name = t("战斗导入")
      color = "#ff4500"
      useDefaults = true

      for (const eq of data.player.equipment) {
        const loc = eq.itemLocationHrid?.split("/").pop()
        if (loc) equipMap[loc] = { itemHrid: eq.itemHrid, enhancementLevel: eq.enhancementLevel || 0 }
      }

      const playerLevel = Math.max(
        data.player.magicLevel || 1,
        data.player.defenseLevel || 1,
        data.player.intelligenceLevel || 1,
        data.player.meleeLevel || 1,
        data.player.rangedLevel || 1,
        data.player.attackLevel || 1,
        data.player.staminaLevel || 1
      )

      const houseLevels: Partial<Record<Action, number>> = {}
      if (data.houseRooms) {
        for (const [roomHrid, level] of Object.entries(data.houseRooms)) {
          const room = (roomHrid as string).split("/").pop()
          const action = HOUSE_ROOM_TO_ACTION[room!]
          if (action && typeof level === "number") houseLevels[action] = level as number
        }
      }

      actionConfigMap = new Map<Action, ActionConfigItem>()
      for (const action of ACTION_LIST) {
        const defaultItem = defaultConfig.actionConfigMap.get(action)!
        const toolLoc = `${action}_tool`
        const toolData = equipMap[toolLoc]
        const bodyData = equipMap.body; const capeData = equipMap.back
        const legsData = equipMap.legs
        const charmData = equipMap.charm || equipMap.amulet

        actionConfigMap.set(action, {
          action,
          playerLevel,
          tool: {
            type: `${action}_tool`,
            hrid: toolData?.itemHrid ?? (useDefaults ? defaultItem.tool.hrid : undefined),
            enhanceLevel: toolData?.enhancementLevel ?? (useDefaults ? defaultItem.tool.enhanceLevel : undefined)
          },
          body: {
            type: "body",
            hrid: bodyData?.itemHrid && doesEquipmentApply(bodyData.itemHrid, action) ? bodyData.itemHrid : (useDefaults ? defaultItem.body.hrid : undefined),
            enhanceLevel: bodyData?.itemHrid && doesEquipmentApply(bodyData.itemHrid, action) ? bodyData.enhancementLevel : (useDefaults ? defaultItem.body.enhanceLevel : undefined)
          },
          legs: {
            type: "legs",
            hrid: legsData?.itemHrid && doesEquipmentApply(legsData.itemHrid, action) ? legsData.itemHrid : (useDefaults ? defaultItem.legs.hrid : undefined),
            enhanceLevel: legsData?.itemHrid && doesEquipmentApply(legsData.itemHrid, action) ? legsData.enhancementLevel : (useDefaults ? defaultItem.legs.enhanceLevel : undefined)
          },
          back: capeData?.itemHrid && doesEquipmentApply(capeData.itemHrid, action)
            ? {
                ...defaultItem.back,
                hrid: capeData.itemHrid,
                enhanceLevel: capeData.enhancementLevel
              }
            : { ...defaultItem.back },
          charm: {
            type: "charm",
            hrid: charmData?.itemHrid && doesEquipmentApply(charmData.itemHrid, action) ? charmData.itemHrid : (useDefaults ? defaultItem.charm.hrid : undefined),
            enhanceLevel: charmData?.itemHrid && doesEquipmentApply(charmData.itemHrid, action) ? charmData.enhancementLevel : (useDefaults ? defaultItem.charm.enhanceLevel : undefined)
          },
          houseLevel: houseLevels[action] ?? 0,
          tea: ((data.actionTeas && (data.actionTeas as Record<string, string[]>)[action]) || []).length > 0
            ? (data.actionTeas as Record<string, string[]>)[action]
            : structuredClone(defaultItem.tea)
        })
      }
    } else {
      throw new Error("无法识别的数据格式")
    }

    // 计算成就 Buff
    const achievementBuffMap = new Map<AchievementTier, AchievementBuffItem>(defaultConfig.achievementBuffMap)
    const hasTierMap = data.achievementTierMap && typeof data.achievementTierMap === "object" && Object.keys(data.achievementTierMap).length > 0
    if (hasTierMap) {
      // 如果有 tier map，直接读取
      for (const [tierHrid, unlocked] of Object.entries(data.achievementTierMap)) {
        const tier = (tierHrid as string).split("/").pop()
        if (tier && (ACHIEVEMENT_TIER_LIST as readonly string[]).includes(tier)) {
          achievementBuffMap.set(tier as AchievementTier, {
            type: tier as AchievementTier,
            enabled: Boolean(unlocked)
          })
        }
      }
    } else if (data.achievements) {
      // 每个 tier 含一组固定成就，全部完成才激活
      // 先建立 achievementHrid → 是否已经完成的映射
      const completedAchMap: Record<string, boolean> = {}
      let achCompletedCount = 0
      let achTotalCount = 0
      for (const v of Object.values(data.achievements) as any[]) {
        const hrid = v?.achievementHrid
        if (!hrid) continue
        achTotalCount++
        const done = (v === true || v === 1)
          ? true
          : (v && typeof v === "object")
              ? (v.isCompleted === true || v.completed === true)
              : false
        completedAchMap[hrid] = done
        if (done) achCompletedCount++
      }
      // 从游戏数据获取每个成就属于哪个 tier
      const achDetailMap = (gameStore.gameData as any)?.achievementDetailMap
      if (achDetailMap && achTotalCount > 0) {
        // 统计每个 tier 需要几个成就、完成了几个
        const tierReq: Record<string, { total: number, done: number }> = {}
        for (const [hrid, detail] of Object.entries(achDetailMap)) {
          const tierHrid = (detail as any).tierHrid as string | undefined
          if (!tierHrid) continue
          const tier = tierHrid.split("/").pop()!
          tierReq[tier] ??= { total: 0, done: 0 }
          tierReq[tier].total++
          if (completedAchMap[hrid]) tierReq[tier].done++
        }
        for (const [tier, stats] of Object.entries(tierReq)) {
          if ((ACHIEVEMENT_TIER_LIST as readonly string[]).includes(tier)) {
            achievementBuffMap.set(tier as AchievementTier, {
              type: tier as AchievementTier,
              enabled: stats.total > 0 && stats.done >= stats.total
            })
          }
        }
      } else {
        // 没办法读取游戏数据时，按总数估算每个 tier
        const tiers: AchievementTier[] = ["beginner", "novice", "adept", "veteran", "elite", "champion"]
        const countThresholds: number[] = [10, 25, 50, 100, 200, 400]
        for (let i = 0; i < tiers.length; i++) {
          achievementBuffMap.set(tiers[i], {
            type: tiers[i],
            enabled: achCompletedCount >= countThresholds[i]
          })
        }
      }
    }

    // 填充特殊装备（头、脚、手、戒指、项链、耳环、副手、背包）
    const specialEquipMap = new Map<Equipment, PlayerEquipmentItem>(defaultConfig.specialEquimentMap)
    const _specialSlotMap: Record<string, Equipment> = {
      head: "head",
      feet: "feet",
      hands: "hands",
      ring: "ring",
      neck: "neck",
      earrings: "earrings",
      back: "back",
      off_hand: "off_hand",
      pouch: "pouch"
    }
    for (const [loc, equipType] of Object.entries(_specialSlotMap)) {
      const ed = equipMap[loc]
      if (ed?.itemHrid) {
        specialEquipMap.set(equipType, {
          type: equipType,
          hrid: ed.itemHrid,
          enhanceLevel: ed.enhancementLevel
        })
      }
    }

    const config: ActionConfig = {
      name,
      color,
      seals: [],
      actionConfigMap,
      specialEquimentMap: specialEquipMap,
      communityBuffMap,
      achievementBuffMap,
      shrineBuffMap
    }

    // 勾选「数据升级」则与选中预设合并取优
    let presetIndex = playerStore.presets.length
    if (shouldMerge && mergeTargetIndex !== undefined) {
      const existing = playerStore.presets[mergeTargetIndex]

      // 合并各技能配置：取最高等级
      for (const [action, newItem] of config.actionConfigMap) {
        const oldItem = existing.actionConfigMap.get(action)
        if (!oldItem) continue
        newItem.playerLevel = Math.max(newItem.playerLevel, oldItem.playerLevel)
        newItem.houseLevel = Math.max(newItem.houseLevel, oldItem.houseLevel)
        if ((oldItem.tool.enhanceLevel ?? 0) > (newItem.tool.enhanceLevel ?? 0)) {
          newItem.tool.enhanceLevel = oldItem.tool.enhanceLevel
          newItem.tool.hrid = oldItem.tool.hrid
        }
        if ((oldItem.body.enhanceLevel ?? 0) > (newItem.body.enhanceLevel ?? 0)) {
          newItem.body.enhanceLevel = oldItem.body.enhanceLevel
          newItem.body.hrid = oldItem.body.hrid
        }
        if ((oldItem.legs.enhanceLevel ?? 0) > (newItem.legs.enhanceLevel ?? 0)) {
          newItem.legs.enhanceLevel = oldItem.legs.enhanceLevel
          newItem.legs.hrid = oldItem.legs.hrid
        }
        if ((oldItem.charm.enhanceLevel ?? 0) > (newItem.charm.enhanceLevel ?? 0)) {
          newItem.charm.enhanceLevel = oldItem.charm.enhanceLevel
          newItem.charm.hrid = oldItem.charm.hrid
        }
      }

      // 合并特殊装备
      for (const [type, newEq] of config.specialEquimentMap) {
        const oldEq = existing.specialEquimentMap.get(type)
        if (!oldEq) continue
        if ((oldEq.enhanceLevel ?? 0) > (newEq.enhanceLevel ?? 0)) {
          newEq.enhanceLevel = oldEq.enhanceLevel
          newEq.hrid = oldEq.hrid
        }
      }

      // 合并神龛
      for (const [type, newShrine] of config.shrineBuffMap) {
        const oldShrine = existing.shrineBuffMap.get(type)
        if (oldShrine) newShrine.level = Math.max(newShrine.level, oldShrine.level)
      }

      // 成就Buff：任一有则启用
      for (const [tier, newAch] of config.achievementBuffMap) {
        const oldAch = existing.achievementBuffMap.get(tier)
        if (oldAch) newAch.enabled = newAch.enabled || oldAch.enabled
      }

      // 保留原预设的颜色和封印
      config.color = existing.color
      config.seals = existing.seals
      presetIndex = mergeTargetIndex!
    }

    onDialog(config, presetIndex)
    ElMessage.success(t("已导入生活数据，请检查并保存"))
  } catch (e) {
    console.error(e)
    ElMessage.error(t("无效的数据格式"))
  }
}

function isSealEnabled(hrid: string) {
  return seals.value.includes(hrid)
}

function onSealToggle(hrid: string, enabled: boolean) {
  const index = seals.value.indexOf(hrid)
  if (enabled && index === -1) {
    seals.value.push(hrid)
  }
  if (!enabled && index !== -1) {
    seals.value.splice(index, 1)
  }
}

const BUFF_TYPE_TEXT_MAP: Record<string, string> = {
  "/buff_types/action_speed": "行动速度",
  "/buff_types/efficiency": "效率",
  "/buff_types/gathering": "采集",
  "/buff_types/processing": "加工",
  "/buff_types/gourmet": "美食",
  "/buff_types/wisdom": "经验",
  "/buff_types/rare_find": "稀有发现",
  "/buff_types/enhancing_success": "强化成功率"
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : ""
  const text = (value * 100).toFixed(2).replace(/\.?0+$/, "")
  return `${sign}${text}%`
}

function getBuffLabel(typeHrid?: string) {
  if (!typeHrid) {
    return ""
  }
  return BUFF_TYPE_TEXT_MAP[typeHrid] || typeHrid.split("/").pop() || typeHrid
}

function getSealEffect(item: ItemDetail) {
  const personalBuff = item.scrollDetail?.personalBuffTypeHrid
    ? getPersonalBuffDetailOf(item.scrollDetail.personalBuffTypeHrid)?.buff
    : item.consumableDetail?.buffs?.[0]
  if (!personalBuff) {
    return ""
  }
  const ratio = (personalBuff.flatBoost || 0) + (personalBuff.ratioBoost || 0)
  if (!Number.isFinite(ratio)) {
    return ""
  }
  const label = getBuffLabel(personalBuff.typeHrid)
  return label ? `${label} ${formatPercent(ratio)}` : formatPercent(ratio)
}

function getAchievementEffect(type: AchievementTier) {
  const detail = getAchievementTierDetailOf(`/achievement_tiers/${type}`)
  if (!detail?.buff) {
    return type
  }
  const value = (detail.buff.flatBoost || 0) + (detail.buff.ratioBoost || 0)
  return `${getBuffLabel(detail.buff.typeHrid)} ${formatPercent(value)}`
}
</script>

<template>
  <ul v-show="menuVisible" class="contextmenu" :style="{ left: `${left}px`, top: `${top}px` }">
    <li @click="onCopy">
      复制
    </li>
    <li v-if="playerStore.presets.length > 1" @click="onRemove">
      删除
    </li>
  </ul>
  <div class="flex items-center">
    <div class="flex items-center p-1 pl-2 pr-2" style="border:1px solid var(--el-border-color);border-radius: 4px;">
      <div>{{ t('预设') }}:</div>
      <!-- 长按打开右键菜单 -->
      <el-button
        v-for="(preset, index) in playerStore.presets"
        draggable="true"
        :class="{ 'drag-over': dragOverIndex === index }"
        @dragstart="onDragStart(index, $event)"
        @dragover.prevent="onDragOver(index)"
        @dragleave="onDragLeave"
        @drop="onDrop(index)"
        class="ml-1 w-32px"
        :plain="playerStore.presetIndex !== index"
        color="#16ab1b"
        :dark="activeThemeName.includes('dark')"
        :key="index"
        @click="onSelect(preset, index)"
        @contextmenu.prevent="openMenu(preset, index, $event)"
      >
        {{ preset.name?.substring(0, 1) }}
      </el-button>
      <el-button
        class="ml-1 w-32px" :icon="Plus" plain
        @click="onAdd"
      />
      <el-button
        class="ml-1" size="small" plain style="padding:0 10px"
        @click="onClipboardImport"
      >
        {{ t("一键导入") }}
      </el-button>
      <span style="width:1px;height:20px;background:var(--el-border-color);margin:0 4px" />
      <el-button
        class="compare-trigger-btn" size="small" plain style="padding:0 10px"
        @click="emit('toggleCompare')"
      >
        {{ t("对比") }}
      </el-button>
    </div>

    <template v-for="[key, communityBuff] in playerStore.config.communityBuffMap.entries()" :key="key">
      <div v-if="communityBuff.level" class="community-buff ml-2">
        <ItemIcon :hrid="getCommunityBuffDetailOf(communityBuff.hrid!).buff.typeHrid" :width="22" :height="22" />
        <div v-if="communityBuff.level && key !== 'moo_card'" class="community-level">
          Lv.{{ communityBuff.level }}
        </div>
      </div>
    </template>
  </div>
  <el-dialog v-model="visible" :show-close="false" width="80%" @close="onDialogClose">
    <div class="mt-[-30px]">
      <el-card class="mt-5">
        <template #header>
          <div class="flex flex-wrap items-baseline ">
            <!-- <div class="mr-3 mb-2">
 {{ t('预设颜色') }}:
 </div>

 <el-color-picker
 class="mr-5"
 v-model="color"
 :predefine="[
 '#ff4500',
 '#ff8c00',
 '#ffd700',
 '#90ee90',
 '#00ced1',
 '#1e90ff',
 '#c71585']"
 /> -->

            <div class=" mr-3 mb-2">
              {{ t('预设名称') }}:
            </div>
            <el-input class=" w-300px" :maxlength="20" v-model="name" />
            <el-button type="success" plain class="ml-4" @click="onImport">
              {{ t('导入') }}
            </el-button>
            <el-button type="success" plain class="ml-4" @click="onExport">
              {{ t('导出') }}
            </el-button>
          </div>
        </template>
        <el-table :data="actionList.filter(item => actions ? actions.includes(item.action) : true)">
          <el-table-column prop="name" width="54">
            <template #default="{ row }">
              <ItemIcon :hrid="`/actions/${row.action}`" />
            </template>
          </el-table-column>
          <el-table-column :label="t('Action')" width="125" align="center">
            <template #default="{ row }">
              {{ t(row.action) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('技能等级')" width="85" align="center">
            <template #default="{ row }">
              <el-input-number v-model="row.playerLevel" :min="1" :max="200" style="width: 60px" :controls="false" />
            </template>
          </el-table-column>
          <el-table-column :label="t('房子等级')" width="85" align="center">
            <template #default="{ row }">
              <el-input-number v-model="row.houseLevel" :min="0" :max="8" style="width: 60px" :controls="false" />
            </template>
          </el-table-column>
          <el-table-column :label="t('工具')" align="center" min-width="105">
            <template #default="{ row }">
              <el-select style="width:80px" v-model="row.tool.hrid" :placeholder="t('工具')" clearable>
                <el-option v-for="item in getToolListOf(row.action)" :key="item.hrid" :label="item.name" :value="item.hrid">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <ItemIcon :hrid="item.hrid" />
                    <div> {{ item.name }} </div>
                  </div>
                </el-option>
                <template #label>
                  <ItemIcon style="margin-top: 4px;" :hrid="row.tool.hrid" />
                </template>
              </el-select>
              &nbsp;+&nbsp;
              <el-input-number v-model="row.tool.enhanceLevel" :min="0" :max="20" style="width: 60px" :controls="false" />
            </template>
          </el-table-column>
          <el-table-column :label="t('身体')" align="center" min-width="105">
            <template #default="{ row }">
              <el-select style="width:80px" v-model="row.body.hrid" :placeholder="t('身体')" clearable>
                <el-option v-for="item in getEquipmentListOf(row.action, 'body')" :key="item.hrid" :label="item.name" :value="item.hrid">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <ItemIcon :hrid="item.hrid" />
                    <div> {{ item.name }} </div>
                  </div>
                </el-option>
                <template #label>
                  <ItemIcon style="margin-top: 4px;" :hrid="row.body.hrid" />
                </template>
              </el-select>
              &nbsp;+&nbsp;
              <el-input-number v-model="row.body.enhanceLevel" :min="0" :max="20" style="width: 60px" :controls="false" />
            </template>
          </el-table-column>
          <el-table-column :label="t('腿部')" align="center" min-width="105">
            <template #default="{ row }">
              <el-select style="width:80px" v-model="row.legs.hrid" :placeholder="t('腿部')" clearable>
                <el-option v-for="item in getEquipmentListOf(row.action, 'legs')" :key="item.hrid" :label="item.name" :value="item.hrid">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <ItemIcon :hrid="item.hrid" />
                    <div> {{ item.name }} </div>
                  </div>
                </el-option>
                <template #label>
                  <ItemIcon style="margin-top: 4px;" :hrid="row.legs.hrid" />
                </template>
              </el-select>
              &nbsp;+&nbsp;
              <el-input-number v-model="row.legs.enhanceLevel" :min="0" :max="20" style="width: 60px" :controls="false" />
            </template>
          </el-table-column>
          <el-table-column :label="t('背部')" align="center" min-width="105">
            <template #default="{ row }">
              <el-select style="width:80px" v-model="row.back.hrid" :placeholder="t('背部')" clearable>
                <el-option v-for="item in getBackEquipmentListOf(row.action)" :key="item.hrid" :label="item.name" :value="item.hrid">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <ItemIcon :hrid="item.hrid" />
                    <div> {{ item.name }} </div>
                  </div>
                </el-option>
                <template #label>
                  <ItemIcon style="margin-top: 4px;" :hrid="row.back.hrid" />
                </template>
              </el-select>
              &nbsp;+&nbsp;
              <el-input-number v-model="row.back.enhanceLevel" :min="0" :max="20" style="width: 60px" :controls="false" />
            </template>
          </el-table-column>
          <el-table-column :label="t('护符')" align="center" min-width="105">
            <template #default="{ row }">
              <el-select style="width:80px" v-model="row.charm.hrid" :placeholder="t('护符')" clearable>
                <el-option v-for="item in getEquipmentListOf(row.action, 'charm').sort((a, b) => a.itemLevel - b.itemLevel)" :key="item.hrid" :label="item.name" :value="item.hrid">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <ItemIcon :hrid="item.hrid" />
                    <div> {{ item.name }} </div>
                  </div>
                </el-option>
                <template #label>
                  <ItemIcon style="margin-top: 4px;" :hrid="row.charm.hrid" />
                </template>
              </el-select>
              &nbsp;+&nbsp;
              <el-input-number v-model="row.charm.enhanceLevel" :min="0" :max="20" style="width: 60px" :controls="false" />
            </template>
          </el-table-column>
          <el-table-column :label="t('茶')" align="center" min-width="155">
            <template #default="{ row }">
              <el-checkbox-group v-model="row.tea" size="large" :max="3" class="tea-checkbox-group">
                <el-checkbox v-for="tea in getTeaListOf(row.action)" :key="tea.hrid" :value="tea.hrid" border>
                  <ItemIcon :hrid="tea.hrid" />
                </el-checkbox>
              </el-checkbox-group>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card class="mt-5">
        <template #header>
          <div style="line-height: 32px;">
            {{ t('特殊装备') }}
          </div>
        </template>
        <div class="buff-tofu-grid special-equip-grid">
          <div class="buff-tofu" v-for="row in specialList.filter(item => equipments ? equipments.includes(item.type) : true)" :key="`special-${row.type}`">
            <div class="buff-tofu-head" style="gap:6px">
              <ItemIcon v-if="row.hrid" :hrid="row.hrid" style="flex-shrink:0" />
              <span>{{ t(row.type.replace(/_/g, ' ').replace(/\b\w+\b/g, (word:any) => word.substring(0, 1).toUpperCase() + word.substring(1))) }}</span>
            </div>
            <el-select style="width:100%" v-model="row.hrid" :placeholder="t(row.type.replace(/_/g, ' ').replace(/\\b\\w+\\b/g, (word:any) => word.substring(0, 1).toUpperCase() + word.substring(1)))" clearable>
              <el-option v-for="item in getSpecialEquipmentListOf(row.type)" :key="item.hrid" :label="getTrans(item.name)" :value="item.hrid">
                <div style="display:flex;align-items:center;gap:10px;">
                  <ItemIcon :hrid="item.hrid" />
                  <div> {{ getTrans(item.name) }} </div>
                </div>
              </el-option>
            </el-select>
            <el-input-number v-model="row.enhanceLevel" :min="0" :max="20" style="width: 100%" :controls="false" />
          </div>
        </div>
      </el-card>

      <el-card class="mt-5">
        <template #header>
          <div style="line-height: 32px;">
            {{ t('封印') }}
          </div>
        </template>
        <div class="buff-tofu-grid seal-grid">
          <div class="buff-tofu" v-for="item in sealList" :key="`seal-${item.hrid}`">
            <div class="buff-tofu-head">
              <ItemIcon :hrid="item.hrid" />
              <span>{{ getTrans(item.name) }}</span>
            </div>
            <div class="buff-effect">
              {{ getSealEffect(item) }}
            </div>
            <el-checkbox :model-value="isSealEnabled(item.hrid)" @change="(value) => onSealToggle(item.hrid, Boolean(value))">
              {{ t('启用') }}
            </el-checkbox>
          </div>
        </div>
      </el-card>

      <el-card class="mt-5">
        <template #header>
          <div style="line-height: 32px;">
            {{ t('社区Buff') }}
          </div>
        </template>
        <div class="buff-tofu-grid">
          <div class="buff-tofu" v-for="row in communityBuffList.filter(item => communityBuffs ? communityBuffs.includes(item.type) : true)" :key="`community-${row.type}`">
            <div class="buff-tofu-head">
              <ItemIcon :hrid="getCommunityBuffDetailOf(row.hrid!).buff.typeHrid" :width="22" :height="22" />
              <span>{{ row.type === 'moo_card' ? getTrans(getCommunityBuffDetailOf(row.hrid!).name) : t('等级') }}</span>
            </div>
            <el-switch v-if="row.type === 'moo_card'" :model-value="!!row.level" @change="(v) => row.level = v ? 1 : 0" />
            <el-input-number v-else v-model="row.level" :min="0" :max="20" style="width: 90px" :controls="false" />
          </div>
        </div>
      </el-card>

      <el-card class="mt-5">
        <template #header>
          <div style="line-height: 32px;">
            {{ t('成就Buff') }}
          </div>
        </template>
        <div class="buff-tofu-grid">
          <div class="buff-tofu" v-for="row in achievementBuffList.filter(item => achievementBuffs ? achievementBuffs.includes(item.type) : true)" :key="`achievement-${row.type}`">
            <div class="buff-tofu-head">
              <ItemIcon :hrid="getAchievementTierDetailOf(`/achievement_tiers/${row.type}`)?.buff.typeHrid" :width="22" :height="22" />
              <span>{{ getAchievementEffect(row.type) }}</span>
            </div>
            <el-checkbox v-model="row.enabled">
              {{ t('启用') }}
            </el-checkbox>
          </div>
        </div>
      </el-card>

      <el-card class="mt-5">
        <template #header>
          <div style="line-height: 32px;">
            {{ t('神龛') }}
          </div>
        </template>
        <div class="buff-tofu-grid">
          <div class="buff-tofu" v-for="row in shrineList" :key="`shrine-${row.type}`">
            <div class="buff-tofu-head">
              <span>{{ SHRINE_CONFIG[row.type]?.name || row.type }}</span>
            </div>
            <div class="buff-effect">
              {{ SHRINE_CONFIG[row.type] ? `${SHRINE_CONFIG[row.type].label} +${(row.level * SHRINE_CONFIG[row.type].perLevel * 100).toFixed(1)}%` : '' }}
            </div>
            <el-input-number v-model="row.level" :min="0" :max="20" style="width: 90px" :controls="false" />
          </div>
        </div>
      </el-card>
    </div>

    <template #footer>
      <div style="text-align: center;">
        <el-button type="danger" plain @click="onDeleteInDialog">
          {{ t('删除') }}
        </el-button>
        <el-button type="primary" @click="onConfirm">
          {{ t('保存') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style lang="scss" scoped>
:deep(.el-select__wrapper) {
  height: 38px;
}
:deep(.tea-checkbox-group .el-checkbox.is-bordered) {
  margin-right: 3px;
  position: relative;
  padding: 5px !important;
  height: 40px;
  width: 40px;
}
:deep(.tea-checkbox-group .el-checkbox__label) {
  padding: 0;
}
:deep(.tea-checkbox-group .el-checkbox__input) {
  position: absolute;
  width: 35px;
  height: 100%;
}
:deep(.tea-checkbox-group .el-checkbox__inner) {
  position: absolute;
  // 右下角
  right: 0;
  bottom: 0;
}
.config {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 20px;
  .config-content {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
  }
  div {
    width: 120px;
  }
}

.ml-1.w-32px {
  cursor: grab;
}
.ml-1.w-32px:active {
  cursor: grabbing;
}
.ml-1.w-32px.drag-over {
  transform: scale(1.15);
  box-shadow: 0 0 8px rgba(22, 171, 27, 0.5);
}
.contextmenu {
  margin: 0;
  z-index: 3000;
  position: fixed;
  list-style-type: none;
  padding: 5px 0;
  border-radius: 4px;
  font-size: 12px;
  color: var(--v3-tagsview-contextmenu-text-color);
  background-color: var(--v3-tagsview-contextmenu-bg-color);
  box-shadow: var(--v3-tagsview-contextmenu-box-shadow);
  li {
    margin: 0;
    padding: 7px 16px;
    cursor: pointer;
    &:hover {
      color: var(--v3-tagsview-contextmenu-hover-text-color);
      background-color: var(--v3-tagsview-contextmenu-hover-bg-color);
    }
  }
}
.community-buff {
  position: relative;
  width: 36px;
  height: 36px;
  border: 2px solid #2fc4a7;
  border-radius: 4px;
  padding: 6px;
  font-size: 11px;
  line-height: 11px;
}
.community-level {
  position: absolute;
  top: 1px;
  left: 1px;
  text-align: right;
  text-shadow:
    -1px 0 #131419,
    0 1px #131419,
    1px 0 #131419,
    0 -1px #131419;
}

.buff-title {
  font-weight: 600;
  margin-bottom: 10px;
}

.buff-tofu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
}

.buff-tofu {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.buff-tofu-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  font-size: 13px;
}

/* 特殊装备图标居中 */
.special-equip-grid :deep(.el-select__selected-item) {
  display: flex;
  align-items: center;
  justify-content: center;
}
.special-equip-grid :deep(.el-select__placeholder) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.buff-effect {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.special-equip-grid .buff-tofu {
  text-align: center;
  align-items: center;
}

.seal-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.seal-grid .buff-tofu {
  flex: 1;
  min-width: 140px;
}

.special-equip-grid :deep(.el-select__wrapper) {
  justify-content: center;
}
</style>

<style>
.import-data-dialog {
  width: 600px;
}
.import-data-dialog .el-message-box__message {
  width: 100%;
}
.import-data-dialog textarea {
  min-height: 130px !important;
  max-height: 170px !important;
}

.el-dialog__body {
  max-height: 75vh;
  overflow-y: auto;
}
</style>
