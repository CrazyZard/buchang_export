import type { Dictionary, LabelData } from '../types'
import { FIXED_LABELS } from '../types'
import type { WashLabelTemplate } from '../templates'
import { resolveCompositionParts } from '../templates'
import {
  buildCompositionLines,
  getCompositionItems,
  translateCompositionLabel,
  type CompositionLineData,
} from './compositionFormat'
import {
  DEFAULT_TRANSLATED_COMPOSITION_LINE_CHARS,
  resolveTranslatedCompositionInlineWrap,
  resolveTranslatedCompositionWrapChars,
  shouldJoinTranslatedMaterials,
} from './balabalaCompositionLayout'
import { getExtendedLinesForPart } from './parseCompositionPaste'
import { translateText } from './dictionary'
import {
  compositionLinesToPlainLines,
  formatDownJacketBlockPlainLines,
  inlineWrapLinesToPlainLines,
  joinCompositionPlainLines,
  type CompositionPlainLine,
} from './compositionPlainLines'

export type { CompositionPlainLine } from './compositionPlainLines'
export { estimateCompositionAlignCh } from './compositionPlainLines'

function formatTranslatedLineLabel(dictionary: Dictionary, label: string, lang: string): string {
  const translated = translateText(dictionary, label, lang).trim()
  const text = translated.startsWith('[') ? label : translated
  return text.endsWith(':') || text.endsWith('：') ? text : `${text}:`
}

/** 多行成分：部位标签 + 材质 token，行间 \\n */
export function compositionLinesToPlainText(lines: CompositionLineData[]): string {
  return joinCompositionPlainLines(compositionLinesToPlainLines(lines))
}

/** inline-wrap：与页面折行一致 */
export function inlineWrapLinesToPlainText(
  lines: CompositionLineData[],
  wrapCharsPerLine = DEFAULT_TRANSLATED_COMPOSITION_LINE_CHARS,
): string {
  return joinCompositionPlainLines(inlineWrapLinesToPlainLines(lines, wrapCharsPerLine))
}

function linesForItems(
  dictionary: Dictionary,
  lang: string,
  partLabel: string,
  items: LabelData['composition']['fabric'],
  spaced: boolean,
  singleLine: boolean,
): CompositionLineData[] {
  return buildCompositionLines({
    partLabel,
    items: items.filter((item) => item.percentage.trim() || item.name.trim()),
    spaced,
    translateName: (name) => translateText(dictionary, name, lang),
    singleLine,
  })
}

function blockPlainLines(
  lines: CompositionLineData[],
  inlineWrap: boolean,
  wrapCharsPerLine: number,
): CompositionPlainLine[] {
  if (!lines.length) return []
  return inlineWrap
    ? inlineWrapLinesToPlainLines(lines, wrapCharsPerLine)
    : compositionLinesToPlainLines(lines)
}

export interface TranslatedCompositionPlainOptions {
  data: LabelData
  dictionary: Dictionary
  lang: string
  template: WashLabelTemplate
}

/** 翻译区单个 lang-block 成分全文（标题 + 换行 + 空格排版） */
export function buildTranslatedCompositionPlainLines({
  data,
  dictionary,
  lang,
  template,
}: TranslatedCompositionPlainOptions): CompositionPlainLine[] {
  const parts = resolveCompositionParts(template)
  const layoutMode = template.layout.translatedCompositionLayout
  const extended = data.extendedComposition
  const fabricExtended = getExtendedLinesForPart(extended, 'fabric')
  const skipFabric = fabricExtended.length > 0
  const partKeys = parts.map(({ key }) => key)
  const useInlineWrapLayout = resolveTranslatedCompositionInlineWrap(layoutMode, data, partKeys)
  const baseWrapChars =
    template.layout.translatedCompositionLineChars ?? DEFAULT_TRANSLATED_COMPOSITION_LINE_CHARS
  const wrapChars = resolveTranslatedCompositionWrapChars(lang, baseWrapChars)

  const rows: CompositionPlainLine[] = [
    { text: translateCompositionLabel(dictionary, FIXED_LABELS.composition, lang) },
  ]

  if (extended?.sectionTitle) {
    rows.push({
      text: translateCompositionLabel(dictionary, extended.sectionTitle, lang),
    })
  }

  const appendBlock = (lines: CompositionLineData[], itemCount: number) => {
    const block = blockPlainLines(
      lines,
      useInlineWrapLayout && shouldJoinTranslatedMaterials(layoutMode, itemCount),
      wrapChars,
    )
    if (block.length) rows.push(...block)
  }

  for (const line of fabricExtended) {
    const items = line.items.filter((item) => item.percentage.trim() || item.name.trim())
    appendBlock(
      linesForItems(
        dictionary,
        lang,
        formatTranslatedLineLabel(dictionary, line.label, lang),
        items,
        true,
        useInlineWrapLayout && shouldJoinTranslatedMaterials(layoutMode, items.length),
      ),
      items.length,
    )
  }

  for (const { key, label } of parts) {
    if (skipFabric && key === 'fabric') continue
    const items = getCompositionItems(data, key)
    const join = useInlineWrapLayout && shouldJoinTranslatedMaterials(layoutMode, items.length)
    appendBlock(
      linesForItems(
        dictionary,
        lang,
        translateCompositionLabel(dictionary, label, lang),
        items,
        true,
        join,
      ),
      items.length,
    )

    for (const extLine of getExtendedLinesForPart(extended, key)) {
      const extItems = extLine.items.filter((item) => item.percentage.trim() || item.name.trim())
      appendBlock(
        linesForItems(
          dictionary,
          lang,
          formatTranslatedLineLabel(dictionary, extLine.label, lang),
          extItems,
          true,
          useInlineWrapLayout && shouldJoinTranslatedMaterials(layoutMode, extItems.length),
        ),
        extItems.length,
      )
    }
  }

  for (const note of extended?.footnotes ?? []) {
    const translated = translateText(dictionary, note, lang).trim()
    if (translated) rows.push({ text: translated })
  }

  return rows.filter((line) => line.text.trim().length > 0)
}

export function buildTranslatedCompositionPlainText(
  options: TranslatedCompositionPlainOptions,
): string {
  return joinCompositionPlainLines(buildTranslatedCompositionPlainLines(options))
}

export interface SourceCompositionPlainOptions {
  data: LabelData
  template: WashLabelTemplate
}

/** 中文源稿成分区（带续行对齐元数据） */
export function buildSourceCompositionPlainLines({
  data,
  template,
}: SourceCompositionPlainOptions): CompositionPlainLine[] {
  const parts = resolveCompositionParts(template)
  const extended = data.extendedComposition
  const fabricExtended = getExtendedLinesForPart(extended, 'fabric')
  const skipFabric = fabricExtended.length > 0

  const rows: CompositionPlainLine[] = [{ text: FIXED_LABELS.composition }]

  if (extended?.sectionTitle) {
    rows.push({ text: `${extended.sectionTitle}：` })
  }

  const appendLines = (lines: CompositionLineData[]) => {
    const block = compositionLinesToPlainLines(lines)
    if (block.length) rows.push(...block)
  }

  for (const line of fabricExtended) {
    appendLines(
      buildCompositionLines({
        partLabel: `${line.label}：`,
        items: line.items.filter((item) => item.percentage.trim() || item.name.trim()),
        spaced: false,
      }),
    )
  }

  for (const { key, label } of parts) {
    if (skipFabric && key === 'fabric') continue
    appendLines(
      buildCompositionLines({
        partLabel: `${label}：`,
        items: getCompositionItems(data, key),
        spaced: false,
      }),
    )
    for (const extLine of getExtendedLinesForPart(extended, key)) {
      appendLines(
        buildCompositionLines({
          partLabel: `${extLine.label}：`,
          items: extLine.items.filter((item) => item.percentage.trim() || item.name.trim()),
          spaced: false,
        }),
      )
    }
  }

  for (const note of extended?.footnotes ?? []) {
    if (note.trim()) rows.push({ text: note.trim() })
  }

  return rows.filter((line) => line.text.trim().length > 0)
}

/** 中文源稿成分区全文 */
export function buildSourceCompositionPlainText(
  options: SourceCompositionPlainOptions,
): string {
  return joinCompositionPlainLines(buildSourceCompositionPlainLines(options))
}

export function formatDownJacketBlockPlain(partLabel: string, lines: string[]): string {
  return joinCompositionPlainLines(formatDownJacketBlockPlainLines(partLabel, lines))
}

export function buildDownJacketCompositionPlainLines(
  blocks: Array<{ partLabel: string; lines: string[] }>,
): CompositionPlainLine[] {
  return blocks.flatMap(({ partLabel, lines }) => formatDownJacketBlockPlainLines(partLabel, lines))
}

export function buildDownJacketCompositionPlainText(
  blocks: Array<{ partLabel: string; lines: string[] }>,
): string {
  return joinCompositionPlainLines(buildDownJacketCompositionPlainLines(blocks))
}
