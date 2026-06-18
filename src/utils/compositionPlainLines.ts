import type { CompositionLineData } from './compositionFormat'
import {
  DEFAULT_TRANSLATED_COMPOSITION_LINE_CHARS,
  estimatePartLabelReservedChars,
  splitMaterialsForWrapRows,
} from './balabalaCompositionLayout'

export interface CompositionPlainLine {
  text: string
  /** 续行材质：与首行部位标签后的材质列对齐 */
  continuation?: boolean
  /** 对齐参照的部位标签，如 面料： / Fabric: */
  alignLabel?: string
  /** 首行含部位标签：软折行时悬挂缩进，续行与材质列对齐 */
  hangingLabel?: string
}

export function joinCompositionPlainLines(lines: CompositionPlainLine[]): string {
  return lines.map((line) => line.text).join('\n')
}

/** 估算部位标签占位（ch），用于预览续行缩进 */
export function estimateCompositionAlignCh(label: string): number {
  let ch = 0
  for (const char of label) {
    ch += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char) ? 1 : 0.58
  }
  return Math.max(ch, 0)
}

/** 每材质一行：续行与首行材质列对齐 */
export function compositionLinesToPlainLines(lines: CompositionLineData[]): CompositionPlainLine[] {
  const result: CompositionPlainLine[] = []
  let currentLabel = ''

  for (const line of lines) {
    const label = line.partLabel ?? ''
    const token = (line.token ?? '').trim()
    if (label.trim()) currentLabel = label
    if (!label && !token) continue

    const continuation = !label.trim() && Boolean(token) && Boolean(currentLabel)
    result.push({
      text: label ? `${label}${token}` : token,
      continuation,
      alignLabel: continuation ? currentLabel : undefined,
      hangingLabel: label.trim() ? label : undefined,
    })
  }

  return result
}

/** inline-wrap：折行后续行与首行材质列对齐 */
export function inlineWrapLinesToPlainLines(
  lines: CompositionLineData[],
  wrapCharsPerLine = DEFAULT_TRANSLATED_COMPOSITION_LINE_CHARS,
): CompositionPlainLine[] {
  const result: CompositionPlainLine[] = []

  for (const line of lines) {
    const materials = line.materials?.length
      ? line.materials
      : line.token
        ? [line.token]
        : []
    const splitRows = splitMaterialsForWrapRows(
      materials,
      wrapCharsPerLine,
      estimatePartLabelReservedChars(line.partLabel),
    )

    splitRows.forEach((rowMaterials, rowIndex) => {
      const rowText = rowMaterials.join(' ')
      if (!rowText) return
      if (rowIndex === 0) {
        result.push({ text: `${line.partLabel}${rowText}`, hangingLabel: line.partLabel })
      } else {
        result.push({
          text: rowText,
          continuation: true,
          alignLabel: line.partLabel,
        })
      }
    })
  }

  return result
}

export function formatDownJacketBlockPlainLines(
  partLabel: string,
  lines: string[],
): CompositionPlainLine[] {
  const trimmed = lines.map((line) => line.trim()).filter(Boolean)
  if (!trimmed.length) return [{ text: partLabel.trim() }]
  return [
    { text: partLabel + trimmed[0], hangingLabel: partLabel },
    ...trimmed.slice(1).map((line) => ({
      text: line,
      continuation: true,
      alignLabel: partLabel,
    })),
  ]
}
