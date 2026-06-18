import type {
  CompositionPart,
  CompositionSection,
  ExtendedComposition,
  ExtendedCompositionLine,
  LabelData,
  MaterialItem,
} from '../types'
import { createEmptyComposition, createMaterial } from './labelDefaults'

const PART_ALIASES: Record<string, CompositionPart> = {
  主面料: 'fabric',
  面料: 'fabric',
  罗纹: 'ribbing',
  里料: 'lining',
  填充物: 'filling',
}

const PART_LABEL_PATTERN = '主面料|面料|罗纹|里料|填充物'
const INLINE_PART_SPLIT_RE = new RegExp(`\\s+(?=(?:${PART_LABEL_PATTERN})\\s*[:：])`)

export interface ParsedCompositionPaste {
  composition: CompositionSection
  extended?: ExtendedComposition
}

function newMaterialId(prefix: string, index: number) {
  return `${prefix}-${index}-${crypto.randomUUID().slice(0, 8)}`
}

function normalizePartLabel(label: string) {
  return label.replace(/[:：]\s*$/, '').trim()
}

function isFootnoteLine(line: string) {
  const trimmed = line.trim()
  return /^[（(].*[）)]$/.test(trimmed) && !/\d+(?:\.\d+)?%/.test(trimmed)
}

/** 一行内夹带「罗纹：」「里料：」等时拆成多行 */
function splitCompositionLine(rawLine: string): string[] {
  const colonIndex = rawLine.search(/[:：]/)
  if (colonIndex === -1) return [rawLine]

  const label = rawLine.slice(0, colonIndex).trim()
  const value = rawLine.slice(colonIndex + 1).trim()
  const partKey = resolvePartKey(label)

  if (partKey && value) {
    const segments = value.split(INLINE_PART_SPLIT_RE)
    if (segments.length <= 1) return [rawLine]

    const lines = [`${label}：${segments[0].trim()}`]
    for (let i = 1; i < segments.length; i++) {
      lines.push(segments[i].trim())
    }
    return lines
  }

  const inlineSplit = rawLine.split(INLINE_PART_SPLIT_RE)
  if (inlineSplit.length <= 1) return [rawLine]
  return inlineSplit.map((segment) => segment.trim()).filter(Boolean)
}

function splitAtFirstColon(line: string): { label: string; value: string } | null {
  const colonIndex = line.search(/[:：]/)
  if (colonIndex === -1) return null
  return {
    label: line.slice(0, colonIndex).trim(),
    value: line.slice(colonIndex + 1).trim(),
  }
}

/** 数字后缺 % 时自动补上，如「聚酯纤维65.5再生纤维素纤维34.5」 */
function normalizeMissingPercentages(text: string) {
  return text.replace(/(\d+(?:\.\d+)?)(?!%)/g, '$1%')
}

function parsePercentLeadingTokens(text: string): Omit<MaterialItem, 'id'>[] {
  const tokens: Omit<MaterialItem, 'id'>[] = []
  const re = /(\d+(?:\.\d+)?%)([^%\d]+?)(?=\d+(?:\.\d+)?%|$)/g
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    const name = match[2].trim()
    if (name) tokens.push({ percentage: match[1], name })
  }

  return tokens
}

function parseNameLeadingTokens(text: string): Omit<MaterialItem, 'id'>[] {
  const tokens: Omit<MaterialItem, 'id'>[] = []
  const re = /([^%\d]+?)(\d+(?:\.\d+)?%)/g
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    const name = match[1].trim()
    if (name) tokens.push({ percentage: match[2], name })
  }

  return tokens
}

/** 从「62.0%聚酯纤维38.0%棉」或「聚酯纤维65.5再生纤维素纤维34.5」解析材质 token */
export function parseMaterialTokens(text: string): Omit<MaterialItem, 'id'>[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  let tokens = parsePercentLeadingTokens(trimmed)
  if (tokens.length > 0) return tokens

  const normalized = normalizeMissingPercentages(trimmed)
  tokens = parsePercentLeadingTokens(normalized)
  if (tokens.length > 0) return tokens

  tokens = parseNameLeadingTokens(normalized)
  if (tokens.length > 0) return tokens

  const singlePercentFirst = trimmed.match(/^(\d+(?:\.\d+)?%)(.+)$/)
  if (singlePercentFirst) {
    return [{ percentage: singlePercentFirst[1], name: singlePercentFirst[2].trim() }]
  }

  const singleNameFirst = normalized.match(/^(.+?)(\d+(?:\.\d+)?%)$/)
  if (singleNameFirst) {
    return [{ percentage: singleNameFirst[2], name: singleNameFirst[1].trim() }]
  }

  return []
}

function toMaterialItems(tokens: Omit<MaterialItem, 'id'>[], idPrefix: string): MaterialItem[] {
  return tokens.map((token, index) =>
    createMaterial(newMaterialId(idPrefix, index), token.percentage, token.name),
  )
}

function resolvePartKey(label: string): CompositionPart | null {
  const normalized = normalizePartLabel(label)
  return PART_ALIASES[normalized] ?? null
}

function isPartHeaderOnly(label: string, value: string) {
  return resolvePartKey(label) !== null && !value.trim()
}

function isExtendedSubLine(label: string, value: string) {
  if (!value.trim()) return false
  if (resolvePartKey(label) !== null) return false
  return true
}

function pushExtendedLine(
  extendedLines: ExtendedCompositionLine[],
  part: CompositionPart,
  label: string,
  value: string,
) {
  const items = toMaterialItems(parseMaterialTokens(value), 'ext')
  extendedLines.push({
    id: newMaterialId('ext-line', extendedLines.length),
    label: normalizePartLabel(label),
    part,
    items:
      items.length > 0
        ? items
        : [{ id: newMaterialId('ext', 0), percentage: '', name: value }],
  })
}

export function getExtendedLinesForPart(
  extended: ExtendedComposition | undefined,
  part: CompositionPart,
) {
  if (!extended) return []
  return extended.lines.filter((line) => (line.part ?? 'fabric') === part)
}

export function parseCompositionPaste(text: string): ParsedCompositionPaste {
  const composition = createEmptyComposition()
  const footnotes: string[] = []
  const extendedLines: ExtendedComposition['lines'] = []
  let sectionTitle: string | undefined
  let currentPart: CompositionPart | null = null
  let fabricPartDeclared = false

  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const rawLine of rawLines) {
    for (const line of splitCompositionLine(rawLine)) {
      if (isFootnoteLine(line)) {
        footnotes.push(line)
        continue
      }

      const split = splitAtFirstColon(line)
      if (!split) continue

      const { label, value } = split
      const partKey = resolvePartKey(label)

      if (partKey && isPartHeaderOnly(label, value)) {
        currentPart = partKey
        if (partKey === 'fabric') fabricPartDeclared = true
        if (partKey === 'fabric' && (label === '主面料' || label.includes('主'))) {
          sectionTitle = normalizePartLabel(label)
        }
        continue
      }

      if (partKey && value) {
        const nested = splitAtFirstColon(value)
        if (nested && resolvePartKey(nested.label) === null) {
          pushExtendedLine(extendedLines, partKey, nested.label, nested.value)
          currentPart = partKey
          fabricPartDeclared = true
          if (partKey === 'fabric' && !sectionTitle && (label === '主面料' || label.includes('主'))) {
            sectionTitle = normalizePartLabel(label)
          }
          continue
        }

        const items = toMaterialItems(parseMaterialTokens(value), partKey)
        if (items.length > 0) {
          composition[partKey].push(...items)
        }
        currentPart = partKey
        if (partKey === 'fabric') fabricPartDeclared = true
        continue
      }

      if (isExtendedSubLine(label, value)) {
        const part = currentPart ?? 'fabric'
        pushExtendedLine(extendedLines, part, label, value)
        if (!sectionTitle && part === 'fabric' && !fabricPartDeclared) {
          sectionTitle = '主面料'
        }
        continue
      }

      if (!value && label) {
        sectionTitle = normalizePartLabel(label)
      }
    }
  }

  const extended: ExtendedComposition | undefined =
    extendedLines.length > 0 || footnotes.length > 0 || sectionTitle
      ? {
          sectionTitle,
          lines: extendedLines,
          footnotes,
        }
      : undefined

  return { composition, extended }
}

export function applyCompositionPaste(current: LabelData, text: string): LabelData {
  const parsed = parseCompositionPaste(text)

  return {
    ...current,
    composition: parsed.composition,
    extendedComposition: parsed.extended,
  }
}
