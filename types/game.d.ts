import type { ACHIEVEMENT_TIER_LIST, ACTION_LIST, COMMUNITY_BUFF_LIST, EQUIPMENT_LIST } from "@/pinia/stores/game"

interface PROP_TODO {
  [key: string]: any
}

// #region Game
export interface GameData {
  gameVersion: string
  versionTimestamp: string
  itemDetailMap: Record<string, ItemDetail>
  actionDetailMap: Record<string, ActionDetail>
  shopItemDetailMap: Record<string, ShopItemDetail>
  openableLootDropMap: Record<string, DropTableItem[]>
  enhancementLevelSuccessRateTable: number[]
  enhancementLevelTotalBonusMultiplierTable: number[]
  communityBuffTypeDetailMap: Record<string, CommunityBuffDetail>
  personalBuffTypeDetailMap?: Record<string, PersonalBuffDetail>
  achievementTierDetailMap: Record<AchievementTierType, AchievementTierDetail>
  chatIconDetailMap?: Record<string, ChatIconDetail>
}
export interface ChatIconDetail {
  hrid: string
  name: string
  isSpecial: boolean
  isSeasonal: boolean
  cowbellCost: number
  supporterPointCost: number
  requiredChatIconHrid: string
  sortIndex: number
}
export interface ShopItemDetail {
  hrid: string
  category: string
  itemHrid: string
  costs: Item[]
  sortIndex: number
}
export interface ItemDetail {
  hrid: string
  name: string
  description?: string
  categoryHrid: string
  sellPrice: number
  isTradable: boolean
  itemLevel: number
  enhancementCosts?: Item[]
  protectionItemHrids?: string[]
  alchemyDetail: AlchemyDetail
  equipmentDetail?: EquipmentDetail
  consumableDetail: ConsumableDetail
  scrollDetail?: ScrollDetail
  sortIndex: number
}
export interface ActionDetail {
  hrid: string
  function: string
  type: string
  category: string
  name: string
  levelRequirement: {
    skillHrid: string
    level: number
  }
  baseTimeCost: number
  experienceGain: {
    skillHrid: string
    value: number
  }
  dropTable?: DropTableItem[]
  essenceDropTable?: DropTableItem[]
  rareDropTable?: DropTableItem[]
  upgradeItemHrid: string
  inputItems: Item[]
  outputItems: Item[]
  combatZoneInfo: PROP_TODO
  maxPartySize: number
  buffs: PROP_TODO
  sortIndex: 0
}
export interface Item {
  itemHrid: string
  count: number
}

export interface DropTableItem {
  itemHrid: string
  dropRate: number
  minCount: number
  maxCount: number
  minEliteTier?: number
}

export interface CommunityBuffDetail {
  hrid: string
  name: string
  usableInActionTypeMap: Record<ActionType, boolean>
  buff: Buff
}

export interface PersonalBuffDetail {
  hrid: string
  name: string
  usableInActionTypeMap: Record<ActionType, boolean>
  buff: Buff
  sortIndex: number
}

export interface ConsumableDetail {
  cooldownDuration: number
  usableInActionTypeMap: Record<ActionType, boolean>
  hitpointRestore: number
  manapointRestore: number
  recoveryDuration: number
  buffs: Buff[]
  defaultCombatTriggers: PROP_TODO
}

export interface ScrollDetail {
  personalBuffTypeHrid: string
}
export interface Buff {
  uniqueHrid: string
  typeHrid: string
  ratioBoost: number
  ratioBoostLevelBonus: number
  flatBoost: number
  flatBoostLevelBonus: number
  startTime: string
  duration: number
}

type Action = typeof ACTION_LIST[number]
type ActionType = `/action_types/${Action}`
type Equipment = typeof EQUIPMENT_LIST[number] | `${Action}_tool`
type EquipmentType = `/equipment_types/${Equipment}`
type CommunityBuff = typeof COMMUNITY_BUFF_LIST[number]
type CommunityBuffType = `/community_buff_types/${CommunityBuff}`
type AchievementTier = typeof ACHIEVEMENT_TIER_LIST[number]
type AchievementTierType = `/achievement_tiers/${AchievementTier}`

export interface AchievementTierDetail {
  hrid: AchievementTierType
  name: string
  sortIndex: number
  buff: Buff
  usableInActionTypeMap: Record<string, boolean>
}
// #endregion

// #region Alchemy
export interface AlchemyDetail {
  bulkMultiplier: number
  isCoinifiable: boolean
  decomposeItems: Item[]
  transmuteSuccessRate: number
  transmuteDropTable: DropTableItem[]
}

// #endregion

// #region Equipment

type NoncombatStatsKey = "Speed" | "Efficiency" | "Success" | "RareFind" | "EssenceFind" | "Experience" | "Level" | "Artisan" | "Gourmet" | "Blessed" | "Gathering" | "Processing"
type NoncombatStatsProp = `${Action | "skilling"}${NoncombatStatsKey}` | "drinkConcentration"

export interface EquipmentDetail {
  type: EquipmentType
  levelRequirements: {
    skillHrid: string
    level: number
  }[]
  combatStats: PROP_TODO
  noncombatStats: {
    [key in NoncombatStatsProp]?: number
  }
  combatEnhancementBonuses: PROP_TODO
  noncombatEnhancementBonuses: {
    [key in NoncombatStatsProp]?: number
  }
}
// #endregion
