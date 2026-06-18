import { ARABIC_RENDER_OPTIONS, splitRtlWeakTrailingPunct } from './arabicTextExport'
import { toArabicVisualBaseString } from './arabicVisualOrder'
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
  if (!font) return 0
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

function arabicVisualCharRole(ch: string): FontRole {
  if (ch === '%' || ch === '％' || ch === '\u066a' || ch === '\u202a') return 'zh'
  if (/[0-9.\u0660-\u0669]/.test(ch)) return 'latin'
  if (ch === ':' || ch === '：') return 'zh'
  return 'arabic'
}

/** 混排阿语行（含数字/%） */
export function isMixedArabicExportLine(text: string): boolean {
  return /[0-9.]/.test(text) || text.includes('%')
}

function splitArabicVisualRuns(visual: string): Array<{ text: string; role: FontRole }> {
  const runs: Array<{ text: string; role: FontRole }> = []
  let current = ''
  let currentRole: FontRole | null = null
  for (const ch of visual) {
    const role = arabicVisualCharRole(ch)
    if (currentRole === role) {
      current += ch
    } else {
      if (current && currentRole) runs.push({ text: current, role: currentRole })
      current = ch
      currentRole = role
    }
  }
  if (current && currentRole) runs.push({ text: current, role: currentRole })
  return runs
}

/** 可编辑 PDF 阿语：bidi 视觉序 + LTR 逐段绘制（svg2pdf/AI 不认 direction=rtl，逻辑序会反字） */
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

  const visual = toArabicVisualBaseString(logical)
  if (!visual) return 0

  const runs = splitArabicVisualRuns(visual)
  const measured: Array<{ text: string; role: FontRole; width: number }> = []
  let naturalTotal = 0
  for (const run of runs) {
    const width = await measureRunAdvance(run.role, run.text, fontSize)
    measured.push({ ...run, width })
    naturalTotal += width
  }
  if (naturalTotal <= 0) return 0

  const boxWidth = rightX > leftX ? rightX - leftX : 0
  const maxWidth = boxWidth > 0 ? boxWidth : naturalTotal
  const scale = naturalTotal > maxWidth ? maxWidth / naturalTotal : 1
  const drawWidth = naturalTotal * scale
  let cursorX = rightX - drawWidth

  for (const run of measured) {
    appendLiveTspan(textEl, run.text, cursorX, y, fontSize, fill, run.role)
    cursorX += run.width * scale
  }
  return drawWidth
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
