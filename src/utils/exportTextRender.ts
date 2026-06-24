import { isArabicExportText } from './arabicTextExport'
import {
  classifyExportTextBlock,
  isCareAdviceLiveNode,
  isChineseCompositionDigitText,
  isChineseCompositionPartLine,
  isProductCodesSvgBlock,
} from './exportTextBlockKind'
import {
  expandLiveDisplayLines,
  extractLiveTextLines,
  LIVE_LABEL_TEXT_WIDTH_PX,
  measureMixedWidth,
  readLiveLineYs,
  resolveCenteredLineStartX,
  resolveLiveWrapMaxWidth,
} from './exportTextLiveGeometry'
import { isArabicRtlExportContext, readTextStartX, resolveArabicLiveBoxBounds } from './exportTextLiveUtils'
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
  parseLineHeight,
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
      return renderCompositionSingleBlock(
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
      const rawLeft = parseCoord(textEl.getAttribute('data-ex-left'), line.startX)
      const rawRight = parseCoord(textEl.getAttribute('data-ex-right'), rawLeft)
      const { leftX, rightX } = resolveArabicLiveBoxBounds(textEl, rawLeft, rawRight, line.startX)
      const width = await appendArabicVisualPath(
        ownerDocument,
        group,
        lineText,
        leftX,
        rightX,
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

  const rawLeft = parseCoord(
    textEl.getAttribute('data-ex-left'),
    parseCoord(tspans[0]?.getAttribute('x'), parseCoord(textEl.getAttribute('x'))),
  )
  const rawRight = parseCoord(textEl.getAttribute('data-ex-right'), rawLeft)
  const { leftX, rightX } = resolveArabicLiveBoxBounds(textEl, rawLeft, rawRight)

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

/** 整块成分区 / 洗涤建议：阿语走 RTL 转曲，其余走 LTR（与 live 导出 renderCompositionSingleLive 一致） */
function splitCompositionSingleLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').replace(/\s+$/, ''))
    .filter((line) => line.length > 0)
}

function isCompositionPlainSvgBlock(textEl: SVGTextElement): boolean {
  return Boolean(textEl.closest('g.composition-plain, .composition-plain'))
}

const MATERIAL_TOKEN_RE = /^[\d.]+%/

interface CompositionPlainLineLayout {
  text: string
  lineX: number
}

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

/** 整块成分区 / 洗涤建议：与 live 导出同管线，逐行转曲（阿语 appendArabicVisualPath，LTR appendBestLtrLinePath） */
async function renderCompositionSingleBlock(
  ownerDocument: Document,
  group: SVGGElement,
  textEl: SVGTextElement,
  fontSize: number,
  fill: string,
  defaultRole: FontRole,
): Promise<boolean> {
  const rawLeftX = parseCoord(textEl.getAttribute('data-ex-left'), readTextStartX(textEl))
  const rawRightX = parseCoord(textEl.getAttribute('data-ex-right'), rawLeftX)
  const { leftX, rightX } = resolveArabicLiveBoxBounds(textEl, rawLeftX, rawRightX)
  const isPlainComposition = isCompositionPlainSvgBlock(textEl)
  const isCareAdvice = isCareAdviceLiveNode(textEl)
  const usesAfterEdge = usesAfterEdgeBaseline(textEl)

  const { content } = extractLiveTextLines(textEl)
  const rawLines = splitCompositionSingleLines(content)
  if (!rawLines.length) return false

  const wrapRole: FontRole =
    isArabicRtlExportContext(textEl) || rawLines.some((line) => isArabicExportText(line))
      ? 'arabic'
      : defaultRole

  const maxWidth = resolveLiveWrapMaxWidth(leftX, rightX, {
    isPlainComposition,
    isCareAdvice,
  })
  let lines = await expandLiveDisplayLines(rawLines, maxWidth, fontSize, wrapRole)
  if (!lines.length) return false

  let plainLayouts = isPlainComposition
    ? await layoutCompositionPlainLines(lines, leftX, fontSize, wrapRole)
    : null

  if (plainLayouts) {
    const reflowed = await reflowIndentedPlainLines(plainLayouts, leftX, fontSize, wrapRole)
    lines = reflowed.lines
    plainLayouts = reflowed.layouts
  }

  const lineYs = readLiveLineYs(textEl, lines.length)
  let rendered = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const lineY = lineYs[i] ?? lineYs[0]
    const availLeft = plainLayouts?.[i]?.lineX ?? leftX

    if (isArabicExportText(line)) {
      // 阿语多行：续行不受 plainLayouts 缩进影响，统一用 leftX
      const lineBounds = resolveArabicLiveBoxBounds(textEl, leftX, rightX, leftX)
      const arabicFont = await resolveFontForRole('arabic')
      if (!arabicFont) continue
      const y = resolvePathY(arabicFont, lineY, fontSize, usesAfterEdge)
      const width = await appendArabicVisualPath(
        ownerDocument,
        group,
        line,
        lineBounds.leftX,
        lineBounds.rightX,
        y,
        fontSize,
        fill,
      )
      if (width > 0) rendered = true
      continue
    }

    if (isCareAdvice) {
      const zhFont = await resolveFontForRole('zh')
      if (!zhFont) continue
      const y = resolvePathY(zhFont, lineY, fontSize, usesAfterEdge)
      const width = appendTextPath(
        ownerDocument,
        group,
        zhFont,
        line,
        availLeft,
        y,
        fontSize,
        fill,
      )
      if (width > 0) rendered = true
      continue
    }

    if (isChineseCompositionDigitText(line) || isChineseCompositionPartLine(line)) {
      const zhFont = await resolveFontForRole('zh')
      if (!zhFont) continue
      const y = resolvePathY(zhFont, lineY, fontSize, usesAfterEdge)
      const width = await appendZhUnifiedTextPath(
        ownerDocument,
        group,
        line,
        availLeft,
        y,
        fontSize,
        fill,
      )
      if (width > 0) rendered = true
      continue
    }

    const width = await appendBestLtrLinePath(
      ownerDocument,
      group,
      line,
      availLeft,
      lineY,
      fontSize,
      fill,
      defaultRole,
      usesAfterEdge,
    )
    if (width > 0) rendered = true
  }

  return rendered
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
  const centerCodes = isProductCodesSvgBlock(textEl)

  const resolveStartX = async (line: string, fallbackX: number): Promise<number> => {
    if (!centerCodes) return fallbackX
    const leftX = parseCoord(textEl.getAttribute('data-ex-left'), fallbackX)
    const rightX = parseCoord(textEl.getAttribute('data-ex-right'), leftX + LIVE_LABEL_TEXT_WIDTH_PX)
    const lineWidth = await measureMixedWidth(line, fontSize, defaultRole)
    return resolveCenteredLineStartX(leftX, rightX, lineWidth)
  }

  if (tspans.length === 0) {
    const explicitLines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (explicitLines.length > 1) {
      const usesAfterEdge = usesAfterEdgeBaseline(textEl)
      const fallbackX = parseCoord(textEl.getAttribute('x'))
      const rawY = parseCoord(textEl.getAttribute('y'))
      const lineStep = parseLineHeight(textEl.getAttribute('line-height'), fontSize)
      let rendered = false
      for (let i = 0; i < explicitLines.length; i += 1) {
        const startX = await resolveStartX(explicitLines[i], fallbackX)
        const width = await appendBestLtrLinePath(
          ownerDocument,
          group,
          explicitLines[i],
          startX,
          rawY + i * lineStep,
          fontSize,
          fill,
          defaultRole,
          usesAfterEdge,
        )
        if (width > 0) rendered = true
      }
      return rendered
    }

    return renderPlainLineAt(ownerDocument, group, textEl, content, fontSize, fill, async (text, startX, rawY, usesAfterEdge) => {
      const drawX = centerCodes ? await resolveStartX(text, startX) : startX
      return appendBestLtrLinePath(
        ownerDocument,
        group,
        text,
        drawX,
        rawY,
        fontSize,
        fill,
        defaultRole,
        usesAfterEdge,
      )
    })
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
