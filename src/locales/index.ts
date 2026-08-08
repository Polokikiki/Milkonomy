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
  return messages[key] || key
}

const i18n = createI18n({
  legacy: false,
  locale: getLang(),
  globalInjection: true,
  messages: lang,
  missingWarn: false
})
export default i18n
