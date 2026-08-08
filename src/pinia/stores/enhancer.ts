import { defineStore } from "pinia"
import { getItemDetailOf } from "@/common/apis/game"

export const useEnhancerStore = defineStore("enhancer", {
  state: () => ({
    config: loadConfig(),
    advancedConfig: loadAdvancedConfig(),
    favorite: loadFavorite(),
    advancedFavorite: loadAdvancedFavorite()
  }),
  actions: {
    saveConfig() {
      saveConfig(this.config)
    },
    saveAdvancedConfig() {
      saveAdvancedConfig(this.advancedConfig)
    },
    addFavorite(hrid: string) {
      if (!hrid) return
      const index = this.favorite.indexOf(hrid)
      if (index === -1) {
        this.favorite.push(hrid)
      }
      this.favorite.sort((a, b) => getItemDetailOf(a).sortIndex - getItemDetailOf(b).sortIndex)
      saveFavorite(this.favorite)
    },
    removeFavorite(hrid: string) {
      if (!hrid) return
      const index = this.favorite.indexOf(hrid)
      if (index !== -1) {
        this.favorite.splice(index, 1)
      }
      saveFavorite(this.favorite)
    },
    hasFavorite(hrid: string) {
      if (!hrid) return false
      const index = this.favorite.indexOf(hrid)
      return index !== -1
    },
    addAdvancedFavorite(hrid: string) {
      if (!hrid) return
      const index = this.advancedFavorite.indexOf(hrid)
      if (index === -1) {
        this.advancedFavorite.push(hrid)
      }
      this.advancedFavorite.sort((a, b) => getItemDetailOf(a).sortIndex - getItemDetailOf(b).sortIndex)
      saveAdvancedFavorite(this.advancedFavorite)
    },
    removeAdvancedFavorite(hrid: string) {
      if (!hrid) return
      const index = this.advancedFavorite.indexOf(hrid)
      if (index !== -1) {
        this.advancedFavorite.splice(index, 1)
      }
      saveAdvancedFavorite(this.advancedFavorite)
    },
    hasAdvancedFavorite(hrid: string) {
      if (!hrid) return false
      const index = this.advancedFavorite.indexOf(hrid)
      return index !== -1
    }
  },
  getters: {
    enhanceLevel: state => state.config.enhanceLevel,
    hourlyRate: state => state.config.hourlyRate,
    taxRate: state => state.config.taxRate,
    hrid: state => state.config.hrid,
    originLevel: state => state.config.originLevel,
    escapeLevel: state => state.config.escapeLevel
  }
})

export interface EnhancerConfig {
  escapeLevel?: number
  originLevel?: number
  enhanceLevel?: number
  hourlyRate?: number
  taxRate?: number
  ignoreTax?: boolean
  hrid?: string
  tab?: string
}
const KEY_PREFIX = "enhancer-"
function loadConfig(): EnhancerConfig {
  try {
    const cfg = JSON.parse(localStorage.getItem(`${KEY_PREFIX}config`) || "{}")
    return {
      ignoreTax: !!cfg.ignoreTax,
      ...cfg
    }
  } catch {
    return {}
  }
}

function saveConfig(item: EnhancerConfig) {
  localStorage.setItem(`${KEY_PREFIX}config`, JSON.stringify(item))
}

function loadAdvancedConfig(): EnhancerConfig {
  try {
    const cfg = JSON.parse(localStorage.getItem(`${KEY_PREFIX}advancedConfig`) || "{}")
    return {
      ignoreTax: !!cfg.ignoreTax,
      ...cfg
    }
  } catch {
    return {}
  }
}
function saveAdvancedConfig(item: EnhancerConfig) {
  localStorage.setItem(`${KEY_PREFIX}advancedConfig`, JSON.stringify(item))
}

function loadFavorite(): string[] {
  try {
    return JSON.parse(localStorage.getItem(`${KEY_PREFIX}favorite`) || "[]")
  } catch {
    return []
  }
}
function saveFavorite(item: string[]) {
  localStorage.setItem(`${KEY_PREFIX}favorite`, JSON.stringify(item))
}

function loadAdvancedFavorite(): string[] {
  try {
    return JSON.parse(localStorage.getItem(`${KEY_PREFIX}advancedFavorite`) || "[]")
  } catch {
    return []
  }
}
function saveAdvancedFavorite(item: string[]) {
  localStorage.setItem(`${KEY_PREFIX}advancedFavorite`, JSON.stringify(item))
}
