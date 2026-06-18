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
