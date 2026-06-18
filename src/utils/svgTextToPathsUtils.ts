import opentype from 'opentype.js'
import { ARABIC_RENDER_OPTIONS, isArabicExportText, splitRtlWeakTrailingPunct } from './arabicTextExport'
import {
  isChineseCompositionDigitText,
} from './exportTextBlockKind'
import { toArabicVisualString } from './arabicVisualOrder'
import {
  ARABIC_RE,
  CYRILLIC_RE,
  splitTextByFontRole,
  textContainsCjkOrPunct,
} from './textScriptDetect'

const BASE_URL = import.meta.env?.BASE_URL ?? '/'
const FONT_FETCH_TIMEOUT_MS = 30000
const FZ_FONT_URL = `${BASE_URL}fonts/FZ.TTF`
const GO_FONT_URL = `${BASE_URL}fonts/GO.TTF`
const SC_FONT_URL = `${BASE_URL}fonts/NotoSansSC-Regular.otf`
const ARABIC_FONT_URL = `${BASE_URL}fonts/ARIAL.TTF`

/** 预览 FZ（中文/%）与 GO（数字/翻译）；导出转曲用同套本地字体 */
const FONT_URLS: Record<FontRole, string[]> = {
  zh: [
    FZ_FONT_URL,
    SC_FONT_URL,
    'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@Sans2.004/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf',
  ],
  latin: [
    GO_FONT_URL,
    SC_FONT_URL,
    'https://cdn.jsdelivr.net/gh/notofonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf',
  ],
  arabic: [ARABIC_FONT_URL],
}

const fontCache = new Map<FontRole, Promise<opentype.Font | null>>()

/** 导出前清空字体缓存，避免阿语缩放或 dev HMR 污染 GO 字形后影响中文数字 */
export function resetExportFontCache(): void {
  fontCache.clear()
}

export type FontRole = 'zh' | 'latin' | 'arabic'

type ShapingFont = opentype.Font & {
  getPath: (
    text: string,
    x: number,
    y: number,
    fontSize: number,
    options?: object,
  ) => opentype.Path
  getAdvanceWidth: (text: string, fontSize: number, options?: object) => number
}

async function fetchFontBuffer(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), FONT_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const buffer = await response.arrayBuffer()
    if (!isLikelyFontBuffer(buffer)) {
      throw new Error('响应不是有效字体文件')
    }
    return buffer
  } finally {
    window.clearTimeout(timer)
  }
}

function isLikelyFontBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 1024) return false
  const head = new Uint8Array(buffer, 0, 4)
  const sig = String.fromCharCode(...head)
  return (
    sig === 'OTTO' ||
    sig === 'true' ||
    sig === 'typ1' ||
    (head[0] === 0 && head[1] === 1 && head[2] === 0 && head[3] === 0)
  )
}

async function loadFont(role: FontRole): Promise<opentype.Font | null> {
  const cached = fontCache.get(role)
  if (cached) return cached

  const promise = loadFontUncached(role)
  fontCache.set(role, promise)

  const font = await promise
  if (!font) {
    fontCache.delete(role)
  }
  return font
}

async function loadFontUncached(role: FontRole): Promise<opentype.Font | null> {
  let lastError: unknown
  for (const url of FONT_URLS[role]) {
    try {
      const buffer = await fetchFontBuffer(url)
      return opentype.parse(buffer)
    } catch (error) {
      lastError = error
    }
  }
  console.warn(`导出字体加载失败（${role}）`, lastError)
  return null
}

/** 导出前预加载字体，避免转曲中途失败留下 Helvetica 乱码 */
export async function preloadExportFonts(): Promise<{ zh: boolean; arabic: boolean }> {
  const [zh, arabic] = await Promise.all([loadFont('zh'), loadFont('arabic')])
  await loadFont('latin')
  return { zh: Boolean(zh), arabic: Boolean(arabic) }
}

export function pickFontRole(fontFamily: string, text: string): FontRole {
  const trimmed = text.trim()
  const family = fontFamily.toLowerCase()
  const arabicFamily = family.includes('arial') || family.includes('arabic')

  if (ARABIC_RE.test(text)) return 'arabic'
  if (textContainsCjkOrPunct(text)) return 'zh'
  if (/^[%％]+$/.test(trimmed)) {
    if (arabicFamily) return 'arabic'
    return 'zh'
  }
  if (/^[\d.]+$/.test(trimmed)) return arabicFamily ? 'arabic' : 'latin'
  if (CYRILLIC_RE.test(text)) return 'latin'

  if (
    family.includes('fz') ||
    family.includes('simsun') ||
    family.includes('宋体') ||
    family.includes('songti')
  ) {
    return 'zh'
  }
  if (family.includes('go') || family.includes('century') || family.includes('gothic')) {
    return 'latin'
  }
  if (arabicFamily) return 'arabic'
  if (family.includes('latin')) return 'latin'
  if (/[a-zA-Z]/.test(text)) return 'latin'
  return 'zh'
}

export function parseFontSize(raw: string | null, fallback = 12): number {
  if (!raw) return fallback
  const parsed = parseFloat(raw.replace(/px|pt/gi, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function parseColor(raw: string | null | undefined, fallback = '#000000'): string {
  if (!raw || raw === 'none') return fallback
  return raw
}

export function parseCoord(raw: string | null, fallback = 0): number {
  if (!raw) return fallback
  const parsed = parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function resolveSvgUserWidth(svg: SVGSVGElement | null): number {
  if (!svg) return 0
  const widthAttr = svg.getAttribute('width')
  if (widthAttr) {
    const parsed = parseFloat(widthAttr)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  const viewBox = svg.viewBox?.baseVal
  if (viewBox && viewBox.width > 0) return viewBox.width
  return 0
}

function pickRoleForFragment(text: string, fallback: FontRole): FontRole {
  const trimmed = text.trim()
  if (!trimmed) return fallback
  const inArabicContext = fallback === 'arabic' || ARABIC_RE.test(trimmed)
  if (ARABIC_RE.test(trimmed)) return 'arabic'
  if (textContainsCjkOrPunct(trimmed)) return 'zh'
  if (/^[%％]+$/.test(trimmed)) return inArabicContext ? 'arabic' : 'zh'
  if (/^[\d.]+$/.test(trimmed)) return inArabicContext ? 'arabic' : 'latin'
  if (CYRILLIC_RE.test(trimmed)) return 'latin'
  if (/[a-zA-Z]/.test(trimmed)) return 'latin'
  return fallback
}

function renderOptionsForRole(role: FontRole): object | undefined {
  return role === 'arabic' ? ARABIC_RENDER_OPTIONS : undefined
}

export function measureAdvance(
  font: opentype.Font,
  text: string,
  fontSize: number,
  renderOptions?: object,
): number {
  const shapingFont = font as ShapingFont
  if (renderOptions) {
    return shapingFont.getAdvanceWidth(text, fontSize, renderOptions)
  }
  return shapingFont.getAdvanceWidth(text, fontSize)
}

export async function resolveFontForRole(role: FontRole): Promise<opentype.Font | null> {
  const font = await loadFont(role)
  if (font) return font
  if (role === 'arabic') return null
  if (role !== 'zh') return loadFont('zh')
  return null
}

/** dom-to-svg 用 text-after-edge，y 为行底；opentype 需要 baseline */
const LINE_Y_SNAP_TOLERANCE = 2
export const INTRA_TEXT_LINE_Y_TOLERANCE = 0.75

export function usesAfterEdgeBaseline(textEl: SVGTextElement): boolean {
  const baseline = (textEl.getAttribute('dominant-baseline') || '').toLowerCase()
  if (!baseline || baseline === 'auto') return true
  return baseline === 'text-after-edge'
}

export function parseLineHeight(raw: string | null, fontSize: number): number {
  if (!raw) return fontSize * 1.12
  if (raw.endsWith('%')) {
    const pct = parseFloat(raw)
    return Number.isFinite(pct) ? fontSize * (pct / 100) : fontSize * 1.12
  }
  const parsed = parseFloat(raw.replace(/px|pt/gi, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fontSize * 1.12
}

function estimatedLineTop(textEl: SVGTextElement, bottomY: number): number {
  const fontSize = parseFontSize(textEl.getAttribute('font-size'))
  const lineHeight = parseLineHeight(textEl.getAttribute('line-height'), fontSize)
  return bottomY - lineHeight
}

function estimatedLineBottom(textEl: SVGTextElement, topY: number): number {
  const fontSize = parseFontSize(textEl.getAttribute('font-size'))
  const lineHeight = parseLineHeight(textEl.getAttribute('line-height'), fontSize)
  return topY + lineHeight
}

function afterEdgeYToBaseline(font: opentype.Font, afterEdgeY: number, fontSize: number): number {
  const scale = fontSize / font.unitsPerEm
  const descent = -font.descender * scale
  return afterEdgeY - descent
}

export function resolvePathY(
  font: opentype.Font,
  rawY: number,
  fontSize: number,
  usesAfterEdge: boolean,
): number {
  return usesAfterEdge ? afterEdgeYToBaseline(font, rawY, fontSize) : rawY
}

export function isRtlTextElement(textEl: SVGTextElement, defaultRole: FontRole): boolean {
  const dir = (textEl.getAttribute('direction') || '').toLowerCase()
  if (dir === 'rtl') return true
  if (dir === 'ltr') return false
  return defaultRole === 'arabic' || isArabicExportText(textEl.textContent ?? '')
}

function snapLineGroupKey(textEl: SVGTextElement): string {
  const anchor =
    textEl.closest('g.composition-line') ??
    textEl.closest('g.label-translated-title') ??
    textEl.closest('g.composition-footnote') ??
    textEl.closest('g.composition-section-title') ??
    textEl.closest('g.label-translated-wash-head') ??
    textEl.closest('g.label-translated-wash-line') ??
    textEl.closest('g.lang-block') ??
    textEl.parentElement
  if (!anchor) return textEl.id || 'text-island'
  return anchor.id || anchor.getAttribute('class') || anchor.tagName
}

/** 同行标签/数字/阿语由不同 <text> 导出时 y 会有亚像素偏差，先按行顶对齐 */
export function snapTextLinePositions(svg: SVGSVGElement): void {
  type Entry = {
    tspan: SVGTSpanElement | null
    textEl: SVGTextElement
    y: number
    top: number
    lineGroup: string
  }
  const entries: Entry[] = []

  for (const textEl of svg.querySelectorAll('text')) {
    const lineGroup = snapLineGroupKey(textEl)
    const tspans = [...textEl.querySelectorAll('tspan')]
    if (tspans.length === 0) {
      const y = parseCoord(textEl.getAttribute('y'))
      entries.push({ tspan: null, textEl, y, top: estimatedLineTop(textEl, y), lineGroup })
      continue
    }
    for (const tspan of tspans) {
      const y = parseCoord(
        tspan.getAttribute('y'),
        parseCoord(textEl.getAttribute('y')),
      )
      entries.push({ tspan, textEl, y, top: estimatedLineTop(textEl, y), lineGroup })
    }
  }

  if (entries.length === 0) return

  entries.sort((a, b) => a.top - b.top)
  const clusters: { alignedTop: number; items: Entry[] }[] = []

  for (const entry of entries) {
    const cluster = clusters.find(
      (item) =>
        item.items[0]?.lineGroup === entry.lineGroup &&
        Math.abs(item.alignedTop - entry.top) <= LINE_Y_SNAP_TOLERANCE,
    )
    if (cluster) {
      cluster.items.push(entry)
      const tops = cluster.items.map((item) => item.top).sort((a, b) => a - b)
      cluster.alignedTop = tops[0]
    } else {
      clusters.push({ alignedTop: entry.top, items: [entry] })
    }
  }

  for (const { alignedTop, items } of clusters) {
    for (const { tspan, textEl } of items) {
      const bottomY = estimatedLineBottom(textEl, alignedTop)
      if (tspan) {
        tspan.setAttribute('y', String(bottomY))
      } else {
        textEl.setAttribute('y', String(bottomY))
      }
    }
  }
}

export function readTextAnchorX(textEl: SVGTextElement): number {
  const tspan = textEl.querySelector('tspan')
  if (tspan?.hasAttribute('x')) return parseCoord(tspan.getAttribute('x'))
  return parseCoord(textEl.getAttribute('x'))
}

export function readTextAnchorY(textEl: SVGTextElement): number {
  const tspan = textEl.querySelector('tspan')
  if (tspan?.hasAttribute('y')) return parseCoord(tspan.getAttribute('y'))
  return parseCoord(textEl.getAttribute('y'))
}

export interface TspanLine {
  y: number
  startX: number
  tspans: SVGTSpanElement[]
}

export function mergeTspansIntoOne(textEl: SVGTextElement, tspans: SVGTSpanElement[]): void {
  const baseY = parseCoord(textEl.getAttribute('y'))
  const baseX = parseCoord(textEl.getAttribute('x'))
  const merged = tspans.map((tspan) => tspan.textContent ?? '').join('')
  const xs = tspans.map((tspan) => parseCoord(tspan.getAttribute('x'), baseX))
  const ys = tspans.map((tspan) => parseCoord(tspan.getAttribute('y'), baseY))
  const minX = Math.min(...xs)
  const anchorY = ys.reduce((sum, y) => sum + y, 0) / ys.length

  const primary = tspans[0]
  primary.textContent = merged
  primary.setAttribute('x', String(minX))
  primary.setAttribute('y', String(anchorY))
  for (let i = 1; i < tspans.length; i++) {
    tspans[i].remove()
  }
}

/** 是否 dom-to-svg 误拆数字（如 36.6 → 3 + 6.6） */
export function isLikelyDigitTspanSplit(tspans: SVGTSpanElement[]): boolean {
  const parts = tspans.map((tspan) => tspan.textContent ?? '').filter((part) => part.length > 0)
  if (parts.length < 2) return false
  const merged = parts.join('')
  if (!/^[\d.]/.test(merged.trim())) return false
  if (/^\d$/.test(parts[0].trim())) return true
  const compact = merged.replace(/\s+/g, '')
  return /^[\d.]+%?/.test(compact) || /^[\d.]+\s*[%％]/.test(merged.trim())
}

export function collapseTextElementToPlain(textEl: SVGTextElement): void {
  const tspans = [...textEl.querySelectorAll('tspan')]
  const full = tspans.length
    ? tspans.map((tspan) => tspan.textContent ?? '').join('')
    : (textEl.textContent ?? '').trim()
  if (!full) return

  const baseX = parseCoord(textEl.getAttribute('x'))
  const baseY = parseCoord(textEl.getAttribute('y'))
  const xs = tspans.length
    ? tspans.map((tspan) => parseCoord(tspan.getAttribute('x'), baseX))
    : [baseX]
  const ys = tspans.length
    ? tspans.map((tspan) => parseCoord(tspan.getAttribute('y'), baseY))
    : [baseY]
  const minX = Math.min(...xs)
  const anchorY = ys.reduce((sum, y) => sum + y, 0) / ys.length

  while (textEl.firstChild) {
    textEl.removeChild(textEl.firstChild)
  }
  textEl.textContent = full
  textEl.setAttribute('x', String(minX))
  textEl.setAttribute('y', String(anchorY))
}

/** 是否 dom-to-svg 误拆行（如 36.6 → 3 + 6.6），而非真实换行 */
function shouldConsolidateTspans(textEl: SVGTextElement, tspans: SVGTSpanElement[]): boolean {
  const merged = tspans.map((tspan) => tspan.textContent ?? '').join('')
  if (!merged) return false

  const dir = (textEl.getAttribute('direction') || '').toLowerCase()
  if (dir === 'rtl' || ARABIC_RE.test(merged)) {
    return false
  }

  if (isChineseCompositionDigitText(merged) || isLikelyDigitTspanSplit(tspans)) {
    return true
  }

  const fontSize = parseFontSize(textEl.getAttribute('font-size'))
  const lineHeight = parseLineHeight(textEl.getAttribute('line-height'), fontSize)
  const baseY = parseCoord(textEl.getAttribute('y'))
  const ys = tspans.map((tspan) => parseCoord(tspan.getAttribute('y'), baseY))
  const ySpread = Math.max(...ys) - Math.min(...ys)

  if (ySpread > lineHeight * 0.85) return false

  return ySpread <= INTRA_TEXT_LINE_Y_TOLERANCE
}

export function groupTspansByLine(textEl: SVGTextElement): TspanLine[] {
  if (!textEl?.querySelectorAll) return []

  const tspans = [...textEl.querySelectorAll('tspan')]
  const baseY = parseCoord(textEl.getAttribute('y'))
  const baseX = parseCoord(textEl.getAttribute('x'))

  if (tspans.length >= 2 && shouldConsolidateTspans(textEl, tspans)) {
    const ys = tspans.map((tspan) => parseCoord(tspan.getAttribute('y'), baseY))
    const xs = tspans.map((tspan) => parseCoord(tspan.getAttribute('x'), baseX))
    return [{ y: ys[0], startX: Math.min(...xs), tspans }]
  }

  const lines: TspanLine[] = []

  for (const tspan of tspans) {
    const y = parseCoord(tspan.getAttribute('y'), baseY)
    const x = parseCoord(tspan.getAttribute('x'), baseX)
    const existing = lines.find((line) => Math.abs(line.y - y) <= INTRA_TEXT_LINE_Y_TOLERANCE)
    if (existing) {
      existing.tspans.push(tspan)
      if (tspan.hasAttribute('x')) {
        existing.startX = Math.min(existing.startX, x)
      }
    } else {
      lines.push({ y, startX: x, tspans: [tspan] })
    }
  }

  return lines.sort((a, b) => a.y - b.y)
}

export function createReplacementGroup(
  ownerDocument: Document,
  textEl: SVGTextElement,
): SVGGElement {
  const group = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g')
  const transform = textEl.getAttribute('transform')
  if (transform) group.setAttribute('transform', transform)
  return group
}

export function appendTextPath(
  ownerDocument: Document,
  group: SVGGElement,
  font: opentype.Font,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  renderOptions?: object,
): number {
  if (!text) return 0

  const shapingFont = font as ShapingFont
  const path = renderOptions
    ? shapingFont.getPath(text, x, y, fontSize, renderOptions)
    : font.getPath(text, x, y, fontSize)
  const pathEl = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path')
  pathEl.setAttribute('d', path.toPathData(2))
  pathEl.setAttribute('fill', fill)
  group.appendChild(pathEl)
  return measureAdvance(font, text, fontSize, renderOptions)
}

/** 阿语 RTL：弱标点（如 :）画在词左侧，与浏览器 bidi 一致 */
function appendRtlArabicTextPath(
  ownerDocument: Document,
  group: SVGGElement,
  font: opentype.Font,
  text: string,
  leftX: number,
  y: number,
  fontSize: number,
  fill: string,
  renderOptions: object,
): number {
  const { core, trail } = splitRtlWeakTrailingPunct(text)
  let x = leftX
  let width = 0

  if (trail) {
    appendTextPath(ownerDocument, group, font, trail, x, y, fontSize, fill, renderOptions)
    const trailWidth = measureAdvance(font, trail, fontSize, renderOptions)
    x += trailWidth
    width += trailWidth
  }

  if (core) {
    appendTextPath(ownerDocument, group, font, core, x, y, fontSize, fill, renderOptions)
    width += measureAdvance(font, core, fontSize, renderOptions)
  }

  return width
}

function appendShapedTextPath(
  ownerDocument: Document,
  group: SVGGElement,
  font: opentype.Font,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  renderOptions: object | undefined,
  rtlArabic: boolean,
): number {
  if (!text) return 0
  if (rtlArabic && renderOptions) {
    return appendRtlArabicTextPath(
      ownerDocument,
      group,
      font,
      text,
      x,
      y,
      fontSize,
      fill,
      renderOptions,
    )
  }
  return appendTextPath(ownerDocument, group, font, text, x, y, fontSize, fill, renderOptions)
}

/**
 * 中文成分行：数字段用 GO，% 与中文材质用 FZ。
 * 拆分规则与预览 renderCompositionToken 一致（首段 [\d.]+ / % / 其余中文），
 * 从 startX 按 advance 顺序绘制（已在 prepare 阶段合并为单 text 单起点，不会叠字）。
 */
export async function appendZhUnifiedTextPath(
  ownerDocument: Document,
  group: SVGGElement,
  text: string,
  startX: number,
  y: number,
  fontSize: number,
  fill: string,
): Promise<number> {
  const zhFont = await resolveFontForRole('zh')
  if (!zhFont) return 0

  const match = text.match(/^([\d.]+)(%?)([\s\S]*)$/)
  // 纯中文或不以数字开头：整段 FZ
  if (!match?.[1]) {
    return appendTextPath(ownerDocument, group, zhFont, text, startX, y, fontSize, fill)
  }

  const digits = match[1]
  const percentAndRest = `${match[2] ?? ''}${match[3] ?? ''}`
  const goFont = (await resolveFontForRole('latin')) ?? zhFont
  let cursorX = startX

  // 数字段（含小数点）整体 GO，避免按字符拆分时小数点被误判成中文标点
  cursorX += appendTextPath(ownerDocument, group, goFont, digits, cursorX, y, fontSize, fill)

  // 其余按字体角色分段：% / 中文 → FZ；西里尔 / 拉丁 → GO（修俄文 нитрон 用错字体）
  if (percentAndRest) {
    cursorX += await appendSplitTextPaths(
      ownerDocument,
      group,
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

export async function appendBestLtrLinePath(
  ownerDocument: Document,
  group: SVGGElement,
  text: string,
  startX: number,
  rawY: number,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
  usesAfterEdge: boolean,
): Promise<number> {
  if (!text) return 0

  if (isChineseCompositionDigitText(text)) {
    const font = await resolveFontForRole('zh')
    if (!font) return 0
    const y = resolvePathY(font, rawY, fontSize, usesAfterEdge)
    return appendZhUnifiedTextPath(ownerDocument, group, text, startX, y, fontSize, fill)
  }

  // 外文成分行：数字 GO + % FZ + 材质 GO，从起点顺序转曲（勿整段 GO）
  if (!ARABIC_RE.test(text) && !textContainsCjkOrPunct(text)) {
    const font = await resolveFontForRole('latin')
    if (!font) return 0
    const y = resolvePathY(font, rawY, fontSize, usesAfterEdge)
    if (/^[\d.]+%/.test(text.trim())) {
      return appendSplitTextPaths(
        ownerDocument,
        group,
        text,
        startX,
        y,
        fontSize,
        fill,
        'latin',
        false,
      )
    }
    return appendTextPath(ownerDocument, group, font, text, startX, y, fontSize, fill)
  }

  const renderRole = pickRoleForFragment(text, defaultRole)
  const font = await resolveFontForRole(renderRole)
  if (!font) return 0
  const y = resolvePathY(font, rawY, fontSize, usesAfterEdge)
  return appendSplitTextPaths(
    ownerDocument,
    group,
    text,
    startX,
    y,
    fontSize,
    fill,
    renderRole,
    false,
  )
}

function lineTextFromTspans(tspans: SVGTSpanElement[]): string {
  return tspans.map((tspan) => tspan.textContent ?? '').join('')
}

/** 是否真实多行（换行符或 y 间距明显），而非 dom-to-svg 误拆 */
export function isRealMultilineText(
  fullContent: string,
  lines: TspanLine[],
  textEl: SVGTextElement,
): boolean {
  if (fullContent.includes('\n')) return true
  if (lines.length <= 1) return false

  const fontSize = parseFontSize(textEl.getAttribute('font-size'))
  const lineHeight = parseLineHeight(textEl.getAttribute('line-height'), fontSize)
  const ys = lines.map((line) => line.y)
  const ySpread = Math.max(...ys) - Math.min(...ys)

  if (ySpread <= lineHeight * 0.85) return false
  if (isLikelyDigitTspanSplit(lines.flatMap((line) => line.tspans))) return false
  if (isChineseCompositionDigitText(fullContent)) return false
  return true
}

export async function renderLtrLinesUnified(
  ownerDocument: Document,
  group: SVGGElement,
  lines: TspanLine[],
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
  usesAfterEdge: boolean,
): Promise<boolean> {
  let rendered = false

  for (const line of lines) {
    const lineText = lineTextFromTspans(line.tspans)
    if (!lineText) continue

    const width = await appendBestLtrLinePath(
      ownerDocument,
      group,
      lineText,
      line.startX,
      line.y,
      fontSize,
      fill,
      defaultRole,
      usesAfterEdge,
    )
    if (width > 0) rendered = true
  }

  return rendered
}

/** 阿语 RTL：沿用 dom-to-svg 为每个 tspan 计算的 x，避免重排后数字错位或字距拉大 */
export async function renderRtlTspansAtCapturedPositions(
  ownerDocument: Document,
  group: SVGGElement,
  textEl: SVGTextElement,
  lines: TspanLine[],
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
  usesAfterEdge: boolean,
): Promise<boolean> {
  const baseX = parseCoord(textEl.getAttribute('x'))
  let rendered = false

  for (const line of lines) {
    let fallbackX = baseX
    for (const tspan of line.tspans) {
      const content = tspan.textContent ?? ''
      if (!content) continue

      const x = tspan.hasAttribute('x') ? parseCoord(tspan.getAttribute('x')) : fallbackX
      const rawY = parseCoord(tspan.getAttribute('y'), line.y)
      const role = pickRoleForFragment(content, defaultRole)
      const font = await resolveFontForRole(role)
      if (!font) continue

      const y = resolvePathY(font, rawY, fontSize, usesAfterEdge)
      const runs = splitTextByFontRole(content, defaultRole)
      let width = 0

      if (runs.length <= 1) {
        width = await appendSplitTextPaths(
          ownerDocument,
          group,
          content,
          x,
          y,
          fontSize,
          fill,
          defaultRole,
          true,
        )
      } else {
        const totalWidth = await measureRunsWidth(content, defaultRole, fontSize)
        let cursorX = x
        for (const run of [...runs].reverse()) {
          const runFont = await resolveFontForRole(run.role)
          if (!runFont) continue
          const options = renderOptionsForRole(run.role)
          appendShapedTextPath(
            ownerDocument,
            group,
            runFont,
            run.content,
            cursorX,
            y,
            fontSize,
            fill,
            options,
            run.role === 'arabic',
          )
          cursorX += measureAdvance(runFont, run.content, fontSize, options)
        }
        width = totalWidth
      }

      if (width > 0) {
        fallbackX = x + width
        rendered = true
      }
    }
  }

  return rendered
}

export async function appendSplitTextPaths(
  ownerDocument: Document,
  group: SVGGElement,
  text: string,
  startX: number,
  y: number,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
  rtl: boolean,
): Promise<number> {
  const runs = splitTextByFontRole(text, defaultRole)
  let cursorX = startX
  let renderedWidth = 0

  for (const run of runs) {
    const font = await resolveFontForRole(run.role)
    if (!font) continue

    const options = renderOptionsForRole(run.role)
    appendShapedTextPath(
      ownerDocument,
      group,
      font,
      run.content,
      cursorX,
      y,
      fontSize,
      fill,
      options,
      rtl && run.role === 'arabic',
    )
    const advance = measureAdvance(font, run.content, fontSize, options)
    cursorX += advance
    renderedWidth += advance
  }

  return renderedWidth
}

async function measureRunsWidth(
  text: string,
  defaultRole: FontRole,
  fontSize: number,
): Promise<number> {
  const runs = splitTextByFontRole(text, defaultRole)
  let total = 0
  for (const run of runs) {
    const font = await resolveFontForRole(run.role)
    if (!font) continue
    total += measureAdvance(font, run.content, fontSize, renderOptionsForRole(run.role))
  }
  return total
}

/** RTL 单行：逻辑序为「数字%阿语」时，视觉从左到右为阿语→%→数字，需从右锚点反向排版 */
function readRtlRightEdge(textEl: SVGTextElement, contentWidth: number): number {
  // dom-to-svg 把 x 放在 tspan 上、text 无 x；删 textLength 前已把右缘存进 data-ex-right
  const captured = textEl.getAttribute('data-ex-right')
  if (captured) {
    const right = parseFloat(captured)
    if (Number.isFinite(right)) return right
  }

  const x = parseCoord(textEl.getAttribute('x'))
  const anchor = (textEl.getAttribute('text-anchor') || 'start').toLowerCase()
  if (anchor === 'end') return x
  if (anchor === 'middle') return x + contentWidth / 2

  const dir = (textEl.getAttribute('direction') || '').toLowerCase()
  if (dir === 'rtl') return x

  if (!isRtlTextElement(textEl, 'arabic')) return x

  // dom-to-svg 对 RTL 行有时记左缘、有时记右缘；按画布可容纳性选择
  const rightIfXIsRightEdge = x
  const rightIfXIsLeftEdge = x + contentWidth
  const viewWidth = resolveSvgUserWidth(textEl.ownerSVGElement)
  const leftStartFrom = (rightEdge: number) => rightEdge - contentWidth
  const fitsView = (leftStart: number) => {
    if (viewWidth <= 0) return true
    return leftStart >= -4 && leftStart + contentWidth <= viewWidth + 4
  }

  const leftFromRightAnchor = leftStartFrom(rightIfXIsRightEdge)
  const leftFromLeftAnchor = leftStartFrom(rightIfXIsLeftEdge)
  const rightFits = fitsView(leftFromRightAnchor)
  const leftFits = fitsView(leftFromLeftAnchor)

  if (rightFits && !leftFits) return rightIfXIsRightEdge
  if (leftFits && !rightFits) return rightIfXIsLeftEdge
  if (leftFits && rightFits) {
    return viewWidth > 0 && x > viewWidth * 0.35 ? rightIfXIsRightEdge : rightIfXIsLeftEdge
  }

  const overflow = (leftStart: number) => {
    if (viewWidth <= 0) return Math.abs(leftStart)
    return Math.max(0, -leftStart) + Math.max(0, leftStart + contentWidth - viewWidth)
  }
  return overflow(leftFromRightAnchor) <= overflow(leftFromLeftAnchor)
    ? rightIfXIsRightEdge
    : rightIfXIsLeftEdge
}

interface TextFragmentRun {
  content: string
  role: FontRole
  font: opentype.Font
  options?: object
  width: number
}

/** 阿语视觉串按字符分字体：数字→GO，% →FZ，阿拉伯字母/标点/空格→ARIAL */
function arabicVisualCharRole(ch: string): FontRole {
  if (ch === '%' || ch === '％' || ch === '\u066a' || ch === '\u202a') return 'zh' // % 用 FZ
  if (/[0-9.\u0660-\u0669]/.test(ch)) return 'latin' // 数字用 GO
  return 'arabic' // 阿拉伯字母/呈现形/标点/空格 → ARIAL
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

/**
 * 阿拉伯整段：整形 + bidi 重排为视觉序，再按字符分字体（数字 GO / % FZ / 阿拉伯 ARIAL）
 * 逐段矢量转曲，并按 dom-to-svg 量得的 [leftX, rightX] 横向缩放，精确贴合预览宽度。
 */
export async function appendArabicVisualPath(
  ownerDocument: Document,
  group: SVGGElement,
  logical: string,
  leftX: number,
  rightX: number,
  y: number,
  fontSize: number,
  fill: string,
): Promise<number> {
  const visual = toArabicVisualString(logical)
  if (!visual) return 0

  const runs = splitArabicVisualRuns(visual)
  const measured: Array<{ text: string; font: opentype.Font; width: number }> = []
  let naturalTotal = 0
  for (const run of runs) {
    const font = (await resolveFontForRole(run.role)) ?? (await resolveFontForRole('arabic'))
    if (!font) continue
    const width = measureAdvance(font, run.text, fontSize)
    measured.push({ text: run.text, font, width })
    naturalTotal += width
  }
  if (naturalTotal <= 0) return 0

  const targetWidth = rightX > leftX ? rightX - leftX : naturalTotal
  const scaleX = targetWidth / naturalTotal

  let cursorX = leftX
  for (const run of measured) {
    const path = run.font.getPath(run.text, 0, y, fontSize)
    // 用 SVG transform 缩放/平移，绝不改写 path.commands（共享 opentype glyph 缓存）
    const runGroup = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g')
    runGroup.setAttribute('transform', `translate(${cursorX},0) scale(${scaleX},1)`)
    const pathEl = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path')
    pathEl.setAttribute('d', path.toPathData(2))
    pathEl.setAttribute('fill', fill)
    runGroup.appendChild(pathEl)
    group.appendChild(runGroup)
    cursorX += run.width * scaleX
  }

  return targetWidth
}

export async function appendRtlMixedTextPaths(
  ownerDocument: Document,
  group: SVGGElement,
  textEl: SVGTextElement,
  text: string,
  y: number,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
): Promise<number> {
  const runs = splitTextByFontRole(text, defaultRole)
  if (runs.length === 0) return 0

  const measured: TextFragmentRun[] = []
  for (const run of runs) {
    const font = await resolveFontForRole(run.role)
    if (!font) continue
    const options = renderOptionsForRole(run.role)
    measured.push({
      content: run.content,
      role: run.role,
      font,
      options,
      width: measureAdvance(font, run.content, fontSize, options),
    })
  }
  if (measured.length === 0) return 0

  const totalWidth = measured.reduce((sum, run) => sum + run.width, 0)
  const rightEdge = readRtlRightEdge(textEl, totalWidth)
  let cursorX = rightEdge - totalWidth

  // 兜底：无论右锚算成什么，阿语整行必须落在画布内，避免画到界外 → PDF 空白
  const viewWidth = resolveSvgUserWidth(textEl.ownerSVGElement)
  if (viewWidth > 0) {
    cursorX = Math.max(0, Math.min(cursorX, viewWidth - totalWidth))
  } else if (cursorX < 0) {
    cursorX = 0
  }

  for (const run of [...measured].reverse()) {
    appendShapedTextPath(
      ownerDocument,
      group,
      run.font,
      run.content,
      cursorX,
      y,
      fontSize,
      fill,
      run.options,
      run.role === 'arabic',
    )
    cursorX += run.width
  }

  return totalWidth
}

const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** 移除 SVG 内嵌位图，避免 pdf.addImage 栅格化 */
export function removeRasterImages(svg: SVGSVGElement): void {
  svg.querySelectorAll('image').forEach((image) => {
    const href =
      image.getAttribute('href') ||
      image.getAttributeNS(XLINK_NS, 'href') ||
      ''
    if (/^data:image\/(png|jpe?g|webp|gif)/i.test(href)) {
      image.remove()
    }
  })
}
