import { isArabicExportText } from './arabicTextExport'
import { LIVE_EXPORT_SINGLE_TEXT_CLASS } from './flattenCompositionBlocksForLive'
import { ARABIC_RE, CJK_RE } from './textScriptDetect'

export function isLiveExportSingleTextNode(node: Element): boolean {
  return Boolean(node.closest(`g.${LIVE_EXPORT_SINGLE_TEXT_CLASS}, .${LIVE_EXPORT_SINGLE_TEXT_CLASS}`))
}

export function isCareAdviceLiveNode(node: Element): boolean {
  return Boolean(node.closest('g.care-advice-live, .care-advice-live'))
}

function nodeHasClass(node: Element, className: string): boolean {
  const cls = node.getAttribute('class') ?? ''
  return cls.split(/\s+/).includes(className)
}

function closestExportContainer(textEl: Element, selector: string): Element | null {
  if (typeof textEl.closest === 'function') {
    const hit = textEl.closest(selector)
    if (hit) return hit
  }

  const wanted = selector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  let node: Element | null = textEl
  while (node) {
    const tagName = (node.tagName ?? '').toLowerCase()
    for (const part of wanted) {
      if (part.startsWith('.')) {
        if (nodeHasClass(node, part.slice(1))) return node
        continue
      }
      const dot = part.indexOf('.')
      const tag = dot >= 0 ? part.slice(0, dot) : part
      const className = dot >= 0 ? part.slice(dot + 1) : ''
      if (className && tagName === tag && nodeHasClass(node, className)) {
        return node
      }
      if (!className && tagName === tag) return node
    }
    node = node.parentElement
  }
  return null
}

export function isProductCodesSvgBlock(textEl: SVGTextElement): boolean {
  return Boolean(closestExportContainer(textEl, 'g.product-codes, .product-codes'))
}

/**
 * 导出转曲块类型 — 每种类型有独立的 prepare / render / flatten 逻辑，
 * 互不影响，避免修阿语时破坏俄文、修中文时破坏翻译区。
 */
export type ExportTextBlockKind =
  /** 中文源稿成分：36.6%锦纶，整段 FZ */
  | 'zh-composition'
  /** 翻译 grid 比例列：57.7%，GO 数字 + FZ % */
  | 'ltr-grid-head'
  /** 翻译 grid 材质列：нитрон / Acrylic，整段 GO */
  | 'ltr-grid-body'
  /** 翻译其它成分（inline-wrap、非 grid 分列） */
  | 'ltr-translated'
  /** 阿语 RTL 成分/翻译 */
  | 'arabic-rtl'
  /** 可编辑 PDF：整块成分区 / 洗涤建议（单文本框多行） */
  | 'composition-single'
  /** 洗唛上其余 LTR 文本 */
  | 'generic-ltr'

/** 中文成分整行（面料：57.7%腈纶） */
export function isChineseCompositionPartLine(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.includes('\n') || ARABIC_RE.test(trimmed)) return false
  return CJK_RE.test(trimmed) && /[\d.]/.test(trimmed) && /[%％]/.test(trimmed)
}

/** 中文成分行（36.6%锦纶）被 dom-to-svg 误拆 */
export function isChineseCompositionDigitText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.includes('\n')) return false
  if (ARABIC_RE.test(trimmed)) return false
  return /^[\d.]/.test(trimmed) && (/[%％]/.test(trimmed) || CJK_RE.test(trimmed))
}

/** LTR 数字开头行（成分百分比、货号等）；阿语行排除 */
export function isLtrDigitLeadingText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.includes('\n') || ARABIC_RE.test(trimmed)) return false
  return /^[\d.]/.test(trimmed)
}

export function exportTextContent(textEl: SVGTextElement): string {
  const tspans = [...textEl.querySelectorAll('tspan')]
  if (tspans.length === 0) return textEl.textContent ?? ''
  return tspans.map((tspan) => tspan.textContent ?? '').join('')
}

function isRtlSvgContext(textEl: SVGTextElement): boolean {
  const dir = (textEl.getAttribute('direction') || '').toLowerCase()
  if (dir === 'rtl') return true
  return Boolean(textEl.closest('g.rtl'))
}

function isLiveSingleCompositionText(textEl: SVGTextElement): boolean {
  return isLiveExportSingleTextNode(textEl)
}

export function classifyExportTextBlock(textEl: SVGTextElement): ExportTextBlockKind {
  if (isLiveSingleCompositionText(textEl)) {
    return 'composition-single'
  }

  if (textEl.closest('g.composition-material-head')) return 'ltr-grid-head'
  if (textEl.closest('g.composition-material-body')) return 'ltr-grid-body'

  const content = exportTextContent(textEl)
  if (isRtlSvgContext(textEl) || isArabicExportText(content)) {
    return 'arabic-rtl'
  }
  if (isChineseCompositionDigitText(content)) {
    return 'zh-composition'
  }
  if (
    textEl.closest('g.composition-token') ||
    textEl.closest('g.composition-material-unit') ||
    textEl.closest('g.composition-block')
  ) {
    return 'ltr-translated'
  }
  return 'generic-ltr'
}

export function forEachTextOfKind(
  svg: SVGSVGElement,
  kind: ExportTextBlockKind,
  fn: (textEl: SVGTextElement) => void,
): void {
  for (const textEl of svg.querySelectorAll('text')) {
    if (classifyExportTextBlock(textEl) === kind) fn(textEl)
  }
}

export function isExportTextBlockKind(
  textEl: SVGTextElement,
  kinds: ExportTextBlockKind[],
): boolean {
  const kind = classifyExportTextBlock(textEl)
  return kinds.includes(kind)
}
