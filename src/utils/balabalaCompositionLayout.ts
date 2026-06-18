import type { CompositionPart, LabelData } from '../types'
import { isRtlLanguage, isRussianLanguage } from './dictionary'
import { getCompositionItems } from './compositionFormat'

/** 统计当前可见成分条数（有比例或材质名的行） */
export function countCompositionMaterials(data: LabelData, parts: CompositionPart[]) {
  let total = parts.reduce((sum, key) => sum + getCompositionItems(data, key).length, 0)
  if (data.extendedComposition) {
    total += data.extendedComposition.lines.reduce(
      (sum, line) =>
        sum + line.items.filter((item) => item.percentage.trim() || item.name.trim()).length,
      0,
    )
  }
  return total
}

/**
 * 巴拉翻译成分：仅当条数较多时才同部位拼接；≤4 条与中文稿一致每材质一行。
 */
export function shouldCompactTranslatedComposition(
  data: LabelData,
  parts: CompositionPart[],
): boolean {
  const materialCount = countCompositionMaterials(data, parts)

  if (materialCount <= 4) return false
  if (materialCount >= 5) return true

  if (
    data.extendedComposition?.lines.some(
      (line) =>
        line.items.filter((item) => item.percentage.trim() || item.name.trim()).length >= 4,
    )
  ) {
    return true
  }

  return false
}

/** 同部位多条材质时拼接为一行（auto / inline-wrap） */
export function shouldJoinTranslatedMaterials(
  layoutMode: 'per-material-line' | 'inline-wrap' | 'auto' | undefined,
  itemCount: number,
): boolean {
  if (itemCount <= 1) return false
  if (layoutMode === 'per-material-line') return false
  return true
}

/** 阿语/俄文词条更长，单行字符预算需放宽；仍须在 25mm 内可换行 */
export function resolveTranslatedCompositionWrapChars(
  lang: string,
  baseChars: number = DEFAULT_TRANSLATED_COMPOSITION_LINE_CHARS,
): number {
  if (isRtlLanguage(lang)) return Math.max(Math.round(baseChars * 1.35), 30)
  if (isRussianLanguage(lang)) return Math.round(baseChars * 1.2)
  return baseChars
}

/** 部位标签占用内容区宽度（估算字符数） */
export function estimatePartLabelReservedChars(partLabel: string): number {
  return Math.ceil(partLabel.trim().length * 0.55)
}

export function resolveTranslatedCompositionInlineWrap(
  layoutMode: 'per-material-line' | 'inline-wrap' | 'auto' | undefined,
  data: LabelData,
  parts: CompositionPart[],
): boolean {
  if (layoutMode === 'inline-wrap') return true
  if (layoutMode === 'auto') return shouldCompactTranslatedComposition(data, parts)
  return false
}

/** 25mm 宽、4pt 外文下拼接行大约可排字符数；超出则在材质单元之间换行 */
export const DEFAULT_TRANSLATED_COMPOSITION_LINE_CHARS = 24

/** 同部位拼接时，按字符预算拆成多行（换行后与首行材质列对齐） */
export function splitMaterialsForWrapRows(
  materials: string[],
  maxCharsPerLine: number,
  reservedChars = 0,
): string[][] {
  if (materials.length === 0) return []
  if (materials.length === 1 || maxCharsPerLine <= 0) return [materials]

  const rows: string[][] = []
  let current: string[] = []
  let currentLen = 0
  let isFirstRow = true

  for (const material of materials) {
    const tokenLen = material.length
    const separator = current.length > 0 ? 1 : 0
    const lineBudget = isFirstRow
      ? Math.max(10, maxCharsPerLine - Math.max(0, reservedChars))
      : maxCharsPerLine

    if (current.length > 0 && currentLen + separator + tokenLen > lineBudget) {
      rows.push(current)
      current = [material]
      currentLen = tokenLen
      isFirstRow = false
    } else {
      current.push(material)
      currentLen += separator + tokenLen
    }
  }

  if (current.length > 0) rows.push(current)
  return rows
}
