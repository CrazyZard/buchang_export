import type {
  CompositionPart,
  CompositionSection,
  DownFillColumn,
  DownFillGrid,
  DownJacketComposition,
  ExtendedComposition,
  ExtendedCompositionLine,
  LabelData,
  MaterialItem,
} from '../types'
import { createEmptyComposition, createMaterial } from './labelDefaults'

const PART_ALIASES: Record<string, CompositionPart> = {
  主面料: 'fabric',
  面料: 'fabric',
  挂面: 'fabric',
  里料: 'lining',
  填充物: 'filling',
  罗纹: 'ribbing',
}

const PART_LABEL_PATTERN = '主面料|面料|挂面|罗纹|里料|填充物'
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

// ================== 羽绒模板粘贴解析 ==================

function createDownFillColumnFrom(size: string, weight: string, index: number): DownFillColumn {
  return { id: `col-paste-${index}`, size, weight }
}

// ===== 羽绒模板粘贴解析（单元格式表格） =====

interface RawColumn {
  cn: string
  meas: string
  eur: string
  us: string
}

function buildColumnSize(col: RawColumn): string {
  const parts: string[] = []
  if (col.cn) parts.push(col.cn)
  if (col.meas) parts.push(col.meas)
  if (col.eur) parts.push(col.eur)
  if (col.us) parts.push(col.us)
  return parts.join('\n')
}

export function parseDownJacketPaste(
  text: string,
): { downJacket: DownJacketComposition } | null {
  const rawLines = text.split(/\r?\n/)

  const facingLines: string[] = []
  let liningLine = ''
  const stuffingLines: string[] = []
  let fillGridTitle = ''

  // ========== 阶段1：区分成分行 vs 表格行 ==========

  // 找到"充绒量"行作为分界线
  let gridStart = rawLines.findIndex((l) => /^充绒量/.test(l.trim()))
  if (gridStart === -1) {
    // 没有充绒量标题 → 找第一个 CN: 行
    gridStart = rawLines.findIndex((l) => /^CN:/.test(l.trim()))
  }
  if (gridStart === -1) gridStart = rawLines.length

  // 解析成分区（gridStart 之前的行）—— 标签完全保留用户输入，不硬编码
  for (let i = 0; i < gridStart; i++) {
    let line = rawLines[i].trim()
    if (!line) continue
    // 去掉首行"成分"
    if (i === 0) line = line.replace(/^成分/, '').trim()
    if (!line) continue

    if (/^充绒量/.test(line)) {
      const afterLabel = line.replace(/^充绒量\s*[:：]?\s*/, '').trim()
      fillGridTitle = afterLabel ? `充绒量：${afterLabel}` : '充绒量：(单位：克)'
      continue
    }

    const split = splitAtFirstColon(line)

    // 没有冒号的行：按关键词归类
    if (!split) {
      if (/填充物|绒子含量/.test(line)) {
        stuffingLines.push(line)
      } else if (/里料/.test(line)) {
        liningLine = (liningLine ? liningLine + ' ' : '') + line
      } else {
        facingLines.push(line)
      }
      continue
    }

    // 有冒号：按标签关键词归类，保留原始标签文字
    const { label, value } = split
    const fullLine = value ? `${label}：${value}` : label

    if (/填充物|绒子含量/.test(label)) {
      stuffingLines.push(fullLine)
    } else if (/里料/.test(label)) {
      liningLine = value || label
    } else {
      // 面料、罗纹、挂面、A面面料、B面面料…统统归入 facingLines
      facingLines.push(fullLine)
    }
  }

  // ========== 阶段2：按单元格解析充绒量表格 ==========
  const gridLines = rawLines.slice(gridStart)

  // 跳过充绒量标题行
  let gi = 0
  while (gi < gridLines.length && /^充绒量/.test(gridLines[gi].trim())) {
    const afterLabel = gridLines[gi].trim().replace(/^充绒量\s*[:：]?\s*/, '').trim()
    fillGridTitle = afterLabel ? `充绒量：${afterLabel}` : fillGridTitle || '充绒量：(单位：克)'
    gi++
  }

  // 收集所有非纯重量行的单元格（size 信息）
  // 同时记录哪些行是纯重量行
  const rawColumns: RawColumn[] = []
  let colIdx = 0
  const weightLines: { lineIdx: number; cells: string[] }[] = []

  for (let i = gi; i < gridLines.length; i++) {
    const line = gridLines[i].trim()
    if (!line) continue

    const cells = line.split('\t').map((c) => c.trim()).filter(Boolean)
    // 按空格二次切分——克重列可能用空格而非 tab 分隔（如 "123.6 113.3"）
    // 仅当单元格内所有片段都是数字时才切，防止误拆尺寸列
    const resolvedCells = cells.flatMap((c) => {
      const parts = c.split(/\s+/).filter(Boolean)
      if (parts.length > 1 && parts.every((p) => /^\d+\.?\d*$/.test(p))) return parts
      return [c]
    })

    // 判断是否为纯重量行：所有单元格都是数字
    const allNumeric = resolvedCells.every((c) => /^\d+\.?\d*$/.test(c))
    if (allNumeric && resolvedCells.length > 0) {
      weightLines.push({ lineIdx: i, cells: resolvedCells })
      continue
    }

    // 按单元格处理 size 信息
    for (const cell of resolvedCells) {
      if (/^CN:/.test(cell)) {
        // 新列
        rawColumns.push({ cn: cell, meas: '', eur: '', us: '' })
        colIdx = rawColumns.length - 1
      } else if (/^\d{2,}\//.test(cell) || /^\d+\/[A-Z]/.test(cell)) {
        // 号型（如 150/76A）
        if (colIdx < rawColumns.length) rawColumns[colIdx].meas = cell
      } else if (/^EUR:/.test(cell)) {
        if (colIdx < rawColumns.length) rawColumns[colIdx].eur = cell
      } else if (/^US:/.test(cell)) {
        if (colIdx < rawColumns.length) rawColumns[colIdx].us = cell
      }
    }
  }

  // 组装列
  const fillColumns: DownFillColumn[] = rawColumns.map((col, index) =>
    createDownFillColumnFrom(buildColumnSize(col), '', index),
  )

  // 回填克重
  const allWeights = weightLines.flatMap((wl) => wl.cells)
  const emptyCols = fillColumns.filter((c) => c.weight === '')
  for (let wi = 0; wi < allWeights.length && wi < emptyCols.length; wi++) {
    const idx = fillColumns.findIndex((c) => c.weight === '')
    if (idx >= 0) {
      fillColumns[idx] = { ...fillColumns[idx], weight: allWeights[wi] }
    }
  }

  const fillGrid: DownFillGrid = {
    title: fillGridTitle,
    columns: fillColumns,
  }

  return {
    downJacket: {
      facingLines,
      liningLine,
      stuffingLines,
      fillGrid,
    },
  }
}

export function applyDownJacketPaste(current: LabelData, text: string): LabelData {
  const parsed = parseDownJacketPaste(text)
  if (!parsed) return current

  return {
    ...current,
    downJacket: parsed.downJacket,
  }
}

// ================== 青蛙模板粘贴解析 ==================

/** 解析青蛙模板成分文本："材料名 数字"格式 → "数字% 材料名"
 * 示例输入：聚酯纤维 30.0\\n粘纤 25\\n腈纶 25.8\\n锦纶 19.2
 * 示例输出：[{percentage:'30.0%',name:'聚酯纤维'}, ...] 归入 fabric */
export function parseFrogComposition(
  text: string,
): { fabric: { id: string; percentage: string; name: string }[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const items: { id: string; percentage: string; name: string }[] = []

  for (const line of lines) {
    // 匹配 "材料名 数字" 或 "材料名 数字%" 格式
    const match = line.match(/^(.+?)\s+(\d+\.?\d*)\s*%?\s*$/)
    if (match) {
      const name = match[1].trim()
      const pct = match[2]
      items.push({ id: crypto.randomUUID(), percentage: `${pct}%`, name })
    } else {
      // 无法解析的行，作为纯文本保留（如备注）
      if (items.length > 0) {
        items[items.length - 1].name += ' ' + line
      }
    }
  }

  return { fabric: items }
}

export function applyFrogCompositionPaste(current: LabelData, text: string): LabelData {
  const parsed = parseFrogComposition(text)
  return {
    ...current,
    composition: {
      fabric: parsed.fabric,
      ribbing: [],
      lining: [],
      filling: [],
    },
  }
}
