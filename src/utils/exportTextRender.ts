import { classifyExportTextBlock } from './exportTextBlockKind'
import type { FontRole } from './svgTextToPathsUtils'
import {
  appendArabicVisualPath,
  appendBestLtrLinePath,
  appendSplitTextPaths,
  appendTextPath,
  appendZhUnifiedTextPath,
  groupTspansByLine,
  isRealMultilineText,
  parseCoord,
  renderLtrLinesUnified,
  resolveFontForRole,
  resolvePathY,
  usesAfterEdgeBaseline,
} from './svgTextToPathsUtils'

export async function renderTextRunsByBlock(
  ownerDocument: Document,
  group: SVGGElement,
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
): Promise<boolean> {
  const kind = classifyExportTextBlock(textEl)
  switch (kind) {
    case 'zh-composition':
      return renderZhCompositionBlock(ownerDocument, group, textEl, fontSize, fill)
    case 'ltr-grid-head':
      return renderLtrGridHeadBlock(ownerDocument, group, textEl, fontSize, fill)
    case 'ltr-grid-body':
      return renderLtrGridBodyBlock(ownerDocument, group, textEl, fontSize, fill)
    case 'ltr-translated':
      return renderLtrTranslatedBlock(
        ownerDocument,
        group,
        textEl,
        fontSize,
        fill,
        defaultRole,
      )
    case 'arabic-rtl':
      return renderArabicRtlBlock(ownerDocument, group, textEl, fontSize, fill, defaultRole)
    case 'composition-single':
      return renderGenericLtrBlock(
        ownerDocument,
        group,
        textEl,
        fontSize,
        fill,
        defaultRole,
      )
    case 'generic-ltr':
      return renderGenericLtrBlock(
        ownerDocument,
        group,
        textEl,
        fontSize,
        fill,
        defaultRole,
      )
  }
}

async function renderPlainLineAt(
  _ownerDocument: Document,
  _group: SVGGElement,
  textEl: SVGTextElement,
  content: string,
  _fontSize: number,
  _fill: string,
  draw: (
    content: string,
    startX: number,
    rawY: number,
    usesAfterEdge: boolean,
  ) => Promise<number>,
): Promise<boolean> {
  if (!content) return false
  const usesAfterEdge = usesAfterEdgeBaseline(textEl)
  const rawY = parseCoord(textEl.getAttribute('y'))
  const startX = parseCoord(textEl.getAttribute('x'))
  const width = await draw(content, startX, rawY, usesAfterEdge)
  return width > 0
}

async function renderZhCompositionBlock(
  ownerDocument: Document,
  group: SVGGElement,
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
): Promise<boolean> {
  const content = textEl.textContent ?? ''
  const tspans = [...textEl.querySelectorAll('tspan')]

  if (tspans.length === 0) {
    return renderPlainLineAt(ownerDocument, group, textEl, content, fontSize, fill, async (text, startX, rawY, usesAfterEdge) => {
      const font = await resolveFontForRole('zh')
      if (!font) return 0
      const y = resolvePathY(font, rawY, fontSize, usesAfterEdge)
      return appendZhUnifiedTextPath(ownerDocument, group, text, startX, y, fontSize, fill)
    })
  }

  const lines = groupTspansByLine(textEl)
  const realMultiline = isRealMultilineText(content, lines, textEl)
  if (realMultiline) {
    return renderLtrLinesUnified(ownerDocument, group, lines, fontSize, fill, 'zh', usesAfterEdgeBaseline(textEl))
  }

  const baseX = parseCoord(textEl.getAttribute('x'))
  const xs = tspans.map((tspan) => parseCoord(tspan.getAttribute('x'), baseX))
  const startX = xs.length ? Math.min(...xs) : baseX
  const rawY =
    lines[0]?.y ??
    parseCoord(tspans[0]?.getAttribute('y'), parseCoord(textEl.getAttribute('y')))
  const font = await resolveFontForRole('zh')
  if (!font) return false
  const y = resolvePathY(font, rawY, fontSize, usesAfterEdgeBaseline(textEl))
  const width = await appendZhUnifiedTextPath(
    ownerDocument,
    group,
    content,
    startX,
    y,
    fontSize,
    fill,
  )
  return width > 0
}

/** grid 比例列：GO 数字 + FZ %，从 dom 坐标顺序转曲 */
async function renderLtrGridHeadBlock(
  ownerDocument: Document,
  group: SVGGElement,
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
): Promise<boolean> {
  return renderPlainLineAt(ownerDocument, group, textEl, textEl.textContent ?? '', fontSize, fill, async (text, startX, rawY, usesAfterEdge) => {
    const font = await resolveFontForRole('latin')
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
      'latin',
      false,
    )
  })
}

/** grid 材质列：整段 GO，不拆 % */
async function renderLtrGridBodyBlock(
  ownerDocument: Document,
  group: SVGGElement,
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
): Promise<boolean> {
  return renderPlainLineAt(ownerDocument, group, textEl, textEl.textContent ?? '', fontSize, fill, async (text, startX, rawY, usesAfterEdge) => {
    const font = await resolveFontForRole('latin')
    if (!font) return 0
    const y = resolvePathY(font, rawY, fontSize, usesAfterEdge)
    return appendTextPath(ownerDocument, group, font, text, startX, y, fontSize, fill)
  })
}

/** 翻译 inline-wrap 等：沿用 LTR 成分规则 */
async function renderLtrTranslatedBlock(
  ownerDocument: Document,
  group: SVGGElement,
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
): Promise<boolean> {
  const tspans = [...textEl.querySelectorAll('tspan')]
  const content = textEl.textContent ?? ''

  if (tspans.length === 0) {
    return renderPlainLineAt(ownerDocument, group, textEl, content, fontSize, fill, async (text, startX, rawY, usesAfterEdge) =>
      appendBestLtrLinePath(
        ownerDocument,
        group,
        text,
        startX,
        rawY,
        fontSize,
        fill,
        defaultRole,
        usesAfterEdge,
      ),
    )
  }

  const lines = groupTspansByLine(textEl)
  return renderLtrLinesUnified(
    ownerDocument,
    group,
    lines,
    fontSize,
    fill,
    defaultRole,
    usesAfterEdgeBaseline(textEl),
  )
}

/** 阿语 RTL：整形 + bidi 重排为视觉序，按 dom-to-svg 量得的 [left,right] 缩放转曲 */
async function renderArabicRtlBlock(
  ownerDocument: Document,
  group: SVGGElement,
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
): Promise<boolean> {
  const tspans = [...textEl.querySelectorAll('tspan')]
  // 用 tspan 拼接的内容，避免 tspan 外缩进/换行被误判为多行
  const content = tspans.length
    ? tspans.map((tspan) => tspan.textContent ?? '').join('')
    : (textEl.textContent ?? '')
  if (!content) return false

  const usesAfterEdge = usesAfterEdgeBaseline(textEl)
  const font = await resolveFontForRole(defaultRole)
  if (!font) return false

  const lines = groupTspansByLine(textEl)
  const realMultiline = tspans.length > 1 && isRealMultilineText(content, lines, textEl)

  // 多行阿语：按 dom-to-svg 每行 tspan 的 y/x 分行转曲
  if (realMultiline) {
    let rendered = false
    for (const line of lines) {
      const lineText = line.tspans.map((tspan) => tspan.textContent ?? '').join('')
      if (!lineText) continue
      const rawY = line.y
      const y = resolvePathY(font, rawY, fontSize, usesAfterEdge)
      const leftX = line.startX
      const width = await appendArabicVisualPath(
        ownerDocument,
        group,
        lineText,
        leftX,
        leftX,
        y,
        fontSize,
        fill,
      )
      if (width > 0) rendered = true
    }
    return rendered
  }

  const rawY =
    lines[0]?.y ??
    parseCoord(tspans[0]?.getAttribute('y'), parseCoord(textEl.getAttribute('y')))
  const y = resolvePathY(font, rawY, fontSize, usesAfterEdge)

  // 删 textLength 前捕获的左右缘；缺失时回退到 tspan x
  const leftX = parseCoord(
    textEl.getAttribute('data-ex-left'),
    parseCoord(tspans[0]?.getAttribute('x'), parseCoord(textEl.getAttribute('x'))),
  )
  const rightX = parseCoord(textEl.getAttribute('data-ex-right'), leftX)

  const width = await appendArabicVisualPath(
    ownerDocument,
    group,
    content,
    leftX,
    rightX,
    y,
    fontSize,
    fill,
  )
  return width > 0
}

async function renderGenericLtrBlock(
  ownerDocument: Document,
  group: SVGGElement,
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
): Promise<boolean> {
  const tspans = [...textEl.querySelectorAll('tspan')]
  const content = textEl.textContent ?? ''

  if (tspans.length === 0) {
    return renderPlainLineAt(ownerDocument, group, textEl, content, fontSize, fill, async (text, startX, rawY, usesAfterEdge) =>
      appendBestLtrLinePath(
        ownerDocument,
        group,
        text,
        startX,
        rawY,
        fontSize,
        fill,
        defaultRole,
        usesAfterEdge,
      ),
    )
  }

  const lines = groupTspansByLine(textEl)
  return renderLtrLinesUnified(
    ownerDocument,
    group,
    lines,
    fontSize,
    fill,
    defaultRole,
    usesAfterEdgeBaseline(textEl),
  )
}
