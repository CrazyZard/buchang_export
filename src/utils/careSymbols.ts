import type { CareSymbolKey, LabelData } from '../types'
import { CARE_SYMBOL_ASSETS, CARE_SYMBOL_DEFINITIONS } from '../assets/care-symbols'

export const ALL_CARE_SYMBOL_KEYS: CareSymbolKey[] = CARE_SYMBOL_DEFINITIONS.map(
  (item) => item.key,
)

export function isAutoCareSymbol(key: CareSymbolKey): boolean {
  return Boolean(CARE_SYMBOL_ASSETS[key].autoMatch)
}

function getAutoCareSymbols(data: LabelData): CareSymbolKey[] {
  return ALL_CARE_SYMBOL_KEYS.filter((key) => {
    const match = CARE_SYMBOL_ASSETS[key].autoMatch
    if (!match) return false
    const fieldValue = data[match.field]
    return typeof fieldValue === 'string' && fieldValue.includes(match.includes)
  })
}

/** 自动匹配 + 手动勾选，按注册表顺序去重合并 */
export function resolveCareSymbols(data: LabelData): CareSymbolKey[] {
  const merged = new Set<CareSymbolKey>([
    ...getAutoCareSymbols(data),
    ...data.careSymbols.filter((key) => !isAutoCareSymbol(key)),
  ])
  return ALL_CARE_SYMBOL_KEYS.filter((key) => merged.has(key))
}
