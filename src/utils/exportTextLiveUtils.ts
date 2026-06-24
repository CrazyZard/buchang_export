import { ARABIC_RENDER_OPTIONS, coalesceDigitPercentRuns, isArabicExportText, splitRtlWeakTrailingPunct } from './arabicTextExport'
import { svgFontFamilyForRole } from './pdfFontFamilies'
import {
  isChineseCompositionDigitText,
  isChineseCompositionPartLine,
} from './exportTextBlockKind'
import {
  ARABIC_RE,
  splitTextByFontRole,
  textContainsCjkOrPunct,
  toFzPercentGlyph,
} from './textScriptDetect'
import type { FontRole } from './svgTextToPathsUtils'
import { LIVE_LABEL_RIGHT_PADDING_PX, LIVE_LABEL_TEXT_WIDTH_PX } from './exportTextLiveGeometry'
import {
  measureAdvance,
  parseCoord,
  resolveFontForRole,
} from './svgTextToPathsUtils'

const SVG_NS = 'http://www.w3.org/2000/svg'

function renderOptionsForRole(role: FontRole): object | undefined {
  return role === 'arabic' ? ARABIC_RENDER_OPTIONS : undefined
}

export function clearSvgTextChildren(textEl: SVGTextElement): void {
  while (textEl.firstChild) {
    textEl.removeChild(textEl.firstChild)
  }
}

export function appendLiveTspan(
  textEl: SVGTextElement,
  content: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  role: FontRole,
  textAnchor: 'start' | 'end' = 'start',
  runWidth?: number,
): number {
  if (!content) return 0
  const doc = textEl.ownerDocument
  if (!doc) return 0

  const tspan = doc.createElementNS(SVG_NS, 'tspan')
  tspan.setAttribute('x', String(x))
  tspan.setAttribute('y', String(y))
  if (textAnchor === 'end') {
    tspan.setAttribute('text-anchor', 'end')
  }
  if (runWidth !== undefined && Number.isFinite(runWidth) && runWidth > 0) {
    tspan.setAttribute('data-ex-run-width', String(runWidth))
  }
  tspan.setAttribute('font-family', svgFontFamilyForRole(role))
  tspan.setAttribute('font-size', String(fontSize))
  tspan.setAttribute('fill', fill)
  tspan.setAttribute('dominant-baseline', 'text-after-edge')
  const rendered = role === 'zh' ? toFzPercentGlyph(content) : content
  tspan.textContent = rendered
  textEl.appendChild(tspan)
  return rendered.length
}

export function applyRtlLiveTextElement(textEl: SVGTextElement): void {
  textEl.setAttribute('direction', 'rtl')
  textEl.setAttribute('unicode-bidi', 'plaintext')
}

async function measureRunAdvance(
  role: FontRole,
  content: string,
  fontSize: number,
): Promise<number> {
  const font = await resolveFontForRole(role)
  if (!font) {
    const ratio = role === 'latin' ? 0.5 : role === 'arabic' ? 0.55 : 0.95
    return content.length * fontSize * ratio
  }
  return measureAdvance(font, content, fontSize, renderOptionsForRole(role))
}

export async function appendSplitLiveTspans(
  textEl: SVGTextElement,
  text: string,
  startX: number,
  y: number,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
  rtlArabic: boolean,
): Promise<number> {
  const runs = splitTextByFontRole(text, defaultRole)
  let cursorX = startX

  for (const run of runs) {
    if (rtlArabic && run.role === 'arabic') {
      const { core, trail } = splitRtlWeakTrailingPunct(run.content)
      if (trail) {
        appendLiveTspan(textEl, trail, cursorX, y, fontSize, fill, run.role)
        cursorX += await measureRunAdvance(run.role, trail, fontSize)
      }
      if (core) {
        appendLiveTspan(textEl, core, cursorX, y, fontSize, fill, run.role)
        cursorX += await measureRunAdvance(run.role, core, fontSize)
      }
      continue
    }

    appendLiveTspan(textEl, run.content, cursorX, y, fontSize, fill, run.role)
    const measureText = run.role === 'zh' ? toFzPercentGlyph(run.content) : run.content
    cursorX += await measureRunAdvance(run.role, measureText, fontSize)
  }

  return cursorX - startX
}

/** 中文成分行：数字 GO + %/中文 FZ + 西里尔/拉丁 GO */
export async function appendZhUnifiedLiveTspans(
  textEl: SVGTextElement,
  text: string,
  startX: number,
  y: number,
  fontSize: number,
  fill: string,
): Promise<number> {
  const match = text.match(/^([\d.]+)(%?)([\s\S]*)$/)
  if (!match?.[1]) {
    appendLiveTspan(textEl, text, startX, y, fontSize, fill, 'zh')
    return 0
  }

  const digits = match[1]
  const percentAndRest = `${match[2] ?? ''}${match[3] ?? ''}`
  let cursorX = startX

  appendLiveTspan(textEl, digits, cursorX, y, fontSize, fill, 'latin')
  cursorX += await measureRunAdvance('latin', digits, fontSize)

  if (percentAndRest) {
    cursorX += await appendSplitLiveTspans(
      textEl,
      percentAndRest,
      cursorX,
      y,
      fontSize,
      fill,
      'zh',
      false,
    )
  }

  return cursorX - startX
}

/** 成分行是否需按数字 / % / 文字分字体 */
function needsCompositionFontSplit(text: string): boolean {
  return /%/.test(text) || /[\d.]/.test(text) || textContainsCjkOrPunct(text)
}

export async function appendBestLtrLiveTspans(
  textEl: SVGTextElement,
  text: string,
  startX: number,
  y: number,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
): Promise<number> {
  if (!text) return 0

  if (isChineseCompositionDigitText(text)) {
    return appendZhUnifiedLiveTspans(textEl, text, startX, y, fontSize, fill)
  }

  if (isChineseCompositionPartLine(text)) {
    return appendSplitLiveTspans(textEl, text, startX, y, fontSize, fill, 'zh', false)
  }

  if (needsCompositionFontSplit(text)) {
    return appendSplitLiveTspans(textEl, text, startX, y, fontSize, fill, defaultRole, false)
  }

  if (!ARABIC_RE.test(text) && !textContainsCjkOrPunct(text)) {
    appendLiveTspan(textEl, text, startX, y, fontSize, fill, 'latin')
    return 0
  }

  return appendSplitLiveTspans(textEl, text, startX, y, fontSize, fill, defaultRole, false)
}

/** 可编辑 PDF：逻辑序基础字母；阿语交换括号（(↔)、（↔）），补偿 PDF 无 bidi 括号镜像 */
function liveArabicGlyphText(text: string, role: FontRole): string {
  if (role === 'zh') return toFzPercentGlyph(text)
  if (role === 'arabic') {
    return text.replace(/[()（）]/g, (ch) => {
      if (ch === '(') return ')'
      if (ch === ')') return '('
      if (ch === '（') return '）'
      return '（'
    })
  }
  return text
}

export function isArabicRtlExportContext(textEl: SVGTextElement): boolean {
  if (textEl.closest('g.rtl, .rtl, g[dir="rtl"], [dir="rtl"]')) return true
  const host = textEl.closest(
    'g.composition-plain, .composition-plain, g.live-export-single-text.composition-plain, .live-export-single-text.composition-plain',
  )
  if (host?.getAttribute('dir') === 'rtl') return true
  if (host && isArabicExportText(textEl.textContent ?? '')) return true
  return false
}

/** 翻译区整块成分（composition-plain）：右缘贴 25mm，勿用 token 级 captured 宽度 */
function usesArabicTranslationLabelWidth(textEl: SVGTextElement): boolean {
  const host = textEl.closest(
    'g.composition-plain, .composition-plain, g.live-export-single-text.composition-plain, .live-export-single-text.composition-plain',
  )
  if (!host) return false
  if (host.getAttribute('dir') === 'rtl') return true
  return isArabicExportText(textEl.textContent ?? '')
}

/** 阿语翻译区右对齐：贴 25mm 洗唛右缘（dom-to-svg 坐标约 94px） */
export function resolveArabicLiveBoxBounds(
  textEl: SVGTextElement,
  leftX: number,
  rightX: number,
  lineLeftX?: number,
): { leftX: number; rightX: number } {
  const capturedLeft = parseCoord(textEl.getAttribute('data-ex-left'), leftX)
  const capturedRight = parseCoord(textEl.getAttribute('data-ex-right'), rightX)
  const lineLeft = lineLeftX ?? capturedLeft

  if (!usesArabicTranslationLabelWidth(textEl)) {
    const left = lineLeft
    const right = capturedRight > left ? capturedRight : Math.max(rightX, left)
    return { leftX: left, rightX: right }
  }

  // 翻译区整块成分：固定 [0, 25mm - 右padding]，扣除 1mm 右边距避免阿语贴边
  return {
    leftX: lineLeftX ?? 0,
    rightX: LIVE_LABEL_TEXT_WIDTH_PX - LIVE_LABEL_RIGHT_PADDING_PX,
  }
}

/** 可编辑 PDF 阿语：逻辑序呈现形 + 右锚 text-anchor=end（避免 ل 等字被左锚裁切） */
export async function appendArabicLiveTspans(
  textEl: SVGTextElement,
  logical: string,
  leftX: number,
  rightX: number,
  y: number,
  fontSize: number,
  fill: string,
): Promise<number> {
  if (!logical) return 0

  const segments = coalesceDigitPercentRuns(splitTextByFontRole(logical, 'arabic'))
  const measured: Array<
    | { kind: 'single'; content: string; role: FontRole; width: number }
    | { kind: 'digit-percent'; digits: string; percent: string; width: number }
  > = []
  let naturalTotal = 0

  for (const segment of segments) {
    if (segment.kind === 'digit-percent') {
      const digitText = segment.digits
      const percentText = liveArabicGlyphText(segment.percent, 'zh')
      const width =
        (await measureRunAdvance('latin', digitText, fontSize)) +
        (await measureRunAdvance('zh', percentText, fontSize))
      measured.push({
        kind: 'digit-percent',
        digits: digitText,
        percent: percentText,
        width,
      })
      naturalTotal += width
      continue
    }
    const glyphText = liveArabicGlyphText(segment.content, segment.role)
    const width = await measureRunAdvance(segment.role, glyphText, fontSize)
    measured.push({ kind: 'single', content: glyphText, role: segment.role, width })
    naturalTotal += width
  }
  if (naturalTotal <= 0) return 0

  const boxWidth = rightX > leftX ? rightX - leftX : 0
  const maxWidth = boxWidth > 0 ? boxWidth : naturalTotal
  const scale = naturalTotal > maxWidth ? maxWidth / naturalTotal : 1

  // 逻辑序 segments：首个 segment 应排在右缘（RTL 阅读先看到），勿倒序
  let rightEdge = rightX
  for (let i = 0; i < measured.length; i++) {
    const item = measured[i]
    const width = item.width * scale
    const groupLeft = rightEdge - width

    if (item.kind === 'digit-percent') {
      const digitW = (await measureRunAdvance('latin', item.digits, fontSize)) * scale
      appendLiveTspan(textEl, item.digits, groupLeft, y, fontSize, fill, 'latin', 'start')
      appendLiveTspan(
        textEl,
        item.percent,
        groupLeft + digitW,
        y,
        fontSize,
        fill,
        'zh',
        'start',
      )
    } else {
      appendLiveTspan(
        textEl,
        item.content,
        rightEdge,
        y,
        fontSize,
        fill,
        item.role,
        'end',
        width,
      )
    }
    rightEdge -= width
  }

  return naturalTotal * scale
}

/** @deprecated 使用 appendArabicLiveTspans */
export async function appendArabicVisualLiveTspans(
  textEl: SVGTextElement,
  logical: string,
  leftX: number,
  y: number,
  fontSize: number,
  fill: string,
): Promise<number> {
  return appendArabicLiveTspans(textEl, logical, leftX, leftX, y, fontSize, fill)
}

export function readTextStartX(textEl: SVGTextElement): number {
  const tspans = [...textEl.querySelectorAll('tspan')]
  const baseX = parseCoord(textEl.getAttribute('x'))
  if (!tspans.length) return baseX
  const xs = tspans.map((tspan) => parseCoord(tspan.getAttribute('x'), baseX))
  return xs.length ? Math.min(...xs) : baseX
}
