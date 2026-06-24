import { isArabicExportText } from './arabicTextExport'
import {
  classifyExportTextBlock,
  isCareAdviceLiveNode,
  isChineseCompositionDigitText,
  isChineseCompositionPartLine,
  isProductCodesSvgBlock,
} from './exportTextBlockKind'
import {
  applyLiveDominantBaseline,
  expandLiveDisplayLines,
  LIVE_LABEL_RIGHT_PADDING_PX,
  LIVE_LABEL_TEXT_WIDTH_PX,
  measureMixedWidth,
  normalizeLiveTextContent,
  readLiveLineYs,
  resolveCenteredLineStartX,
  resolveLiveWrapMaxWidth,
} from './exportTextLiveGeometry'
import {
  appendArabicLiveTspans,
  resolveArabicLiveBoxBounds,
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

async function resolveLtrLineStartX(
  textEl: SVGTextElement,
  line: string,
  fontSize: number,
  role: FontRole,
): Promise<number> {
  const leftX = parseCoord(textEl.getAttribute('data-ex-left'), readTextStartX(textEl))
  if (!isProductCodesSvgBlock(textEl)) return leftX

  const rightX = parseCoord(textEl.getAttribute('data-ex-right'), leftX + LIVE_LABEL_TEXT_WIDTH_PX)
  const lineWidth = await measureMixedWidth(line, fontSize, role)
  return resolveCenteredLineStartX(leftX, rightX, lineWidth)
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

/** 续行缩进后可用宽度变小，对仍超宽的材质续行二次折行 */
async function reflowIndentedPlainLines(
  layouts: CompositionPlainLineLayout[],
  leftX: number,
  fontSize: number,
  defaultRole: FontRole,
): Promise<{ lines: string[]; layouts: CompositionPlainLineLayout[] }> {
  const lines: string[] = []
  const nextLayouts: CompositionPlainLineLayout[] = []

  for (const layout of layouts) {
    const indent = layout.lineX - leftX
    const lineMax =
      indent > 0 ? LIVE_LABEL_TEXT_WIDTH_PX - indent : LIVE_LABEL_TEXT_WIDTH_PX
    const subLines = await expandLiveDisplayLines([layout.text], lineMax, fontSize, defaultRole)
    for (const sub of subLines) {
      lines.push(sub)
      nextLayouts.push({ text: sub, lineX: layout.lineX })
    }
  }

  return { lines, layouts: nextLayouts }
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
  defaultRole: FontRole = 'latin',
): Promise<boolean> {
  const content = textEl.textContent ?? ''
  if (!content.trim()) return false
  const startX = await resolveLtrLineStartX(textEl, content, fontSize, defaultRole)
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
  const rawLeftX = parseCoord(textEl.getAttribute('data-ex-left'), readTextStartX(textEl))
  const rawRightX = parseCoord(textEl.getAttribute('data-ex-right'), rawLeftX)
  const { leftX, rightX } = resolveArabicLiveBoxBounds(textEl, rawLeftX, rawRightX)
  const isPlainComposition = isCompositionPlainSvgBlock(textEl)
  const isCareAdvice = isCareAdviceLiveSvgBlock(textEl)

  const rawLines = splitLiveLines(textEl.textContent ?? '')
  if (!rawLines.length) return false

  const maxWidth = resolveLiveWrapMaxWidth(leftX, rightX, {
    isPlainComposition,
    isCareAdvice,
  })
  let lines = await expandLiveDisplayLines(rawLines, maxWidth, fontSize, defaultRole)

  if (!lines.length) return false

  let plainLayouts = isPlainComposition
    ? await layoutCompositionPlainLines(lines, leftX, fontSize, defaultRole)
    : null

  if (plainLayouts) {
    const reflowed = await reflowIndentedPlainLines(plainLayouts, leftX, fontSize, defaultRole)
    lines = reflowed.lines
    plainLayouts = reflowed.layouts
  }

  const lineYs = readLiveLineYs(textEl, lines.length)

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
      // 阿语多行：续行不应受 plainLayouts 缩进影响（LTR 的 indentPx 对 RTL 无意义），统一用 leftX
      const lineBounds = resolveArabicLiveBoxBounds(textEl, leftX, rightX, leftX)
      await appendArabicLiveTspans(
        textEl,
        line,
        lineBounds.leftX,
        lineBounds.rightX,
        lineY,
        fontSize,
        fill,
      )
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

  const rawLeftX = parseCoord(textEl.getAttribute('data-ex-left'), readTextStartX(textEl))
  const rawRightX = parseCoord(textEl.getAttribute('data-ex-right'), rawLeftX)
  const { leftX, rightX: capturedRightX } = resolveArabicLiveBoxBounds(textEl, rawLeftX, rawRightX)
  // 阿语标题 / 洗涤说明等：统一右对齐到标签右边界（与成分内容一致），扣除 1mm 右边距
  const rightX = Math.max(
    capturedRightX,
    LIVE_LABEL_TEXT_WIDTH_PX - LIVE_LABEL_RIGHT_PADDING_PX,
  )
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
    return renderPlainLiveText(
      textEl,
      fontSize,
      fill,
      (text, x, y) => appendBestLtrLiveTspans(textEl, text, x, y, fontSize, fill, defaultRole),
      defaultRole,
    )
  }

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
    const startX = await resolveLtrLineStartX(textEl, lines[i], fontSize, defaultRole)
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
