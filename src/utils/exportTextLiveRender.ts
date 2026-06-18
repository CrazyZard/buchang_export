import { isArabicExportText } from './arabicTextExport'
import {
  classifyExportTextBlock,
  isCareAdviceLiveNode,
  isChineseCompositionDigitText,
  isChineseCompositionPartLine,
} from './exportTextBlockKind'
import {
  applyLiveDominantBaseline,
  expandLiveDisplayLines,
  LIVE_LABEL_TEXT_WIDTH_PX,
  measureMixedWidth,
  normalizeLiveTextContent,
  readLiveLineYs,
} from './exportTextLiveGeometry'
import {
  appendArabicLiveTspans,
  appendBestLtrLiveTspans,
  appendLiveTspan,
  appendSplitLiveTspans,
  appendZhUnifiedLiveTspans,
  clearSvgTextChildren,
  readTextStartX,
} from './exportTextLiveUtils'
import type { FontRole } from './svgTextToPathsUtils'
import {
  parseCoord,
  parseColor,
  parseFontSize,
  pickFontRole,
  readTextAnchorY,
} from './svgTextToPathsUtils'

function splitLiveLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').replace(/\s+$/, ''))
    .filter((line) => line.length > 0)
}

function isCompositionPlainSvgBlock(textEl: SVGTextElement): boolean {
  return Boolean(textEl.closest('g.composition-plain, .composition-plain'))
}

function isCareAdviceLiveSvgBlock(textEl: SVGTextElement): boolean {
  return isCareAdviceLiveNode(textEl)
}

const MATERIAL_TOKEN_RE = /^[\d.]+%/

interface CompositionPlainLineLayout {
  text: string
  lineX: number
}

/** 成分续行与首行部位标签后材质列对齐 */
async function layoutCompositionPlainLines(
  lines: string[],
  leftX: number,
  fontSize: number,
  defaultRole: FontRole,
): Promise<CompositionPlainLineLayout[]> {
  let activeLabel = ''
  let indentPx = 0
  const result: CompositionPlainLineLayout[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const headMatch = trimmed.match(/^(.+?)[:：]\s*(.*)$/)
    if (headMatch && (MATERIAL_TOKEN_RE.test(headMatch[2]) || headMatch[2].length > 0)) {
      const colon = trimmed.includes('：') ? '：' : ':'
      activeLabel = `${headMatch[1]}${colon}`
      indentPx = await measureMixedWidth(activeLabel, fontSize, defaultRole)
      result.push({ text: line, lineX: leftX })
      continue
    }

    if (MATERIAL_TOKEN_RE.test(trimmed) && activeLabel && indentPx > 0) {
      result.push({ text: line, lineX: leftX + indentPx })
      continue
    }

    result.push({ text: line, lineX: leftX })
  }

  return result
}

/** dom-to-svg 的 tspan 仅作几何参考；live 导出统一用 textContent，不走走转曲分行 */
function normalizeLiveTextElement(textEl: SVGTextElement): void {
  normalizeLiveTextContent(textEl)
}

export async function renderLiveTextByBlock(
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
): Promise<boolean> {
  const kind = classifyExportTextBlock(textEl)
  switch (kind) {
    case 'composition-single':
      return renderCompositionSingleLive(textEl, fontSize, fill, defaultRole)
    case 'zh-composition':
      return renderZhCompositionLive(textEl, fontSize, fill)
    case 'ltr-grid-head':
      return renderLtrGridHeadLive(textEl, fontSize, fill)
    case 'ltr-grid-body':
      return renderLtrGridBodyLive(textEl, fontSize, fill)
    case 'ltr-translated':
      return renderLtrTranslatedLive(textEl, fontSize, fill, defaultRole)
    case 'arabic-rtl':
      return renderArabicRtlLive(textEl, fontSize, fill)
    case 'generic-ltr':
      return renderGenericLtrLive(textEl, fontSize, fill, defaultRole)
  }
}

async function renderLineLive(
  textEl: SVGTextElement,
  content: string,
  startX: number,
  y: number,
  fontSize: number,
  fill: string,
  draw: (
    content: string,
    startX: number,
    y: number,
  ) => Promise<number>,
): Promise<boolean> {
  if (!content) return false
  clearSvgTextChildren(textEl)
  textEl.removeAttribute('style')
  textEl.removeAttribute('font-family')
  textEl.removeAttribute('direction')
  textEl.removeAttribute('unicode-bidi')
  textEl.setAttribute('fill', fill)
  textEl.setAttribute('font-size', String(fontSize))
  const width = await draw(content, startX, y)
  return width >= 0
}

async function renderPlainLiveText(
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
  draw: (text: string, x: number, y: number) => Promise<number>,
): Promise<boolean> {
  const content = textEl.textContent ?? ''
  if (!content.trim()) return false
  const startX = parseCoord(textEl.getAttribute('data-ex-left'), readTextStartX(textEl))
  const y = readTextAnchorY(textEl)
  applyLiveDominantBaseline(textEl)
  return renderLineLive(textEl, content, startX, y, fontSize, fill, draw)
}

/** 整块成分区 / 洗涤建议：多行单文本框，保留换行与自动折行 */
async function renderCompositionSingleLive(
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
): Promise<boolean> {
  const leftX = parseCoord(textEl.getAttribute('data-ex-left'), readTextStartX(textEl))
  const rightX = parseCoord(textEl.getAttribute('data-ex-right'), leftX)
  const isPlainComposition = isCompositionPlainSvgBlock(textEl)
  const isCareAdvice = isCareAdviceLiveSvgBlock(textEl)

  const rawLines = splitLiveLines(textEl.textContent ?? '')
  if (!rawLines.length) return false

  let lines: string[]
  if (isPlainComposition) {
    lines = rawLines
  } else {
    let maxWidth = rightX > leftX ? rightX - leftX : 0
    if (maxWidth <= 0 || isCareAdvice) maxWidth = LIVE_LABEL_TEXT_WIDTH_PX
    lines = await expandLiveDisplayLines(rawLines, maxWidth, fontSize, defaultRole)
  }

  if (!lines.length) return false

  const lineYs = readLiveLineYs(textEl, lines.length)
  const plainLayouts = isPlainComposition
    ? await layoutCompositionPlainLines(lines, leftX, fontSize, defaultRole)
    : null

  clearSvgTextChildren(textEl)
  textEl.removeAttribute('style')
  textEl.removeAttribute('font-family')
  textEl.removeAttribute('direction')
  textEl.removeAttribute('unicode-bidi')
  textEl.removeAttribute('text-anchor')
  textEl.setAttribute('fill', fill)
  textEl.setAttribute('font-size', String(fontSize))
  applyLiveDominantBaseline(textEl)

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const lineY = lineYs[i] ?? lineYs[0]
    const availLeft = plainLayouts?.[i]?.lineX ?? leftX

    if (isArabicExportText(line)) {
      await appendArabicLiveTspans(textEl, line, availLeft, rightX, lineY, fontSize, fill)
      continue
    }

    if (isCareAdvice) {
      appendLiveTspan(textEl, line, availLeft, lineY, fontSize, fill, 'zh')
      continue
    }

    if (isChineseCompositionDigitText(line) || isChineseCompositionPartLine(line)) {
      await appendBestLtrLiveTspans(textEl, line, availLeft, lineY, fontSize, fill, 'zh')
      continue
    }

    await appendBestLtrLiveTspans(textEl, line, availLeft, lineY, fontSize, fill, defaultRole)
  }

  return true
}

async function renderZhCompositionLive(
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
): Promise<boolean> {
  return renderPlainLiveText(textEl, fontSize, fill, (text, x, y) =>
    appendZhUnifiedLiveTspans(textEl, text, x, y, fontSize, fill),
  )
}

async function renderLtrGridHeadLive(
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
): Promise<boolean> {
  return renderPlainLiveText(textEl, fontSize, fill, (text, x, y) =>
    appendSplitLiveTspans(textEl, text, x, y, fontSize, fill, 'latin', false),
  )
}

async function renderLtrGridBodyLive(
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
): Promise<boolean> {
  return renderPlainLiveText(textEl, fontSize, fill, (text, x, y) => {
    appendLiveTspan(textEl, text, x, y, fontSize, fill, 'latin')
    return Promise.resolve(0)
  })
}

async function renderLtrTranslatedLive(
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
): Promise<boolean> {
  return renderPlainLiveText(textEl, fontSize, fill, (text, x, y) =>
    appendBestLtrLiveTspans(textEl, text, x, y, fontSize, fill, defaultRole),
  )
}

async function renderArabicRtlLive(
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
): Promise<boolean> {
  const lines = splitLiveLines(textEl.textContent ?? '')
  if (!lines.length) return false

  const leftX = parseCoord(textEl.getAttribute('data-ex-left'), readTextStartX(textEl))
  const rightX = parseCoord(textEl.getAttribute('data-ex-right'), leftX)
  const lineYs = readLiveLineYs(textEl, lines.length)

  clearSvgTextChildren(textEl)
  textEl.removeAttribute('style')
  textEl.removeAttribute('font-family')
  textEl.removeAttribute('direction')
  textEl.removeAttribute('unicode-bidi')
  textEl.setAttribute('fill', fill)
  textEl.setAttribute('font-size', String(fontSize))
  applyLiveDominantBaseline(textEl)

  for (let i = 0; i < lines.length; i += 1) {
    const lineY = lineYs[i] ?? lineYs[0]
    await appendArabicLiveTspans(textEl, lines[i], leftX, rightX, lineY, fontSize, fill)
  }

  return true
}

async function renderGenericLtrLive(
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
): Promise<boolean> {
  const lines = splitLiveLines(textEl.textContent ?? '')
  if (lines.length <= 1) {
    return renderPlainLiveText(textEl, fontSize, fill, (text, x, y) =>
      appendBestLtrLiveTspans(textEl, text, x, y, fontSize, fill, defaultRole),
    )
  }

  const startX = parseCoord(textEl.getAttribute('data-ex-left'), readTextStartX(textEl))
  const lineYs = readLiveLineYs(textEl, lines.length)

  clearSvgTextChildren(textEl)
  textEl.removeAttribute('style')
  textEl.removeAttribute('font-family')
  textEl.removeAttribute('direction')
  textEl.removeAttribute('unicode-bidi')
  textEl.setAttribute('fill', fill)
  textEl.setAttribute('font-size', String(fontSize))
  applyLiveDominantBaseline(textEl)

  for (let i = 0; i < lines.length; i += 1) {
    const lineY = lineYs[i] ?? lineYs[0]
    await appendBestLtrLiveTspans(textEl, lines[i], startX, lineY, fontSize, fill, defaultRole)
  }

  return true
}

export async function convertTextElementToLive(
  textEl: SVGTextElement,
  forceRole?: FontRole,
): Promise<boolean> {
  normalizeLiveTextElement(textEl)

  const fontFamily = textEl.getAttribute('font-family') || ''
  const fullText = textEl.textContent ?? ''
  const fontSize = parseFontSize(textEl.getAttribute('font-size'))
  const fill = parseColor(textEl.getAttribute('fill'))

  const role =
    forceRole ??
    (isArabicExportText(fullText) ? 'arabic' : pickFontRole(fontFamily, fullText))

  return renderLiveTextByBlock(textEl, fontSize, fill, role)
}
