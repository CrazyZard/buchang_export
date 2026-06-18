import type { FontRole } from './svgTextToPathsUtils'
import { splitTextByFontRole, toFzPercentGlyph } from './textScriptDetect'
import { isArabicExportText } from './arabicTextExport'
import { isCareAdviceLiveNode } from './exportTextBlockKind'
import {
  formatSvgFontFamily,
  mapCssFontFamilyToPdfEmbedded,
  svgFontFamilyForRole,
} from './pdfFontFamilies'
import { pickFontRole, parseFontSize, parseLineHeight } from './svgTextToPathsUtils'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 去掉 inline style 中的 font-family（svg2pdf 优先读 style，会盖过 attribute） */
function stripInlineFontFamily(el: Element): void {
  const style = el.getAttribute('style')
  if (!style) return

  const parts = style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)

  const kept: string[] = []
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (!lower.startsWith('font-family')) {
      kept.push(part)
      continue
    }
    const value = part.slice(part.indexOf(':') + 1).trim()
    const mapped = mapCssFontFamilyToPdfEmbedded(value)
    if (mapped) kept.push(`font-family: ${formatSvgFontFamily(mapped)}`)
  }

  if (kept.length) el.setAttribute('style', kept.join('; '))
  else el.removeAttribute('style')
}

function normalizeElementFontFamily(el: Element): void {
  stripInlineFontFamily(el)

  const attr = el.getAttribute('font-family')
  if (!attr) return

  const mapped = mapCssFontFamilyToPdfEmbedded(attr)
  if (mapped) el.setAttribute('font-family', formatSvgFontFamily(mapped))
}

function resolveRoleForExport(text: string, fallbackRole: FontRole): FontRole {
  const trimmed = text.trim()
  if (!trimmed) return fallbackRole
  if (trimmed === '%' || trimmed === '％') return 'zh'
  if (/^[\d.]+$/.test(trimmed)) return 'latin'
  const runs = splitTextByFontRole(text, fallbackRole)
  if (runs.length === 1) return runs[0].role
  return runs[0].role
}

function estimateRunWidth(text: string, role: FontRole, fontSize: number): number {
  const ratio = role === 'latin' ? 0.5 : role === 'arabic' ? 0.55 : 0.95
  return text.length * fontSize * ratio
}

/** 混排 tspan（如 57.7%）拆成单字体段，避免整段落到 GO 导致 % 字形错误 */
function splitMixedRoleTspans(textEl: SVGTextElement, contentFallback: string): void {
  const doc = textEl.ownerDocument
  if (!doc) return

  for (const tspan of [...textEl.querySelectorAll('tspan')]) {
    const text = tspan.textContent ?? ''
    if (!text) continue

    const currentToken = (tspan.getAttribute('font-family') ?? '')
      .replace(/['"]/g, '')
      .split(',')[0]
      .trim()
    const fallback = pickFontRole(currentToken, text || contentFallback)
    const runs = splitTextByFontRole(text, fallback)
    if (runs.length <= 1) continue

    const x = parseFloat(tspan.getAttribute('x') || textEl.getAttribute('x') || '0')
    const y = tspan.getAttribute('y') || textEl.getAttribute('y')
    const fontSize = parseFloat(
      tspan.getAttribute('font-size') || textEl.getAttribute('font-size') || '12',
    )
    const fill = tspan.getAttribute('fill') || textEl.getAttribute('fill') || '#000000'
    const baseline = tspan.getAttribute('dominant-baseline') || 'text-after-edge'
    const insertBefore = tspan.nextSibling

    tspan.remove()

    let cursorX = x
    for (const run of runs) {
      const el = doc.createElementNS(SVG_NS, 'tspan')
      el.textContent = run.content
      el.setAttribute('x', String(cursorX))
      if (y) el.setAttribute('y', y)
      el.setAttribute('font-size', String(fontSize))
      el.setAttribute('fill', fill)
      el.setAttribute('dominant-baseline', baseline)
      el.setAttribute('font-family', svgFontFamilyForRole(run.role))
      textEl.insertBefore(el, insertBefore)
      cursorX += estimateRunWidth(
        run.role === 'zh' ? toFzPercentGlyph(run.content) : run.content,
        run.role,
        fontSize,
      )
    }
  }
}

/** 无 tspan 的混排 text 拆成单字体 tspan */
function splitPlainMixedTextElement(textEl: SVGTextElement): void {
  const content = textEl.textContent ?? ''
  if (!content || textEl.querySelector('tspan')) return

  const fallbackRole: FontRole = isArabicExportText(content)
    ? 'arabic'
    : pickFontRole(textEl.getAttribute('font-family') || '', content)
  const runs = splitTextByFontRole(content, fallbackRole)
  if (runs.length <= 1) return

  const doc = textEl.ownerDocument
  if (!doc) return

  const x = parseFloat(textEl.getAttribute('x') || '0')
  const y = textEl.getAttribute('y')
  const fontSize = parseFloat(textEl.getAttribute('font-size') || '12')
  const fill = textEl.getAttribute('fill') || '#000000'

  textEl.textContent = ''
  textEl.removeAttribute('font-family')

  let cursorX = x
  for (const run of runs) {
    const el = doc.createElementNS(SVG_NS, 'tspan')
    el.textContent = run.content
    el.setAttribute('x', String(cursorX))
    if (y) el.setAttribute('y', y)
    el.setAttribute('font-size', String(fontSize))
    el.setAttribute('fill', fill)
    el.setAttribute('dominant-baseline', 'text-after-edge')
    el.setAttribute('font-family', svgFontFamilyForRole(run.role))
    textEl.appendChild(el)
    cursorX += estimateRunWidth(
      run.role === 'zh' ? toFzPercentGlyph(run.content) : run.content,
      run.role,
      fontSize,
    )
  }
}

function isLonelyPercentTspan(text: string): boolean {
  const trimmed = text.trim()
  return trimmed === '%' || trimmed === '％'
}

/** 单独 % tspan 并入相邻 FZ 段，避免 PDF 生成仅 ASCII 的西文字体子集 */
function mergeLonelyPercentTspans(textEl: SVGTextElement): void {
  for (;;) {
    const tspans = [...textEl.querySelectorAll('tspan')]
    const lonely = tspans.find((t) => isLonelyPercentTspan(t.textContent ?? ''))
    if (!lonely) break

    const y = lonely.getAttribute('y')
    const font = lonely.getAttribute('font-family')
    const idx = tspans.indexOf(lonely)
    const next = tspans[idx + 1]
    const prev = tspans[idx - 1]

    if (next && next.getAttribute('y') === y && next.getAttribute('font-family') === font) {
      next.textContent = (lonely.textContent ?? '') + (next.textContent ?? '')
      lonely.remove()
      continue
    }
    if (prev && prev.getAttribute('y') === y && prev.getAttribute('font-family') === font) {
      prev.textContent = (prev.textContent ?? '') + (lonely.textContent ?? '')
      lonely.remove()
      continue
    }
    break
  }
}

function coalesceAdjacentSameFontTspans(textEl: SVGTextElement): void {
  for (;;) {
    const tspans = [...textEl.querySelectorAll('tspan')]
    let merged = false

    for (let i = 0; i < tspans.length - 1; i += 1) {
      const a = tspans[i]
      const b = tspans[i + 1]
      if (a.getAttribute('y') !== b.getAttribute('y')) continue
      if (a.getAttribute('font-family') !== b.getAttribute('font-family')) continue

      const ax = parseFloat(a.getAttribute('x') || '0')
      const bx = parseFloat(b.getAttribute('x') || '0')
      const left = ax <= bx ? a : b
      const right = ax <= bx ? b : a
      right.textContent = (left.textContent ?? '') + (right.textContent ?? '')
      right.setAttribute('x', String(Math.min(ax, bx)))
      left.remove()
      merged = true
      break
    }

    if (!merged) break
  }
}

/** 洗涤建议：每视觉行合并为一个 tspan（AI 里是一段话，不是逐词定位） */
function collapseCareAdviceTspansPerLine(textEl: SVGTextElement): void {
  if (!isCareAdviceLiveNode(textEl)) return

  const tspans = [...textEl.querySelectorAll('tspan')]
  if (tspans.length <= 1) return

  const fontSize = parseFontSize(
    tspans[0].getAttribute('font-size') || textEl.getAttribute('font-size'),
  )
  const lineTol = Math.max(0.75, parseLineHeight(tspans[0].getAttribute('line-height'), fontSize) * 0.45)

  type LineGroup = { y: number; items: SVGTSpanElement[] }
  const groups: LineGroup[] = []

  for (const tspan of tspans) {
    const y = parseFloat(tspan.getAttribute('y') || textEl.getAttribute('y') || '0')
    const group = groups.find((line) => Math.abs(line.y - y) <= lineTol)
    if (group) group.items.push(tspan)
    else groups.push({ y, items: [tspan] })
  }

  for (const group of groups) {
    if (group.items.length <= 1) continue
    group.items.sort(
      (a, b) =>
        parseFloat(a.getAttribute('x') || '0') - parseFloat(b.getAttribute('x') || '0'),
    )
    const primary = group.items[0]
    const mergedText = group.items.map((t) => t.textContent ?? '').join('')
    const leftX = Math.min(...group.items.map((t) => parseFloat(t.getAttribute('x') || '0')))
    primary.textContent = mergedText
    primary.setAttribute('x', String(leftX))
    for (let i = 1; i < group.items.length; i += 1) {
      group.items[i].remove()
    }
  }
}

function finalizeZhTspanGlyph(tspan: Element, role: FontRole, rawText: string): void {
  if (role !== 'zh') return
  tspan.textContent = toFzPercentGlyph(rawText)
}

export function prepareSvgForEditablePdf(svg: SVGSVGElement): void {
  svg.querySelectorAll('style').forEach((styleEl) => styleEl.remove())

  for (const el of svg.querySelectorAll('*')) {
    normalizeElementFontFamily(el)
  }

  for (const textEl of svg.querySelectorAll('text')) {
    textEl.removeAttribute('direction')
    textEl.removeAttribute('unicode-bidi')

    const content = textEl.textContent ?? ''
    const fallbackRole: FontRole = isArabicExportText(content)
      ? 'arabic'
      : pickFontRole(textEl.getAttribute('font-family') || '', content)

    splitPlainMixedTextElement(textEl)
    if (!isCareAdviceLiveNode(textEl)) {
      splitMixedRoleTspans(textEl, content)
    }
    mergeLonelyPercentTspans(textEl)
    coalesceAdjacentSameFontTspans(textEl)
    collapseCareAdviceTspansPerLine(textEl)

    const tspans = [...textEl.querySelectorAll('tspan')]
    if (tspans.length === 0) {
      const role = resolveRoleForExport(content, fallbackRole)
      textEl.setAttribute('font-family', svgFontFamilyForRole(role))
      if (role === 'zh') {
        textEl.textContent = toFzPercentGlyph(content)
      }
      continue
    }

    textEl.removeAttribute('font-family')

    for (const tspan of tspans) {
      const tspanText = tspan.textContent ?? ''
      const current = tspan.getAttribute('font-family') ?? ''
      const currentToken = current.replace(/['"]/g, '').split(',')[0].trim()
      const role = resolveRoleForExport(
        tspanText,
        pickFontRole(currentToken, tspanText || content),
      )
      tspan.setAttribute('font-family', svgFontFamilyForRole(role))
      finalizeZhTspanGlyph(tspan, role, tspanText)
    }
  }
}
