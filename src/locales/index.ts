import { createI18n } from "vue-i18n"
import lang from "./lang"

export type MessageSchema = typeof lang
export type Lang = keyof MessageSchema

const storageKey = "lang-storage-key"
const defaultLang: Lang = "zhCn"

export function getLang(): Lang {
  return (localStorage.getItem(storageKey) as Lang) ?? defaultLang
}

export function setLang(value: string) {
  return localStorage.setItem(storageKey, value)
}

/**
 * 直接获取翻译文本，用于简单的文本映射，优化性能
 * @param key 翻译键
 */
export function getTrans(key: string) {
  const messages = toRaw(lang[i18n.global.locale.value]) as Record<string, string>
  if (messages[key]) return messages[key]
  // 游戏更新后精炼物品名由 "(R)" 改为 "★"（如 Artificer Cape ★），词典里仍是 (R) 形式：回退查找
  if (key.includes("★")) {
    const legacy = key.replaceAll("★", "(R)")
    if (messages[legacy]) return messages[legacy]
  }
  return key
}

const i18n = createI18n({
  legacy: false,
  locale: getLang(),
  globalInjection: true,
  messages: lang,
  missingWarn: false
})
export default i18n
