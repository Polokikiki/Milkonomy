import type Calculator from "@/calculator"
import type { ActionConfig, PlayerEquipmentItem, ShrineType } from "@/pinia/stores/player"
import type { AchievementTier, Action, CommunityBuff, Equipment, ItemDetail, NoncombatStatsKey, NoncombatStatsProp } from "~/game"
import { DEFAULT_SEPCIAL_EQUIPMENT_LIST, DEFAULT_TEA, SHRINE_CONFIG } from "@/common/config"
import { getEquipmentTypeOf, getKeyOf } from "@/common/utils/game"
import { ACHIEVEMENT_TIER_LIST, ACTION_LIST, COMMUNITY_BUFF_LIST, EQUIPMENT_LIST, HOUSE_MAP, useGameStoreOutside } from "@/pinia/stores/game"
import { usePlayerStoreOutside } from "@/pinia/stores/player"
import { getAchievementTierDetailOf, getCommunityBuffDetailOf, getGameDataApi, getItemDetailOf, getPersonalBuffDetailOf, getPriceOf } from "../game"

/** 改 */
export function setActionConfigApi(config: ActionConfig, index: number) {
  usePlayerStoreOutside().setActionConfig(config, index)
  usePlayerStoreOutside().commit()
}

// #region 性能优化

let playerConfig = structuredClone(toRaw(usePlayerStoreOutside().config))
const defaultPlayerConfig = structuredClone(toRaw(usePlayerStoreOutside().config))
let equipmentList = [] as ItemDetail[]
let allEquipmentList = [] as ItemDetail[]
let teaList = [] as ItemDetail[]
let sealList = [] as ItemDetail[]
let buffs = {} as Record<NoncombatStatsProp, number>

const SEAL_BUFF_KEY_MAP: Record<string, NoncombatStatsKey | undefined> = {
  "/items/seal_of_action_speed": "Speed",
  "/items/seal_of_efficiency": "Efficiency",
  "/items/seal_of_gathering": "Gathering",
  "/items/seal_of_processing": "Processing",
  "/items/seal_of_gourmet": "Gourmet",
  "/items/seal_of_wisdom": "Experience",
  "/items/seal_of_rare_find": "RareFind"
}

const ACTIONS_ALL = [...ACTION_LIST] as Action[]
const SEAL_BUFF_ACTION_MAP: Partial<Record<NoncombatStatsKey, Action[]>> = {
  // 美食增益：仅烹饪、冲泡
  Gourmet: ["cooking", "brewing"],
  // 采集增益：仅挤奶、采摘、伐木
  Gathering: ["milking", "foraging", "woodcutting"],
  // 加工增益：仅挤奶、采摘、伐木（与加工茶一致）
  Processing: ["milking", "foraging", "woodcutting"],
  // 效率增益：除强化外的所有行动
  Efficiency: ACTIONS_ALL.filter(action => action !== "enhancing"),
  // 行动速度、经验：所有行动
  Speed: ACTIONS_ALL,
  Experience: ACTIONS_ALL,
  // 稀有发现：所有行动
  RareFind: ACTIONS_ALL,
  // 强化成功：仅强化
  Success: ["enhancing"]
}

watch (() => useGameStoreOutside().gameData, () => {
  if (!useGameStoreOutside().gameData) return
  equipmentList = Object.freeze(structuredClone(Object.values(toRaw(useGameStoreOutside().gameData!.itemDetailMap))))
    .filter(item => item.equipmentDetail?.noncombatStats && Object.keys(item.equipmentDetail?.noncombatStats).length > 0)
  allEquipmentList = Object.freeze(structuredClone(Object.values(toRaw(useGameStoreOutside().gameData!.itemDetailMap))))
    .filter(item => item.equipmentDetail)
  teaList = Object.freeze(structuredClone(Object.values(toRaw(useGameStoreOutside().gameData!.itemDetailMap))))
    .filter(item => item.categoryHrid === "/item_categories/drink")
  sealList = Object.freeze(structuredClone(Object.values(toRaw(useGameStoreOutside().gameData!.itemDetailMap))))
    .filter(item => item.hrid.startsWith("/items/seal_of_"))
  initDefaultActionConfigMap()
  initDefaultSpecialEquipmentMap()
  initBuffMap()
  console.log("equipmentList changed")
}, { immediate: true })

watch(
  () => usePlayerStoreOutside().config,
  (value) => {
    playerConfig = structuredClone(toRaw(value))
    initBuffMap()
  },
  // 这里不能用 deep: true，否则在页面中修改数据时，保存前就会触发
  { immediate: true }
)

/**
 * 获取默认值
 */
function initDefaultActionConfigMap() {
  for (const action of Object.values(ACTION_LIST)) {
    const defaultTool = getToolListOf(action).find(item => item.itemLevel === 80)
    defaultPlayerConfig.actionConfigMap.set(action, {
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
}

function initDefaultSpecialEquipmentMap() {
  const map = new Map<Equipment, PlayerEquipmentItem>()
  for (const item of Object.values(DEFAULT_SEPCIAL_EQUIPMENT_LIST)) {
    defaultPlayerConfig.specialEquimentMap.set(item.type, {
      type: item.type,
      hrid: item.hrid,
      enhanceLevel: item.enhanceLevel
    })
  }
  return map
}

/**
 * 获取用户穿戴的action对应的配置
 * @param action
 */
export function getActionConfigOf(action: Action) {
  return playerConfig.actionConfigMap.get(action) ?? defaultPlayerConfig.actionConfigMap.get(action)!
}

/** 获取默认 action 配置（不依赖当前预设） */
export function getDefaultActionConfigOf(action: Action) {
  return defaultPlayerConfig.actionConfigMap.get(action)!
}

export function getToolListOf(action: Action) {
  return equipmentList.filter(item => item.equipmentDetail?.type === `/equipment_types/${action}_tool`).sort((a, b) => a.itemLevel - b.itemLevel)
}

/**
 * 获取所有装备列表
 */
export function getEquipmentList() {
  return allEquipmentList
}

/**
 * 获取action,type对应的所有装备列表
 * @param action
 */
export function getEquipmentListOf(action: Action, type: Equipment) {
  return equipmentList
    .filter(item => Object.keys(item.equipmentDetail!.noncombatStats).find(key => key.includes(action)))
    .filter(item => getEquipmentTypeOf(item) === type)
}
/**
 * 获取所有special装备列表
 */
export function getSpecialEquipmentList() {
  return equipmentList.filter(item => DEFAULT_SEPCIAL_EQUIPMENT_LIST.find(se => se.type === getEquipmentTypeOf(item)))
}

/**
 * 获取单个部位的所有special装备列表
 * @param type
 */
export function getSpecialEquipmentListOf(type: string) {
  return getSpecialEquipmentList().filter(item => getEquipmentTypeOf(item) === type)
}

/**
 * 获取用户穿戴的special装备
 * @param type
 */
export function getSpecialEquipmentOf(type: Equipment) {
  return playerConfig.specialEquimentMap.get(type) ?? defaultPlayerConfig.specialEquimentMap.get(type)!
}

/**
 * 获取用户设置的社区buff
 * @param type
 */

export function getCommunityBuffOf(type: CommunityBuff) {
  return playerConfig.communityBuffMap.get(type) ?? defaultPlayerConfig.communityBuffMap.get(type)!
}

export function getAchievementBuffOf(type: AchievementTier) {
  return playerConfig.achievementBuffMap.get(type) ?? defaultPlayerConfig.achievementBuffMap.get(type)!
}

export function getShrineBuffOf(type: ShrineType) {
  return playerConfig.shrineBuffMap.get(type) ?? defaultPlayerConfig.shrineBuffMap.get(type)!
}

export function getSealsOf() {
  const seals = playerConfig.seals ?? defaultPlayerConfig.seals
  return Array.isArray(seals) ? seals : []
}

// #endregion

// #region 茶
export function getTeaListOf(action: Action) {
  return teaList.filter(item => item.consumableDetail?.usableInActionTypeMap[`/action_types/${action}`]).sort((a, b) => a.itemLevel - b.itemLevel).sort((a, b) => Number(a.hrid.includes(action)) - Number(b.hrid.includes(action)))
}

export function getTeaIngredientList(cal: Calculator) {
  return (getActionConfigOf(cal.action).tea || []).map(hrid => ({
    hrid,
    count: 3600 / 300 / cal.consumePH * (1 + getDrinkConcentration()),
    marketPrice: getPriceOf(hrid).ask
  }))
}

export function getSealList() {
  const whiteList = new Set(Object.keys(SEAL_BUFF_KEY_MAP))
  return sealList
    .filter(item => whiteList.has(item.hrid))
    .sort((a, b) => a.sortIndex - b.sortIndex)
}
// #endregion

// #region buff计算
export type BuffMap = Record<NoncombatStatsProp, number>

function initBuffMap() {
  if (!getGameDataApi()) return
  buffs = buildBuffMap(playerConfig)
  console.log("buffs", buffs)
}

/**
 * 以传入配置构建 buff 表（纯函数，不依赖当前激活预设）
 */
export function buildBuffMap(config: ActionConfig): BuffMap {
  if (!getGameDataApi()) return {} as BuffMap
  const buffs = {} as BuffMap
  const enhanceMultiplier = getGameDataApi().enhancementLevelTotalBonusMultiplierTable
  // 特殊装备
  for (const equipment of EQUIPMENT_LIST) {
    const eq = config.specialEquimentMap.get(equipment) ?? defaultPlayerConfig.specialEquimentMap.get(equipment)!
    if (eq && eq.hrid) {
      const item = getItemDetailOf(eq.hrid!)
      item.equipmentDetail?.noncombatStats && Object.entries(item.equipmentDetail.noncombatStats).forEach(([key, value]) => {
        const bonus = item.equipmentDetail?.noncombatEnhancementBonuses[key as NoncombatStatsProp]
        buffs[key as NoncombatStatsProp] = (buffs[key as NoncombatStatsProp] || 0) + value + ((bonus || 0) * (enhanceMultiplier[eq.enhanceLevel || 0]))
      })
    }
  }

  // 社区buff
  for (const communityBuff of COMMUNITY_BUFF_LIST) {
    const cb = config.communityBuffMap.get(communityBuff) ?? defaultPlayerConfig.communityBuffMap.get(communityBuff)!
    if (cb && cb.hrid && cb.level) {
      const detail = getCommunityBuffDetailOf(cb.hrid!)
      const buff = detail.buff
      for (const actionType in detail.usableInActionTypeMap) {
        const action = getKeyOf(actionType) as Action
        if (buff.typeHrid === "/buff_types/action_speed") {
          buffs[`${action}Speed`] = (buffs[`${action}Speed`] || 0) + (buff.flatBoost + buff.flatBoostLevelBonus * (cb.level - 1))
        }
        if (buff.typeHrid === "/buff_types/wisdom") {
          buffs[`${action}Experience`] = (buffs[`${action}Experience`] || 0) + (buff.flatBoost + buff.flatBoostLevelBonus * (cb.level - 1))
        }
        if (buff.typeHrid === "/buff_types/moo_card") {
          // moo_card 是 Moo Pass 订阅开关型奖励，开启时所有动作经验 +5%
          buffs[`${action}Experience`] = (buffs[`${action}Experience`] || 0) + 0.05
        }
        if (buff.typeHrid === "/buff_types/gathering") {
          buffs[`${action}Gathering`] = (buffs[`${action}Gathering`] || 0) + (buff.flatBoost + buff.flatBoostLevelBonus * (cb.level - 1))
        }
        if (buff.typeHrid === "/buff_types/efficiency") {
          buffs[`${action}Efficiency`] = (buffs[`${action}Efficiency`] || 0) + (buff.flatBoost + buff.flatBoostLevelBonus * (cb.level - 1))
        }
      }
    }
  }

  // 成就buff
  for (const tier of ACHIEVEMENT_TIER_LIST) {
    if (tier === "elite") {
      continue
    }
    const achievementBuff = config.achievementBuffMap.get(tier) ?? defaultPlayerConfig.achievementBuffMap.get(tier)!
    if (!achievementBuff?.enabled) {
      continue
    }
    const detail = getAchievementTierDetailOf(`/achievement_tiers/${tier}`)
    if (!detail) {
      continue
    }
    const buff = detail.buff
    const key = getNoncombatStatsKeyByBuffType(buff.typeHrid)
    if (!key) {
      continue
    }
    const targetActions = SEAL_BUFF_ACTION_MAP[key] || ACTIONS_ALL
    for (const action of targetActions) {
      const prop = `${action}${key}` as NoncombatStatsProp
      buffs[prop] = (buffs[prop] || 0) + buff.flatBoost + buff.ratioBoost
    }
  }

  for (const action of ACTION_LIST) {
    // 职业装备
    const actionConfig = config.actionConfigMap.get(action) ?? defaultPlayerConfig.actionConfigMap.get(action)!
    for (const ac of Object.values(actionConfig)) {
      if (ac && typeof ac === "object" && !Array.isArray(ac) && ac.hrid) {
        const item = getItemDetailOf(ac.hrid)
        getActionScopedEquipmentBuffEntries(action, item, ac.enhanceLevel || 0, enhanceMultiplier).forEach(([key, value]) => {
          buffs[key] = (buffs[key] || 0) + value
        })
      }
    }
    // 房子
    Object.keys(HOUSE_MAP[action as Action]).forEach((key) => {
      let buffAction = action as Action | "skilling"
      if (key === "RareFind" || key === "Experience") {
        buffAction = "skilling"
      }
      buffs[`${buffAction}${key}` as NoncombatStatsProp] = (buffs[`${buffAction}${key}` as NoncombatStatsProp] || 0) + (HOUSE_MAP[action as Action][key as NoncombatStatsKey] || 0) * (actionConfig.houseLevel || 0)
    })

    // 茶
    for (const tea of actionConfig.tea || []) {
      const item = getItemDetailOf(tea)
      item.consumableDetail?.buffs && item.consumableDetail.buffs.forEach((buff) => {
        if (buff.typeHrid === `/buff_types/${action}_level`) {
          buffs[`${action}Level`] = (buffs[`${action}Level`] || 0) + (buff.flatBoost * (1 + (buffs.drinkConcentration || 0)))
        }
        if (buff.typeHrid === "/buff_types/efficiency") {
          buffs[`${action}Efficiency`] = (buffs[`${action}Efficiency`] || 0) + (buff.flatBoost * (1 + (buffs.drinkConcentration || 0)))
        }
        if (buff.typeHrid === "/buff_types/artisan") {
          buffs[`${action}Artisan`] = (buffs[`${action}Artisan`] || 0) + (buff.flatBoost * (1 + (buffs.drinkConcentration || 0)))
        }
        // 工匠茶的等级debuff
        if (buff.typeHrid === "/buff_types/action_level") {
          buffs[`${action}Level`] = (buffs[`${action}Level`] || 0) - (buff.flatBoost * (1 + (buffs.drinkConcentration || 0)))
        }
        if (buff.typeHrid === "/buff_types/gourmet") {
          buffs[`${action}Gourmet`] = (buffs[`${action}Gourmet`] || 0) + (buff.flatBoost * (1 + (buffs.drinkConcentration || 0)))
        }
        if (buff.typeHrid === `/buff_types/${action}_success`) {
          buffs[`${action}Success`] = (buffs[`${action}Success`] || 0) + (buff.ratioBoost * (1 + (buffs.drinkConcentration || 0)))
        }
        if (buff.typeHrid === "/buff_types/blessed") {
          buffs[`${action}Blessed`] = (buffs[`${action}Blessed`] || 0) + (buff.flatBoost * (1 + (buffs.drinkConcentration || 0)))
        }
        if (buff.typeHrid === "/buff_types/action_speed") {
          buffs[`${action}Speed`] = (buffs[`${action}Speed`] || 0) + (buff.flatBoost * (1 + (buffs.drinkConcentration || 0)))
        }
        if (buff.typeHrid === "/buff_types/gathering") {
          buffs[`${action}Gathering`] = (buffs[`${action}Gathering`] || 0) + (buff.flatBoost * (1 + (buffs.drinkConcentration || 0)))
        }
        if (buff.typeHrid === "/buff_types/processing") {
          buffs[`${action}Processing`] = (buffs[`${action}Processing`] || 0) + (buff.flatBoost * (1 + (buffs.drinkConcentration || 0)))
        }
        if (buff.typeHrid === "/buff_types/wisdom") {
          buffs[`${action}Experience`] = (buffs[`${action}Experience`] || 0) + (buff.flatBoost * (1 + (buffs.drinkConcentration || 0)))
        }
      })
    }
  }

  // 战斗房：全局经验+0.05%/级、稀有发现+0.2%/级
  const combatHouseLevel = config.combatHouseLevel || 0
  if (combatHouseLevel > 0) {
    buffs.skillingExperience = (buffs.skillingExperience || 0) + 0.0005 * combatHouseLevel
    buffs.skillingRareFind = (buffs.skillingRareFind || 0) + 0.002 * combatHouseLevel
  }

  // 封印（全局单独 buff）
  const sealsOf = (config.seals ?? defaultPlayerConfig.seals)
  const sealList = Array.isArray(sealsOf) ? sealsOf : []
  for (const seal of sealList) {
    const key = SEAL_BUFF_KEY_MAP[seal]
    const ratio = getSealBuffRatio(seal)
    if (key && ratio > 0) {
      const targetActions = SEAL_BUFF_ACTION_MAP[key] || ACTIONS_ALL
      for (const action of targetActions) {
        const prop = `${action}${key}` as NoncombatStatsProp
        buffs[prop] = (buffs[prop] || 0) + ratio
      }
    }
  }

  // 神龛
  const SHRINE_ACTION_MAP: Partial<Record<NoncombatStatsKey, Action[]>> = {
    Efficiency: ACTIONS_ALL.filter(action => action !== "enhancing"),
    Speed: ACTIONS_ALL,
    EssenceFind: ACTIONS_ALL,
    RareFind: ACTIONS_ALL,
    Experience: ACTIONS_ALL
  }
  for (const [type, shrineConfig] of Object.entries(SHRINE_CONFIG)) {
    const shrine = config.shrineBuffMap.get(type as ShrineType) ?? defaultPlayerConfig.shrineBuffMap.get(type as ShrineType)!
    if (!shrine || !shrine.level) continue
    const bonus = shrine.level * shrineConfig.perLevel
    const targetActions = SHRINE_ACTION_MAP[shrineConfig.key] || ACTIONS_ALL
    for (const action of targetActions) {
      const prop = `${action}${shrineConfig.key}` as NoncombatStatsProp
      buffs[prop] = (buffs[prop] || 0) + bonus
    }
  }
  return buffs
}

function getSealBuffRatio(hrid: string): number {
  const detail = getItemDetailOf(hrid)
  const personalBuffTypeHrid = detail?.scrollDetail?.personalBuffTypeHrid
  if (personalBuffTypeHrid) {
    const buff = getPersonalBuffDetailOf(personalBuffTypeHrid)?.buff
    if (buff) {
      return (buff.flatBoost || 0) + (buff.ratioBoost || 0)
    }
  }
  if (!detail?.description) {
    return 0
  }
  const matched = detail.description.match(/([+-]?\d+(?:\.\d+)?)%/)
  if (!matched?.[1]) {
    return 0
  }
  const ratio = Number.parseFloat(matched[1]) / 100
  return Number.isFinite(ratio) ? ratio : 0
}

function getNoncombatStatsKeyByBuffType(typeHrid: string): NoncombatStatsKey | undefined {
  if (typeHrid === "/buff_types/action_speed") {
    return "Speed"
  }
  if (typeHrid === "/buff_types/wisdom") {
    return "Experience"
  }
  if (typeHrid === "/buff_types/gathering") {
    return "Gathering"
  }
  if (typeHrid === "/buff_types/efficiency") {
    return "Efficiency"
  }
  if (typeHrid === "/buff_types/rare_find") {
    return "RareFind"
  }
  if (typeHrid === "/buff_types/enhancing_success") {
    return "Success"
  }
  return undefined
}

function getActionScopedEquipmentBuffEntries(
  action: Action,
  item: ItemDetail,
  enhanceLevel: number,
  enhanceMultiplier: number[]
) {
  const noncombatStats = item.equipmentDetail?.noncombatStats
  if (!noncombatStats) {
    return []
  }
  const noncombatEnhancementBonuses = item.equipmentDetail?.noncombatEnhancementBonuses || {}

  return Object.entries(noncombatStats).filter(([key]) => {
    const prop = key as NoncombatStatsProp
    return isActionScopedProp(prop, action) || isGlobalNoncombatProp(prop)
  }).map(([key, value]) => {
    const prop = key as NoncombatStatsProp
    const bonus = noncombatEnhancementBonuses[prop] || 0
    return [prop, value + bonus * enhanceMultiplier[enhanceLevel]] as const
  })
}

function isActionScopedProp(prop: NoncombatStatsProp, action: Action) {
  return prop.startsWith(action)
}

function isGlobalNoncombatProp(prop: NoncombatStatsProp) {
  return !ACTION_LIST.some(action => prop.startsWith(action)) && !prop.startsWith("skilling")
}

export function getBuffOf(action: Action, key: NoncombatStatsKey) {
  return (buffs[`${action}${key}`] || 0) + (buffs[`skilling${key}`] || 0)
}

/**
 * 深度去响应式克隆：预设里 Map/对象可能嵌 Vue 代理，structuredClone 会抛 DataCloneError，
 * 这里逐层 toRaw 后重建（配置只含 string/number/array/Map 等纯数据）
 */
function cloneRawConfig<T>(value: T): T {
  const raw = toRaw(value)
  if (raw instanceof Map) {
    const map = new Map()
    raw.forEach((v, k) => map.set(cloneRawConfig(k), cloneRawConfig(v)))
    return map as unknown as T
  }
  if (Array.isArray(raw)) {
    return raw.map(item => cloneRawConfig(item)) as unknown as T
  }
  if (raw && typeof raw === "object") {
    const obj: Record<string, unknown> = {}
    for (const key of Object.keys(raw)) {
      obj[key] = cloneRawConfig((raw as Record<string, unknown>)[key])
    }
    return obj as unknown as T
  }
  return raw
}

/**
 * 以指定配置为上下文同步执行计算（用于评估非当前预设/假想配装），
 * 期间模块级 playerConfig/buffs 被替换，结束后恢复，不触碰 store/localStorage
 */
export function runWithPlayerContext<T>(config: ActionConfig, fn: () => T): T {
  const savedConfig = playerConfig
  const savedBuffs = buffs
  playerConfig = cloneRawConfig(config)
  buffs = buildBuffMap(playerConfig)
  try {
    return fn()
  } finally {
    playerConfig = savedConfig
    buffs = savedBuffs
  }
}

export function getDrinkConcentration() {
  return buffs.drinkConcentration || 0
}

export function getPlayerLevelOf(action: Action) {
  return getActionConfigOf(action).playerLevel + getBuffOf(action, "Level")
}

export function getAlchemySuccessRatio(item: ItemDetail) {
  const action = "alchemy"
  const playerLevel = getPlayerLevelOf(action)
  const levelRatio = playerLevel >= item.itemLevel
    ? 0
    : -0.9 * (1 - playerLevel / item.itemLevel)
  return levelRatio
}

export function getEnhanceSuccessRatio(item: ItemDetail) {
  const action = "enhancing"
  const playerLevel = getPlayerLevelOf(action)
  const levelRatio = playerLevel >= item.itemLevel
    ? (playerLevel - item.itemLevel) * 0.0005
    : -0.5 * (1 - playerLevel / item.itemLevel)
  const buff = getBuffOf(action, "Success")
  return levelRatio + buff
}

// #endregion
