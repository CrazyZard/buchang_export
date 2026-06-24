import bidiFactory from 'bidi-js'
import { reshapeArabic } from './arabicShaping'

const bidi = bidiFactory()

/**
 * 逻辑序阿拉伯/混排文本 → 视觉顺序字符串（已整形为呈现形 + bidi 重排）。
 * 之后用 ARIAL 逐字形 LTR 转曲，即得正确的 RTL 视觉 + 连写 + 数字位置。
 */
export function toArabicVisualString(logical: string): string {
  const reshaped = reshapeArabic(logical)
  const embeddingLevels = bidi.getEmbeddingLevels(reshaped, 'rtl')
  return bidi.getReorderedString(reshaped, embeddingLevels, 0, reshaped.length)
}

/**
 * 可编辑 PDF：仅 bidi 重排，保留基础阿拉伯字母（不换成呈现形）。
 * 可编辑 PDF 导出已改为逻辑序 + 右锚定位；此函数仍供转曲管线 toArabicVisualString 使用。
 */
export function toArabicVisualBaseString(logical: string): string {
  const embeddingLevels = bidi.getEmbeddingLevels(logical, 'rtl')
  return bidi.getReorderedString(logical, embeddingLevels, 0, logical.length)
}
