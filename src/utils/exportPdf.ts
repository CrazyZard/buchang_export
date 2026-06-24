import { elementToSVG, inlineResources } from 'dom-to-svg'
import { jsPDF } from 'jspdf'
import 'svg2pdf.js'
import {
  preloadExportFonts,
  removeRasterImages,
  resetExportFontCache,
} from './svgTextToPaths'
import { convertSvgTextToLiveText } from './exportTextLive'
import { embedWashLabelPdfFonts, patchPdfLiveTextPipeline, resetEmbeddedPdfFontCache } from './pdfFontEmbed'
import { prepareSvgForEditablePdf } from './prepareSvgForEditablePdf'
import { classifyExportTextBlock } from './exportTextBlockKind'
import { flattenCompositionBlocksForLive } from './flattenCompositionBlocksForLive'
import { flattenInlineTextSpans } from './flattenExportTextSpans'
import { mergeLiveSingleTextBlocks } from './mergeLiveSingleTextBlocks'
import { normalizeSvgRootForPdf } from './normalizeSvgForPdf'

const LABEL_WIDTH_MM_DEFAULT = 25
const PAGE_MARGIN_MM = 2
const LABEL_GAP_MM = 3
const MIN_LABEL_HEIGHT_MM = 10

/** 从 label 元素读取 CSS 变量 --label-width，没有则回退到默认 25mm */
function getLabelWidthMm(label: HTMLElement): number {
  const raw = getComputedStyle(label).getPropertyValue('--label-width').trim()
  const val = parseFloat(raw)
  if (val > 0) return val
  return LABEL_WIDTH_MM_DEFAULT
}

function waitForLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function waitForAutoFit(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 120)
  })
}

function queryWashLabels(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.wash-label')).filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  )
}

/** dom-to-svg 会跳过 visibility:hidden 的节点；导出区在屏外时也要临时移到视口内量尺寸 */
function prepareCaptureEnvironment(elements: HTMLElement[]): () => void {
  const restored = new Map<
    HTMLElement,
    { visibility: string; left: string; top: string; opacity: string }
  >()

  const remember = (el: HTMLElement) => {
    if (restored.has(el)) return
    restored.set(el, {
      visibility: el.style.visibility,
      left: el.style.left,
      top: el.style.top,
      opacity: el.style.opacity,
    })
  }

  for (const root of elements) {
    let el: HTMLElement | null = root
    while (el) {
      remember(el)
      if (getComputedStyle(el).visibility === 'hidden') {
        el.style.visibility = 'visible'
      }
      el = el.parentElement
    }
  }

  const captureRoot = elements[0]?.closest('.export-capture') as HTMLElement | null
  if (captureRoot) {
    remember(captureRoot)
    captureRoot.style.left = '0'
    captureRoot.style.top = '0'
    captureRoot.style.opacity = '0'
    captureRoot.style.visibility = 'visible'
  }

  return () => {
    restored.forEach((styles, el) => {
      el.style.visibility = styles.visibility
      el.style.left = styles.left
      el.style.top = styles.top
      el.style.opacity = styles.opacity
    })
  }
}

/** 导出前取消子元素 overflow 裁剪 */
function unlockOverflow(root: HTMLElement): void {
  root.style.overflow = 'visible'
  root.style.overflowX = 'visible'
  root.style.overflowY = 'visible'

  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const { overflow, overflowX, overflowY } = getComputedStyle(el)
    if (
      overflow !== 'visible' ||
      overflowX !== 'visible' ||
      overflowY !== 'visible'
    ) {
      el.style.overflow = 'visible'
      el.style.overflowX = 'visible'
      el.style.overflowY = 'visible'
    }
  })
}

function measurePairHeight(source: HTMLElement, translated: HTMLElement): number {
  return Math.max(
    source.scrollHeight,
    translated.scrollHeight,
    source.offsetHeight,
    translated.offsetHeight,
  )
}

/** 导出前让中文与翻译洗唛等高（按完整内容高度） */
function syncPairMinHeight(source: HTMLElement, translated: HTMLElement): void {
  source.style.minHeight = ''
  translated.style.minHeight = ''

  unlockOverflow(source)
  unlockOverflow(translated)

  const maxPx = measurePairHeight(source, translated)
  if (maxPx <= 0) return

  const height = `${maxPx}px`
  source.style.minHeight = height
  translated.style.minHeight = height
}

/** 按 CSS --label-width 与 DOM 实际高宽比换算洗唛高度（比 SVG viewBox 更稳） */
function measureLabelHeightMm(element: HTMLElement): number {
  const widthPx = element.offsetWidth || element.getBoundingClientRect().width
  const heightPx = element.offsetHeight || element.getBoundingClientRect().height
  if (widthPx <= 0 || heightPx <= 0) {
    throw new Error('洗唛尺寸为 0，请刷新页面后重试')
  }
  return getLabelWidthMm(element) * (heightPx / widthPx)
}

function isRtlCaptureText(textEl: SVGTextElement): boolean {
  const dir = (textEl.getAttribute('direction') || '').toLowerCase()
  if (dir === 'rtl') return true
  return Boolean(textEl.closest('g[dir="rtl"], [dir="rtl"], g.rtl, .rtl'))
}

/**
 * 删 textLength 前，先把 dom-to-svg 测得的几何（左缘/右缘）存到 text 上。
 * 右缘 = tspan.x + textLength —— 阿语 RTL 转曲要靠它右对齐（否则 text 无 x，右锚算成 0 → 全挤到左缘叠一起）。
 * RTL 且 textLength=0 时：x 为右锚，左缘记 0（dom-to-svg 量不到阿语宽度）。
 */
function captureExportGeometry(svg: SVGSVGElement): void {
  const textEls = svg.querySelectorAll('text') as NodeListOf<SVGTextElement>
  for (let i = 0; i < textEls.length; i++) {
    const textEl = textEls[i]
    const tspans = Array.from<SVGTSpanElement>(textEl.querySelectorAll('tspan'))
    const rtl = isRtlCaptureText(textEl)

    const xs: number[] = []
    let right = -Infinity

    if (tspans.length > 0) {
      for (const tspan of tspans) {
        const x = parseFloat(tspan.getAttribute('x') ?? '')
        if (!Number.isFinite(x)) continue
        xs.push(x)
        const tl = parseFloat(tspan.getAttribute('textLength') ?? '')
        if (Number.isFinite(tl) && tl > 0) {
          right = Math.max(right, x + tl)
        } else if (rtl) {
          right = Math.max(right, x)
          xs.push(0)
        } else {
          right = Math.max(right, x)
        }
      }
    } else {
      const x = parseFloat(textEl.getAttribute('x') ?? '')
      if (Number.isFinite(x)) {
        xs.push(x)
        const tl = parseFloat(textEl.getAttribute('textLength') ?? '')
        if (Number.isFinite(tl) && tl > 0) {
          right = Number.isFinite(tl) ? x + tl : x
        } else if (rtl) {
          right = x
          xs.push(0)
        } else {
          right = x
        }
      }
    }

    if (!xs.length || !Number.isFinite(right)) continue

    textEl.setAttribute('data-ex-left', String(Math.min(...xs)))
    textEl.setAttribute('data-ex-right', String(right))
  }
}

/**
 * dom-to-svg 会给 tspan 加 textLength/lengthAdjust 以匹配浏览器排版；
 * svg2pdf 字体度量不同，保留这些属性会导致文字被横向拉伸/压缩。
 */
function fixSvgTextForPdf(svg: SVGSVGElement): void {
  svg.querySelectorAll('tspan, text').forEach((node) => {
    node.removeAttribute('textLength')
    node.removeAttribute('lengthAdjust')
  })
}

/** 诊断：控制台执行 window.__EXPORT_DEBUG__=true 后导出，打印转曲前真实 SVG 文本结构 */
function logSvgTextStructure(svg: SVGSVGElement, label: string): void {
  if (typeof window === 'undefined') return
  if (!(window as unknown as { __EXPORT_DEBUG__?: boolean }).__EXPORT_DEBUG__) return

  const rows = Array.from(svg.querySelectorAll('text')).map((textEl, index) => {
    const tspans = Array.from(textEl.querySelectorAll('tspan')).map((tspan) => ({
      x: tspan.getAttribute('x'),
      y: tspan.getAttribute('y'),
      textLength: tspan.getAttribute('textLength'),
      text: tspan.textContent,
    }))
    return {
      index,
      block: classifyExportTextBlock(textEl),
      content: textEl.textContent,
      x: textEl.getAttribute('x'),
      y: textEl.getAttribute('y'),
      direction: textEl.getAttribute('direction'),
      textAnchor: textEl.getAttribute('text-anchor'),
      textLength: textEl.getAttribute('textLength'),
      fontFamily: textEl.getAttribute('font-family'),
      fontSizeAttr: textEl.getAttribute('font-size'),
      fontSizeStyle: (textEl as unknown as { style?: { fontSize?: string } }).style?.fontSize ?? null,
      parentClass: (textEl.parentElement as Element | null)?.getAttribute('class') ?? null,
      tspanCount: tspans.length,
      tspans,
    }
  })

  // eslint-disable-next-line no-console
  console.log(
    `[EXPORT_DEBUG] ${label} viewBox=${svg.getAttribute('viewBox')} width=${svg.getAttribute('width')}\n` +
      JSON.stringify(rows, null, 2),
  )
}

/** 诊断：转曲完成、喂给 svg2pdf 前，打印每个 path 的字形数/包围盒/父 transform */
function logFinalPaths(svg: SVGSVGElement, label: string): void {
  if (typeof window === 'undefined') return
  if (!(window as unknown as { __EXPORT_DEBUG__?: boolean }).__EXPORT_DEBUG__) return

  const rows = Array.from(svg.querySelectorAll('path')).map((p, index) => {
    const d = p.getAttribute('d') ?? ''
    const glyphCount = (d.match(/M/gi) ?? []).length // M 命令数≈子路径数
    const nums = d.match(/-?\d+\.?\d*/g)?.map(Number) ?? []
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i + 1 < nums.length; i += 2) {
      minX = Math.min(minX, nums[i])
      maxX = Math.max(maxX, nums[i])
      minY = Math.min(minY, nums[i + 1])
      maxY = Math.max(maxY, nums[i + 1])
    }
    let el: Element | null = p
    const transforms: string[] = []
    while (el && el !== svg) {
      const t = el.getAttribute('transform')
      if (t) transforms.push(t)
      el = el.parentElement
    }
    return {
      index,
      glyphCount,
      bbox: [
        Number.isFinite(minX) ? +minX.toFixed(1) : null,
        Number.isFinite(minY) ? +minY.toFixed(1) : null,
        Number.isFinite(maxX) ? +maxX.toFixed(1) : null,
        Number.isFinite(maxY) ? +maxY.toFixed(1) : null,
      ],
      transforms,
      fill: p.getAttribute('fill'),
      dLen: d.length,
    }
  })

  // eslint-disable-next-line no-console
  console.log(`[FINAL_PATHS] ${label} pathCount=${rows.length}\n` + JSON.stringify(rows, null, 1))
}

/** DOM → SVG：保留可编辑文字 */
async function elementToSvgRoot(element: HTMLElement): Promise<SVGSVGElement> {
  const restoreLiveBlocks = flattenCompositionBlocksForLive(element)
  const restoreFlatten = flattenInlineTextSpans(element)

  try {
    unlockOverflow(element)
    await waitForLayout()

    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error('洗唛预览未就绪，请稍候再试')
    }

    const svgDocument = elementToSVG(element, { captureArea: rect })
    const svgRoot = svgDocument.documentElement as unknown as SVGSVGElement

    try {
      await inlineResources(svgRoot)
    } catch (error) {
      console.warn('导出资源内联失败，继续使用 SVG 文本/路径', error)
    }

    logSvgTextStructure(svgRoot, element.className)
    captureExportGeometry(svgRoot)
    fixSvgTextForPdf(svgRoot)
    removeRasterImages(svgRoot)

    try {
      resetExportFontCache()
      mergeLiveSingleTextBlocks(svgRoot)
      await convertSvgTextToLiveText(svgRoot)
      prepareSvgForEditablePdf(svgRoot)
    } catch (error) {
      console.warn('可编辑文字导出失败', error)
      throw error instanceof Error ? error : new Error('可编辑文字导出失败')
    }

    normalizeSvgRootForPdf(svgRoot)

    logFinalPaths(svgRoot, element.className)

    return svgRoot
  } finally {
    restoreFlatten()
    restoreLiveBlocks()
  }
}

interface SvgLabelPair {
  sourceSvg: SVGSVGElement
  translatedSvg: SVGSVGElement
  sourceHeightMm: number
  translatedHeightMm: number
  labelWidthMm: number
}

async function buildSvgLabelPair(
  source: HTMLElement,
  translated: HTMLElement,
): Promise<SvgLabelPair> {
  const sourceHeightMm = measureLabelHeightMm(source)
  const translatedHeightMm = measureLabelHeightMm(translated)
  const labelWidthMm = getLabelWidthMm(source)

  const sourceSvg = await elementToSvgRoot(source)
  const translatedSvg = await elementToSvgRoot(translated)

  return {
    sourceSvg,
    translatedSvg,
    sourceHeightMm,
    translatedHeightMm,
    labelWidthMm,
  }
}

async function renderSvgLabelPair(
  pdf: jsPDF,
  pair: SvgLabelPair,
): Promise<void> {
  const heightMm = Math.max(pair.sourceHeightMm, pair.translatedHeightMm)
  const w = pair.labelWidthMm

    await pdf.svg(pair.sourceSvg, {
      x: PAGE_MARGIN_MM,
      y: PAGE_MARGIN_MM,
      width: w,
      height: heightMm,
    })

    await pdf.svg(pair.translatedSvg, {
      x: PAGE_MARGIN_MM + w + LABEL_GAP_MM,
      y: PAGE_MARGIN_MM,
      width: w,
      height: heightMm,
    })
}

function pageWidthMm(labelWidthMm: number): number {
  return PAGE_MARGIN_MM * 2 + labelWidthMm * 2 + LABEL_GAP_MM
}

function createPdfPage(widthMm: number, heightMm: number): jsPDF {
  // 洗唛 PDF 始终是「横向并排两列」，页面宽 > 高时用 landscape 避免 jsPDF 交换宽高
  const orientation = widthMm > heightMm ? 'landscape' : 'portrait'
  return new jsPDF({
    orientation,
    unit: 'mm',
    format: [widthMm, heightMm],
  })
}

async function prepareExportContainers(
  sourceContainer: HTMLElement,
  translatedContainer: HTMLElement,
): Promise<void> {
  await waitForLayout()
  await waitForAutoFit()
  await waitForLayout()

  const sourceLabels = queryWashLabels(sourceContainer)
  const translatedLabels = queryWashLabels(translatedContainer)

  sourceLabels.forEach((source, index) => {
    const translated = translatedLabels[index]
    if (translated) syncPairMinHeight(source, translated)
  })

  await waitForLayout()
}

export async function exportLabelsPdf(
  sourceContainer: HTMLElement,
  translatedContainer: HTMLElement,
  filename = '洗唛.pdf',
): Promise<void> {
  const restoreCaptureEnvironment = prepareCaptureEnvironment([
    sourceContainer,
    translatedContainer,
  ])

  try {
    await waitForLayout()

    resetExportFontCache()
    resetEmbeddedPdfFontCache()
    const fonts = await preloadExportFonts()
    if (!fonts.zh) {
      throw new Error(
        '无法加载 public/fonts/FZ.TTF 或 NotoSansSC，请确认字体文件存在后硬刷新页面再导出',
      )
    }
    if (!fonts.arabic) {
      console.warn('阿语字体 ARIAL 未加载，阿语导出可能错乱')
    }

    const sourceLabels = queryWashLabels(sourceContainer)
    const translatedLabels = queryWashLabels(translatedContainer)

    console.log(`[批量导出] sourceLabels=${sourceLabels.length}, translatedLabels=${translatedLabels.length}`)

    if (sourceLabels.length === 0) {
      throw new Error('没有可导出的洗唛')
    }
    if (sourceLabels.length !== translatedLabels.length) {
      throw new Error('中文与翻译条数不一致，请重新加载批量数据')
    }

    await prepareExportContainers(sourceContainer, translatedContainer)

    const labelWidthMm = getLabelWidthMm(sourceLabels[0])
    const widthMm = pageWidthMm(labelWidthMm)
    let pdf: jsPDF | null = null

    let restoreLiveText: () => void = () => {}

    for (let i = 0; i < sourceLabels.length; i++) {
      syncPairMinHeight(sourceLabels[i], translatedLabels[i])
      await waitForLayout()

      const pair = await buildSvgLabelPair(sourceLabels[i], translatedLabels[i])
      const contentHeightMm = Math.max(
        pair.sourceHeightMm,
        pair.translatedHeightMm,
        MIN_LABEL_HEIGHT_MM,
      )
      const pageHeightMm = PAGE_MARGIN_MM * 2 + contentHeightMm

      if (!pdf) {
        pdf = createPdfPage(widthMm, pageHeightMm)
        await embedWashLabelPdfFonts(pdf)
        restoreLiveText = patchPdfLiveTextPipeline(pdf)
        console.log(`[批量导出] 第1条: 创建PDF页 sourceH=${pair.sourceHeightMm.toFixed(1)} translatedH=${pair.translatedHeightMm.toFixed(1)} pageH=${pageHeightMm.toFixed(1)}`)
      } else {
        pdf.addPage([widthMm, pageHeightMm], widthMm > pageHeightMm ? 'l' : 'p')
        console.log(`[批量导出] 第${i + 1}条: addPage sourceH=${pair.sourceHeightMm.toFixed(1)} translatedH=${pair.translatedHeightMm.toFixed(1)} pageH=${pageHeightMm.toFixed(1)} pdfPageCount=${pdf.getNumberOfPages()}`)
      }

      // 显式 setPage 确保 pdf.svg() 落在正确页面（jsPDF svg 插件在多页场景下可能丢失当前页上下文）
      pdf.setPage(pdf.getNumberOfPages())
      await renderSvgLabelPair(pdf, pair)
    }

    console.log(`[批量导出] 循环结束, PDF总页数=${pdf!.getNumberOfPages()}`)
    restoreLiveText()
    pdf!.save(filename)
  } finally {
    restoreCaptureEnvironment()
  }
}

export function resolvePdfFilename(batchCount: number): string {
  return batchCount > 1 ? '洗唛批量.pdf' : '洗唛.pdf'
}
