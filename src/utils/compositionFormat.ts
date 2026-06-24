import type { CompositionPart, Dictionary, LabelData, MaterialItem } from '../types'
import { isRussianLanguage, translateText } from '../utils/dictionary'

export function normalizePercentage(percentage: string): string {
  const value = percentage.trim()
  if (!value) return value
  if (value.endsWith('%')) return value
  if (/^\d+(?:\.\d+)?$/.test(value)) return `${value}%`
  return value
}

export function formatMaterialToken(
  item: MaterialItem,
  spaced: boolean,
  translate?: (name: string) => string,
) {
  const name = translate ? translate(item.name.trim()) : item.name.trim()
  const percentage = normalizePercentage(item.percentage)
  if (!percentage && !name) return ''
  if (!percentage) return name
  if (!name) return percentage
  return spaced ? `${percentage} ${name}` : `${percentage}${name}`
}

export function getCompositionItems(data: LabelData, key: CompositionPart) {
  return data.composition[key].filter((item) => item.percentage.trim() || item.name.trim())
}

export interface CompositionLineData {
  partLabel: string
  token: string
  /** singleLine 模式下各材质 token，用于禁止在比例小数点等处断行 */
  materials?: string[]
}

interface CompositionLinesOptions {
  partLabel: string
  items: MaterialItem[]
  spaced?: boolean
  translateName?: (name: string) => string
  /** 外文：同部位多种材质拼成一行，如 84.4% Acrylic 15.6% Sheep wool */
  singleLine?: boolean
}

export function buildCompositionLines({
  partLabel,
  items,
  spaced = false,
  translateName,
  singleLine = false,
}: CompositionLinesOptions): CompositionLineData[] {
  if (items.length === 0) return []

  const tokens = items
    .map((item) => formatMaterialToken(item, spaced, translateName))
    .filter(Boolean)

  if (tokens.length === 0) return []

  if (singleLine) {
    return [{ partLabel, token: tokens.join(' '), materials: tokens }]
  }

  return tokens.map((token, index) => ({
    partLabel: index === 0 ? partLabel : '',
    token,
  }))
}

export function translateCompositionLabel(dictionary: Dictionary, label: string, lang: string) {
  let translated = translateText(dictionary, label, lang).trim()
  if (!translated) return `[${label}]`
  if (isRussianLanguage(lang) && (label === '成分' || label === '成份')) {
    translated = translated.charAt(0).toLocaleUpperCase('ru') + translated.slice(1)
  }
  return translated.endsWith(':') ? translated : `${translated}:`
}

/** 翻译成分值：将 "百分比+材料名" 中的材料名查字典翻译，其余保持原样 */
function translateCompositionValue(dictionary: Dictionary, value: string, lang: string): string {
  const pctNameRe = /(\d+(?:\.\d+)?)\s*[%％]\s*([\u4e00-\u9fff][\u4e00-\u9fff\w]*)/g

  let hasMatch = false
  const result = value.replace(pctNameRe, (_match, pct: string, name: string) => {
    hasMatch = true
    const t = translateText(dictionary, name.trim(), lang)
    return t.startsWith('[') ? `${pct}%${name.trim()}` : `${pct}% ${t}`
  })

  if (hasMatch) return result
  // 无百分比模式：整体翻译（如纯材料名"鸭绒"）
  return translateText(dictionary, value, lang)
}

/** 将 "key：value" 格式的完整行按冒号拆分后分别翻译 key 和 value
 * 对标签尾部数字做分离翻译（如"填充物1" → translate("填充物") + " 1"） */
export function translateKeyValueLine(dictionary: Dictionary, line: string, lang: string): string {
  const trimmed = line.trim()
  if (!trimmed) return ''

  const colonIdx = trimmed.search(/[：:]/)
  if (colonIdx === -1) {
    return translateText(dictionary, trimmed, lang)
  }

  const rawLabel = trimmed.slice(0, colonIdx).trim()
  const value = trimmed.slice(colonIdx + 1).trim()

  // 分离标签尾部数字，如 "填充物1" → base="填充物" suffix="1"
  const numMatch = rawLabel.match(/^(.+?)(\d+)$/)
  let translatedLabel: string
  if (numMatch) {
    const base = numMatch[1]  // "填充物"
    const num = numMatch[2]   // "1"
    translatedLabel = translateCompositionLabel(dictionary, base, lang).replace(/[：:]\s*$/, '')
    translatedLabel = `${translatedLabel} ${num}:`  // "Stuffing 1:"
  } else {
    translatedLabel = translateCompositionLabel(dictionary, rawLabel, lang)
  }

  const translatedValue = value ? translateCompositionValue(dictionary, value, lang) : ''
  if (!translatedValue) return translatedLabel
  // translatedLabel 已经自带冒号，直接拼
  return `${translatedLabel} ${translatedValue}`
}
