import type { AchievementTier, Action, CommunityBuff, Equipment } from "~/game"
import { defineStore } from "pinia"
import { clearEnhancelateCache } from "@/common/apis/game"
import { DEFAULT_ACHIEVEMENT_BUFF_LIST, DEFAULT_COMMUNITY_BUFF_LIST, DEFAULT_SEPCIAL_EQUIPMENT_LIST, DEFAULT_SHRINE_LIST, DEFAULT_TEA } from "@/common/config"
import { pinia } from "@/pinia"
import { ACTION_LIST, useGameStoreOutside } from "./game"

export const MAX_PRESETS = 5
export const usePlayerStore = defineStore("player", {
  state: () => ({
    config: load(),
    presets: loadPresets(),
    presetIndex: getPresetIndex()
  }),
  actions: {
    commit() {
      savePresets(this.presets)
    },
    setActionConfig(config: ActionConfig, index: number) {
      this.config = config
      this.presets[index] = config
      this.commit()
      this.setPresetIndex(index)
    },
    switchTo(index: number) {
      this.config = this.presets[index]
      this.setPresetIndex(index)
    },
    removePreset(index: number) {
      if (this.presets.length <= 1) {
        return
      }
      this.presets.splice(index, 1)
      this.commit()
      // 如果删除的是当前预设，切换到第一个预设
      if (this.presetIndex === index) {
        this.setPresetIndex(0)
      } else if (this.presetIndex > index) {
        // 如果删除的是当前预设之前的预设，更新索引
        this.setPresetIndex(this.presetIndex - 1)
      }
      this.config = this.presets[this.presetIndex]
    },
    reorderPresets(fromIndex: number, toIndex: number) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
      if (fromIndex >= this.presets.length || toIndex >= this.presets.length) return
      const [moved] = this.presets.splice(fromIndex, 1)
      this.presets.splice(toIndex, 0, moved)
      // 更新当前预设索引
      if (this.presetIndex === fromIndex) {
        this.presetIndex = toIndex
        setPresetIndex(toIndex)
      } else if (fromIndex < this.presetIndex && toIndex >= this.presetIndex) {
        this.presetIndex--
        setPresetIndex(this.presetIndex)
      } else if (fromIndex > this.presetIndex && toIndex <= this.presetIndex) {
        this.presetIndex++
        setPresetIndex(this.presetIndex)
      }
      this.commit()
    },
    setPresetIndex(index: number) {
      this.presetIndex = index
      setPresetIndex(index)
      clearCaches()
    },
    isOverflow() {
      return this.presets.length >= MAX_PRESETS
    }
  }
})

function clearCaches() {
  useGameStoreOutside().clearAllCaches()
  // 只有更新玩家数据时需要清除强化缓存
  clearEnhancelateCache()
}

/**
 * 获取默认预设
 */
export function defaultActionConfig(name: string, color: string) {
  const actionConfigMap = new Map<Action, ActionConfigItem>()
  for (const action of Object.values(ACTION_LIST)) {
    const defaultTool = Object.values(useGameStoreOutside().gameData!.itemDetailMap)
      .filter(item => item.equipmentDetail?.noncombatStats && Object.keys(item.equipmentDetail?.noncombatStats).length > 0)
      .filter(item => item.equipmentDetail?.type === `/equipment_types/${action}_tool`)
      // .sort((a, b) => a.itemLevel - b.itemLevel)
      .find(item => item.itemLevel === 80)
    actionConfigMap.set(action, {
      action,
      playerLevel: 100,
      tool: {
        type: `${action}_tool`,
        hrid: defaultTool?.hrid,
        enhanceLevel: 10
      },
      legs: {
        type: `legs`,
        hrid: undefined,
        enhanceLevel: undefined
      },
      body: {
        type: `body`,
        hrid: undefined,
        enhanceLevel: undefined
      },
      back: {
        type: `back`,
        hrid: undefined,
        enhanceLevel: undefined
      },
      charm: {
        type: `charm`,
        hrid: undefined,
        enhanceLevel: undefined
      },
      houseLevel: 4,
      tea: structuredClone(DEFAULT_TEA[action])
    })
  }
  const specialEquimentMap = new Map<Equipment, PlayerEquipmentItem>()
  for (const item of Object.values(DEFAULT_SEPCIAL_EQUIPMENT_LIST)) {
    specialEquimentMap.set(item.type, {
      type: item.type,
      hrid: item.hrid,
      enhanceLevel: item.enhanceLevel
    })
  }
  const communityBuffMap = new Map<CommunityBuff, CommunityBuffItem>()
  for (const buff of Object.values(DEFAULT_COMMUNITY_BUFF_LIST)) {
    communityBuffMap.set(buff.type, {
      type: buff.type,
      hrid: buff.hrid,
      level: buff.level
    })
  }
  const achievementBuffMap = new Map<AchievementTier, AchievementBuffItem>()
  for (const buff of Object.values(DEFAULT_ACHIEVEMENT_BUFF_LIST)) {
    achievementBuffMap.set(buff.type, {
      type: buff.type,
      enabled: buff.enabled
    })
  }
  const shrineBuffMap = new Map<ShrineType, ShrineBuffItem>()
  for (const buff of Object.values(DEFAULT_SHRINE_LIST)) {
    shrineBuffMap.set(buff.type, { ...buff })
  }
  return {
    actionConfigMap,
    specialEquimentMap,
    communityBuffMap,
    achievementBuffMap,
    shrineBuffMap,
    seals: [],
    name,
    color
  }
}

const KEY = "player-action-config"
const PRESETS_KEY = "player-action-config-presets"
export interface ActionConfigItem {
  action: Action
  playerLevel: number
  tool: PlayerEquipmentItem
  body: PlayerEquipmentItem
  legs: PlayerEquipmentItem
  back: PlayerEquipmentItem
  charm: PlayerEquipmentItem
  houseLevel: number
  tea: string[]
}
export interface PlayerEquipmentItem {
  type: Equipment
  hrid?: string
  enhanceLevel?: number
}

export interface CommunityBuffItem {
  type: CommunityBuff
  hrid?: string
  level?: number
}

export interface AchievementBuffItem {
  type: AchievementTier
  enabled: boolean
}

export type ShrineType = "power" | "rhythm" | "spirit" | "rare" | "scholar"

export interface ShrineBuffItem {
  type: ShrineType
  level: number
}

export interface ActionConfig {
  name?: string
  color?: string
  seals?: string[]
  actionConfigMap: Map<Action, ActionConfigItem>
  specialEquimentMap: Map<Equipment, PlayerEquipmentItem>
  communityBuffMap: Map<CommunityBuff, CommunityBuffItem>
  achievementBuffMap: Map<AchievementTier, AchievementBuffItem>
  shrineBuffMap: Map<ShrineType, ShrineBuffItem>
}

// 向前兼容
function loadLegacyConfig() {
  const config = {
    actionConfigMap: new Map<Action, ActionConfigItem>(),
    specialEquimentMap: new Map<Equipment, PlayerEquipmentItem>(),
    communityBuffMap: new Map<CommunityBuff, CommunityBuffItem>(),
    achievementBuffMap: new Map<AchievementTier, AchievementBuffItem>(),
    shrineBuffMap: new Map<ShrineType, ShrineBuffItem>(),
    seals: [] as string[],
    name: "0",
    color: "#11BF11"
  }
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "{}")
    config.actionConfigMap = new Map<Action, ActionConfigItem>(Object.entries(data.actionConfigMap || {}) as [Action, ActionConfigItem][])
    config.specialEquimentMap = new Map<Equipment, PlayerEquipmentItem>(Object.entries(data.specialEquimentMap || {}) as [Equipment, PlayerEquipmentItem][])
    config.communityBuffMap = new Map<CommunityBuff, CommunityBuffItem>(Object.entries(data.communityBuffMap || {}) as [CommunityBuff, CommunityBuffItem][])
    config.achievementBuffMap = new Map<AchievementTier, AchievementBuffItem>(Object.entries(data.achievementBuffMap || {}) as [AchievementTier, AchievementBuffItem][])
    config.shrineBuffMap = new Map<ShrineType, ShrineBuffItem>(Object.entries(data.shrineBuffMap || {}) as [ShrineType, ShrineBuffItem][])
    config.seals = normalizeSeals(data.seals || data.seal || extractLegacySealsFromActionConfigMap(config.actionConfigMap))
  } catch {
  }
  return config
}

function load(): ActionConfig {
  const presets = loadPresets()
  const presetIndex = Math.min(getPresetIndex(), presets.length - 1)
  return presets[presetIndex]
}

function loadPresets(): ActionConfig[] {
  const presets: ActionConfig[] = []
  try {
    const data = JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]")
    for (const item of data) {
      const actionConfig: ActionConfig = {
        name: item.name,
        color: item.color,
        seals: normalizeSeals(item.seals || item.seal),
        actionConfigMap: new Map<Action, ActionConfigItem>(Object.entries(item.actionConfigMap || {}) as [Action, ActionConfigItem][]),
        specialEquimentMap: new Map<Equipment, PlayerEquipmentItem>(Object.entries(item.specialEquimentMap || {}) as [Equipment, PlayerEquipmentItem][]),
        communityBuffMap: new Map<CommunityBuff, CommunityBuffItem>(Object.entries(item.communityBuffMap || {}) as [CommunityBuff, CommunityBuffItem][]),
        achievementBuffMap: new Map<AchievementTier, AchievementBuffItem>(Object.entries(item.achievementBuffMap || {}) as [AchievementTier, AchievementBuffItem][]),
        shrineBuffMap: new Map<ShrineType, ShrineBuffItem>(Object.entries(item.shrineBuffMap || {}) as [ShrineType, ShrineBuffItem][])
      }
      if (!actionConfig.seals?.length) {
        actionConfig.seals = extractLegacySealsFromActionConfigMap(actionConfig.actionConfigMap)
      }
      presets.push(actionConfig)
    }

    // 如果没有预设，就尝试获取旧版自定义设置
    if (presets.length === 0) {
      presets.push(loadLegacyConfig())
    }
  } catch {
  }

  // 如果预设和旧版自定义设置都没有，就用默认的作为预设
  if (presets.length === 0) {
    presets.push(defaultActionConfig("0", "#11BF11"))
  }
  return presets
}

function extractLegacySealsFromActionConfigMap(actionConfigMap: Map<Action, ActionConfigItem>) {
  const seals = new Set<string>()
  for (const actionConfig of actionConfigMap.values()) {
    const seal = (actionConfig as ActionConfigItem & { seal?: string }).seal
    if (seal) {
      seals.add(seal)
    }
  }
  return [...seals]
}

function normalizeSeals(value: unknown) {
  if (Array.isArray(value)) {
    return [...new Set(value.filter(v => typeof v === "string"))]
  }
  if (typeof value === "string" && value) {
    return [value]
  }
  return []
}

function savePresets(presets: ActionConfig[]) {
  const r = presets.map((preset) => {
    const object: Record<string, any> = {}
    for (const [key, value] of Object.entries(preset)) {
      if (value instanceof Map) {
        object[key] = Object.fromEntries(value.entries())
      } else {
        object[key] = value
      }
    }
    return object
  })
  localStorage.setItem(PRESETS_KEY, JSON.stringify(r))
}

const PRESET_INDEX_KEY = "player-action-preset-index"
function getPresetIndex() {
  const value = localStorage.getItem(PRESET_INDEX_KEY)
  return value ? Number.parseInt(value, 10) : 0
}

function setPresetIndex(value: number) {
  localStorage.setItem(PRESET_INDEX_KEY, String(value))
}

export function usePlayerStoreOutside() {
  return usePlayerStore(pinia)
}
