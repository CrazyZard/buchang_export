import { LIVE_EXPORT_SINGLE_TEXT_CLASS } from './flattenCompositionBlocksForLive'
import { extractLiveTextLines } from './exportTextLiveGeometry'
import {
  INTRA_TEXT_LINE_Y_TOLERANCE,
  parseCoord,
  parseFontSize,
  parseLineHeight,
  readTextAnchorY,
} from './svgTextToPathsUtils'

function normalizeMergedLines(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').replace(/\s+$/, ''))
    .filter(Boolean)
    .join('\n')
}

function collapseTextToPlain(primary: SVGTextElement, content: string, lineYs: number[]): void {
  while (primary.firstChild) {
    primary.removeChild(primary.firstChild)
  }
  primary.textContent = content
  primary.removeAttribute('font-family')
  primary.removeAttribute('style')
  if (lineYs.length > 1) {
    primary.setAttribute('data-ex-line-ys', lineYs.map(String).join(','))
  } else {
    primary.removeAttribute('data-ex-line-ys')
  }
}

function absorbMergedGeometry(texts: SVGTextElement[]): void {
  if (texts.length <= 1) return
  let left = Infinity
  let right = -Infinity
  for (const textEl of texts) {
    const l = parseCoord(textEl.getAttribute('data-ex-left'))
    const r = parseCoord(textEl.getAttribute('data-ex-right'))
    if (Number.isFinite(l)) left = Math.min(left, l)
    if (Number.isFinite(r)) right = Math.max(right, r)
  }
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return
  texts[0].setAttribute('data-ex-left', String(left))
  texts[0].setAttribute('data-ex-right', String(right))
}

function readTextAnchorX(textEl: SVGTextElement): number {
  const stored = parseCoord(textEl.getAttribute('data-ex-left'))
  if (Number.isFinite(stored)) return stored
  const tspan = textEl.querySelector('tspan')
  if (tspan) return parseCoord(tspan.getAttribute('x'))
  return parseCoord(textEl.getAttribute('x'))
}

interface TextFragment {
  el: SVGTextElement
  content: string
  x: number
  y: number
  order: number
}

/** 洗涤建议等段落：按行高容差合并同行词碎片，避免逐词断行 */
function resolveParagraphLineYTolerance(fragments: TextFragment[]): number {
  if (!fragments.length) return INTRA_TEXT_LINE_Y_TOLERANCE
  const fontSize = parseFontSize(fragments[0].el.getAttribute('font-size'))
  const lineHeight = parseLineHeight(fragments[0].el.getAttribute('line-height'), fontSize)
  return Math.max(INTRA_TEXT_LINE_Y_TOLERANCE, lineHeight * 0.45)
}

function isCareAdviceMergeContainer(container: SVGElement): boolean {
  const cls = container.getAttribute('class') ?? ''
  return cls.includes('care-advice-live') || cls.includes('label-source-advice')
}

/** 同行碎片横向拼接，仅不同 y 才插入换行（避免 面料：/57.7/% 被拆成多段） */
function mergeFragmentLines(
  fragments: TextFragment[],
  lineYTolerance = INTRA_TEXT_LINE_Y_TOLERANCE,
): { content: string; lineYs: number[] } {
  if (!fragments.length) return { content: '', lineYs: [] }

  const sorted = [...fragments].sort((a, b) => a.y - b.y || a.x - b.x || a.order - b.order)
  const lineGroups: TextFragment[][] = []

  for (const item of sorted) {
    const group = lineGroups.find(
      (line) => Math.abs(line[0].y - item.y) <= lineYTolerance,
    )
    if (group) group.push(item)
    else lineGroups.push([item])
  }

  const lines: string[] = []
  const lineYs: number[] = []

  for (const group of lineGroups) {
    group.sort((a, b) => a.x - b.x || a.order - b.order)
    const text = group.map((item) => item.content).join('')
    if (!text) continue
    lines.push(text)
    lineYs.push(group[0].y)
  }

  return { content: normalizeMergedLines(lines.join('\n')), lineYs }
}

function mergeTextsInContainer(container: SVGElement): void {
  const texts = [...container.querySelectorAll('text')]
  if (texts.length <= 1) return

  const fragments: TextFragment[] = []
  texts.forEach((textEl, order) => {
    const { content } = extractLiveTextLines(textEl)
    const trimmed = content.replace(/\s+/g, ' ').trim()
    if (!trimmed) return
    fragments.push({
      el: textEl,
      content: trimmed,
      x: readTextAnchorX(textEl),
      y: readTextAnchorY(textEl),
      order,
    })
  })

  if (fragments.length <= 1) return

  const lineYTolerance = isCareAdviceMergeContainer(container)
    ? resolveParagraphLineYTolerance(fragments)
    : INTRA_TEXT_LINE_Y_TOLERANCE
  const { content: merged, lineYs } = mergeFragmentLines(fragments, lineYTolerance)
  if (!merged) return

  const primary = fragments[0].el
  absorbMergedGeometry(texts)
  for (let i = 1; i < texts.length; i += 1) {
    texts[i].remove()
  }
  collapseTextToPlain(primary, merged, lineYs)
}

/** dom-to-svg 偶发拆成多个 text / tspan 时，合并为单段多行（一个 AI 文本框） */
export function mergeLiveSingleTextBlocks(svg: SVGSVGElement): void {
  const processed = new Set<SVGElement>()

  const containerSelectors = [
    `.${LIVE_EXPORT_SINGLE_TEXT_CLASS}`,
    'g.composition-plain',
    'g.label-source-body',
    'g.label-translated-body',
    'g.label-source-advice',
    'g.care-advice-live',
    'g.product-codes',
  ]

  for (const selector of containerSelectors) {
    for (const container of svg.querySelectorAll<SVGElement>(selector)) {
      if (processed.has(container)) continue
      if (
        selector !== `.${LIVE_EXPORT_SINGLE_TEXT_CLASS}` &&
        container.closest(`.${LIVE_EXPORT_SINGLE_TEXT_CLASS}`)
      ) {
        continue
      }
      processed.add(container)
      mergeTextsInContainer(container)
    }
  }
}
