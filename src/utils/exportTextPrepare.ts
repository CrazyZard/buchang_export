import {
  isChineseCompositionDigitText,
  isLtrDigitLeadingText,
} from './exportTextBlockKind'
import { ARABIC_RE } from './textScriptDetect'
import {
  collapseTextElementToPlain,
  groupTspansByLine,
  INTRA_TEXT_LINE_Y_TOLERANCE,
  isLikelyDigitTspanSplit,
  isRealMultilineText,
  mergeTspansIntoOne,
  parseCoord,
  parseFontSize,
  parseLineHeight,
  readTextAnchorX,
  readTextAnchorY,
  snapTextLinePositions,
} from './svgTextToPathsUtils'

const OVERLAP_TEXT_X_TOLERANCE = 6

const INLINE_TEXT_CONTAINER_SELECTOR = [
  'g.composition-token',
  'g.composition-material-unit',
  'g.composition-material-head',
  'g.composition-material-body',
  'g.composition-line',
  'g.composition-block',
  'g.composition-footnote',
  'g.label-source-advice',
  'g.care-advice-tail',
  'g.product-codes',
  'g.down-fill-grid-cell',
].join(', ')

function isSvgGroup(node: Element): node is SVGGElement {
  return node.tagName.toLowerCase() === 'g'
}

function isSvgText(node: Element): node is SVGTextElement {
  return node.tagName.toLowerCase() === 'text'
}

/**
 * 合并误拆是几何问题，按文本/坐标判断，**不依赖语义块分类**。
 * 阿语统一用 dir=rtl 或字符判断，避免参与 LTR 数字合并。
 */
function isArabicTextEl(textEl: SVGTextElement): boolean {
  const dir = (textEl.getAttribute('direction') || '').toLowerCase()
  if (dir === 'rtl') return true
  return ARABIC_RE.test(textEl.textContent ?? '')
}

/** 阿语单行：合并误拆 tspan，统一交给右锚转曲 */
function collapseArabicSingleLine(svg: SVGSVGElement): void {
  for (const textEl of svg.querySelectorAll('text')) {
    if (!isArabicTextEl(textEl)) continue
    if (textEl.querySelectorAll('tspan').length < 2) continue
    const full = textEl.textContent ?? ''
    const lines = groupTspansByLine(textEl)
    if (isRealMultilineText(full, lines, textEl)) continue
    collapseTextElementToPlain(textEl)
  }
}

/** 数字开头行（成分百分比、货号等）：压平 tspan；阿语已被 isLtrDigitLeadingText 排除 */
function flattenDigitTextTspans(svg: SVGSVGElement): void {
  for (const textEl of svg.querySelectorAll('text')) {
    const full = textEl.textContent ?? ''
    if (!isLtrDigitLeadingText(full)) continue
    if (textEl.querySelectorAll('tspan').length < 1) continue
    collapseTextElementToPlain(textEl)
  }
}

/** 中文成分行（36.6%锦纶）：无条件合并误拆 tspan */
function forceConsolidateZhComposition(svg: SVGSVGElement): void {
  for (const textEl of svg.querySelectorAll('text')) {
    const full = textEl.textContent ?? ''
    if (!isChineseCompositionDigitText(full)) continue
    if (textEl.querySelectorAll('tspan').length < 2) continue
    mergeTspansIntoOne(textEl, tspansOf(textEl))
  }
}

function tspansOf(textEl: SVGTextElement): SVGTSpanElement[] {
  return [...textEl.querySelectorAll('tspan')]
}

function shouldConsolidateTspans(textEl: SVGTextElement, tspans: SVGTSpanElement[]): boolean {
  const merged = tspans.map((tspan) => tspan.textContent ?? '').join('')
  if (!merged) return false

  const dir = (textEl.getAttribute('direction') || '').toLowerCase()
  if (dir === 'rtl' || ARABIC_RE.test(merged)) return false

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

/** 通用：合并误拆 tspan（非阿语），避免 36.6/3.4 首字叠成黑点 */
function consolidateSvgTextTspans(svg: SVGSVGElement): void {
  let changed = true
  while (changed) {
    changed = false
    for (const textEl of svg.querySelectorAll('text')) {
      const tspans = tspansOf(textEl)
      if (tspans.length < 2) continue
      if (!shouldConsolidateTspans(textEl, tspans)) continue
      mergeTspansIntoOne(textEl, tspans)
      changed = true
    }
  }
}

type OverlapItem = { el: SVGTextElement; x: number; y: number; order: number }

/** 同行同 x 的数字误拆 <text> 合并；阿语跳过，不同列（x 间距大）不合并 */
function mergeOverlapDigitTexts(texts: SVGTextElement[]): void {
  if (texts.length < 2) return

  const items: OverlapItem[] = texts.map((el, order) => ({
    el,
    x: readTextAnchorX(el),
    y: readTextAnchorY(el),
    order,
  }))

  const lineGroups: OverlapItem[][] = []
  for (const item of items) {
    const group = lineGroups.find(
      (line) => Math.abs(line[0].y - item.y) <= INTRA_TEXT_LINE_Y_TOLERANCE,
    )
    if (group) group.push(item)
    else lineGroups.push([item])
  }

  for (const group of lineGroups) {
    if (group.length < 2) continue
    group.sort((a, b) => a.x - b.x || a.order - b.order)

    const removed = new Set<SVGTextElement>()
    for (let index = 0; index < group.length; index++) {
      const anchor = group[index]
      if (removed.has(anchor.el)) continue

      const cluster = [anchor]
      for (let j = index + 1; j < group.length; j++) {
        const candidate = group[j]
        if (removed.has(candidate.el)) continue
        if (Math.abs(candidate.x - anchor.x) <= OVERLAP_TEXT_X_TOLERANCE) {
          cluster.push(candidate)
        }
      }
      if (cluster.length < 2) continue

      const merged = cluster.map((item) => item.el.textContent ?? '').join('')
      if (ARABIC_RE.test(merged)) continue
      if (!isLtrDigitLeadingText(merged) && !/^[\d.]/.test(merged.trim())) continue

      const primary = cluster[0].el
      primary.querySelectorAll('tspan').forEach((tspan) => tspan.remove())
      primary.textContent = merged
      primary.setAttribute('x', String(cluster[0].x))
      primary.setAttribute('y', String(readTextAnchorY(primary)))

      for (let k = 1; k < cluster.length; k++) {
        removed.add(cluster[k].el)
        cluster[k].el.remove()
      }
    }
  }
}

/** 容器内 + 全局：合并被 dom-to-svg 拆成多段的数字 <text> */
function mergeDescendantDigitTexts(svg: SVGSVGElement): void {
  const containers = new Set<SVGGElement>()
  for (const node of svg.querySelectorAll(INLINE_TEXT_CONTAINER_SELECTOR)) {
    if (isSvgGroup(node)) containers.add(node)
  }
  for (const node of svg.querySelectorAll('g')) {
    if (!isSvgGroup(node)) continue
    if (node.querySelectorAll('text').length >= 2) containers.add(node)
  }

  for (const container of containers) {
    mergeOverlapDigitTexts([...container.querySelectorAll('text')].filter(isSvgText))
  }

  mergeOverlapDigitTexts([...svg.querySelectorAll('text')].filter(isSvgText))
}

/**
 * 材质列（material-body / material-unit）内：把同一行被拆碎的 <text> 段合并成一整段。
 * 数字碎片合并只认「数字开头」，纯字母材质（нитрон/Acrylic）会漏网，
 * 残留 dom-to-svg 去 textLength 后被破坏的逐段 x → 字母间出现忽大忽小的空格感。
 * 合并后从起点按字体自身字宽重排，字距均匀。
 */
function mergeColumnTextsPerLine(container: SVGGElement): void {
  const texts = [...container.querySelectorAll('text')].filter(isSvgText)
  if (texts.length < 2) return

  const items: OverlapItem[] = texts.map((el, order) => ({
    el,
    x: readTextAnchorX(el),
    y: readTextAnchorY(el),
    order,
  }))

  const lines: OverlapItem[][] = []
  for (const item of items) {
    const line = lines.find(
      (group) => Math.abs(group[0].y - item.y) <= INTRA_TEXT_LINE_Y_TOLERANCE,
    )
    if (line) line.push(item)
    else lines.push([item])
  }

  for (const line of lines) {
    if (line.length < 2) continue
    line.sort((a, b) => a.x - b.x || a.order - b.order)

    const merged = line.map((item) => item.el.textContent ?? '').join('')
    if (ARABIC_RE.test(merged)) continue

    const primary = line[0].el
    primary.querySelectorAll('tspan').forEach((tspan) => tspan.remove())
    primary.textContent = merged
    primary.setAttribute('x', String(line[0].x))
    primary.setAttribute('y', String(readTextAnchorY(primary)))

    for (let i = 1; i < line.length; i++) {
      line[i].el.remove()
    }
  }
}

/** grid 材质列 / inline-wrap 材质：合并同行碎片，修字母字距空格感 */
function mergeMaterialColumnTexts(svg: SVGSVGElement): void {
  for (const selector of ['g.composition-material-body', 'g.composition-material-unit']) {
    for (const node of svg.querySelectorAll(selector)) {
      if (isSvgGroup(node)) mergeColumnTextsPerLine(node)
    }
  }
}

/** LTR 文本按视觉行合并 tspan，去掉 textLength 拉伸后的分散 x（修俄文等字距） */
function collapseLtrTspansPerVisualLine(svg: SVGSVGElement): void {
  for (const textEl of svg.querySelectorAll('text')) {
    if (isArabicTextEl(textEl)) continue
    const tspans = tspansOf(textEl)
    if (tspans.length < 2) continue

    const full = textEl.textContent ?? ''
    const lines = groupTspansByLine(textEl)

    if (!isRealMultilineText(full, lines, textEl)) {
      collapseTextElementToPlain(textEl)
      continue
    }

    for (const line of lines) {
      if (line.tspans.length >= 2) {
        mergeTspansIntoOne(textEl, line.tspans)
      }
    }
  }
}

/**
 * 转曲前整理 SVG 文本。
 * 合并阶段与语义块无关（纯几何 + 文本），确保被拆碎的片段一定先合并回完整行；
 * render 阶段再对完整行按块分字体（见 exportTextRender.ts）。
 */
export function prepareSvgTextForPathConvert(svg: SVGSVGElement): void {
  snapTextLinePositions(svg)
  collapseArabicSingleLine(svg)
  flattenDigitTextTspans(svg)
  forceConsolidateZhComposition(svg)
  consolidateSvgTextTspans(svg)
  flattenDigitTextTspans(svg)
  mergeDescendantDigitTexts(svg)
  mergeMaterialColumnTexts(svg)
  collapseLtrTspansPerVisualLine(svg)
  flattenDigitTextTspans(svg)
}
