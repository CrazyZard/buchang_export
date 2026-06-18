/**
 * 自检：dom-to-svg 误拆数字（36.6 → 3 + 6.6）时，转曲前须合并为单行纯文本。
 * 运行：npm run verify:digit-export
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseHTML } from 'linkedom'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..')

;(import.meta as ImportMeta & { env: { BASE_URL: string } }).env = {
  ...(import.meta as ImportMeta & { env: { BASE_URL?: string } }).env,
  BASE_URL: '/',
}

const { prepareSvgTextForPathConvert, convertSvgTextToPaths } = await import('./svgTextToPaths')
const { flattenInlineTextSpans } = await import('./flattenExportTextSpans')

function loadSvgFixture(markup: string): SVGSVGElement {
  const { document } = parseHTML(
    `<!DOCTYPE html><html><body>${markup}</body></html>`,
    { xml: { preserveNodeType: true } },
  )
  const svg = document.querySelector('svg')
  if (!svg) throw new Error('fixture 缺少 svg')
  return svg as unknown as SVGSVGElement
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function countTexts(svg: SVGSVGElement): number {
  return svg.querySelectorAll('text').length
}

function countTspans(svg: SVGSVGElement): number {
  return svg.querySelectorAll('tspan').length
}

function textBodies(svg: SVGSVGElement): string[] {
  return [...svg.querySelectorAll('text')].map((node) => node.textContent ?? '')
}

function testFlattenLabelLatinSpans(): void {
  const { document } = parseHTML(`
    <div class="wash-label wash-label--source wash-label--balabala">
      <div class="composition-line">
        <span class="part-label">面料：</span>
        <span class="composition-token composition-material-unit">
          <span class="label-latin">36.6</span><span class="composition-percent">%</span>锦纶
        </span>
      </div>
    </div>
  `)
  const root = document.querySelector('.wash-label') as HTMLElement
  const restore = flattenInlineTextSpans(root)
  try {
    const token = root.querySelector('.composition-token')
    assert(Boolean(token), '应有 composition-token')
    assert(!token?.querySelector('.label-latin'), '导出压平后不应残留 label-latin')
    assert((token?.textContent ?? '') === '36.6%锦纶', `压平后应为 36.6%锦纶，实际 ${token?.textContent}`)
  } finally {
    restore()
  }
}

function testFlattenGridAlignHeadBody(): void {
  const { document } = parseHTML(`
    <div class="wash-label">
      <span class="composition-token composition-material-unit">
        <span class="composition-material-head">
          <span class="label-latin">5.7</span><span class="composition-percent">%</span>
        </span>
        <span class="composition-material-body">Acrylic</span>
      </span>
    </div>
  `)
  const root = document.querySelector('.wash-label') as HTMLElement
  const restore = flattenInlineTextSpans(root)
  try {
    const head = root.querySelector('.composition-material-head')
    const body = root.querySelector('.composition-material-body')
    assert((head?.textContent ?? '') === '5.7%', `grid head 应压平为 5.7%，实际 ${head?.textContent}`)
    assert((body?.textContent ?? '') === 'Acrylic', `grid body 应保留 Acrylic，实际 ${body?.textContent}`)
    assert(!head?.querySelector('.label-latin'), 'head 不应残留 label-latin')
  } finally {
    restore()
  }
}

function testFlattenInlineWrapMaterials(): void {
  const { document } = parseHTML(`
    <div class="wash-label">
      <span class="composition-token">
        <span class="composition-material-unit">57.7% Acrylic</span>
        <span class="composition-material-unit">36.6% Nylon</span>
      </span>
    </div>
  `)
  const root = document.querySelector('.wash-label') as HTMLElement
  const restore = flattenInlineTextSpans(root)
  try {
    const token = root.querySelector('.composition-token')
    assert(
      (token?.textContent ?? '') === '57.7% Acrylic 36.6% Nylon',
      `拼接材质压平应保留空格，实际 ${token?.textContent}`,
    )
  } finally {
    restore()
  }
}

function testPrepareMergesFlatSvgTexts(): void {
  const svg = loadSvgFixture(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <text x="10" y="20" font-size="12">3</text>
      <text x="10" y="20" font-size="12">6.6%锦纶</text>
    </svg>
  `)

  prepareSvgTextForPathConvert(svg)
  assert(countTexts(svg) === 1, `扁平 SVG 叠字：应合并为 1 个 text，实际 ${countTexts(svg)}`)
  assert(textBodies(svg)[0] === '36.6%锦纶', `扁平 SVG 叠字：内容应为 36.6%锦纶，实际 ${textBodies(svg)[0]}`)
}

function testPrepareMergesSplitTspans(): void {
  const svg = loadSvgFixture(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="composition-token">
        <text x="10" y="20" font-size="12">
          <tspan x="10" y="20">3</tspan>
          <tspan x="10" y="20">6.6%</tspan>
          <tspan x="10" y="20">锦纶</tspan>
        </text>
      </g>
    </svg>
  `)

  prepareSvgTextForPathConvert(svg)
  assert(countTexts(svg) === 1, `tspan 误拆：应合并为 1 个 text，实际 ${countTexts(svg)}`)
  assert(countTspans(svg) === 0, `tspan 误拆：应清除 tspan，实际 ${countTspans(svg)}`)
  assert(textBodies(svg)[0] === '36.6%锦纶', `tspan 误拆：内容应为 36.6%锦纶，实际 ${textBodies(svg)[0]}`)
}

function testPrepareMergesSplitTextNodes(): void {
  const svg = loadSvgFixture(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="composition-token">
        <text x="10" y="20" font-size="12"><tspan x="10" y="20">3</tspan></text>
        <text x="10" y="20" font-size="12"><tspan x="10" y="20">.4%</tspan></text>
        <text x="10" y="20" font-size="12"><tspan x="10" y="20">棉</tspan></text>
      </g>
    </svg>
  `)

  prepareSvgTextForPathConvert(svg)
  assert(countTexts(svg) === 1, `多 text 叠字：应合并为 1 个 text，实际 ${countTexts(svg)}`)
  assert(textBodies(svg)[0] === '3.4%棉', `多 text 叠字：内容应为 3.4%棉，实际 ${textBodies(svg)[0]}`)
}

function testPrepareMergesFalseMultiline(): void {
  const svg = loadSvgFixture(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="composition-token">
        <text x="10" y="20" font-size="12">
          <tspan x="10" y="20">3</tspan>
          <tspan x="10" y="28">6.6%锦纶</tspan>
        </text>
      </g>
    </svg>
  `)

  prepareSvgTextForPathConvert(svg)
  assert(countTexts(svg) === 1, `假换行：应合并为 1 个 text，实际 ${countTexts(svg)}`)
  assert(textBodies(svg)[0] === '36.6%锦纶', `假换行：内容应为 36.6%锦纶，实际 ${textBodies(svg)[0]}`)
}

function installFontFetchMock(): void {
  const originalFetch = globalThis.fetch?.bind(globalThis)
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('/') || url.includes('/fonts/')) {
      const relative = url.replace(/^\/+/, '').replace(/^.*\/fonts\//, 'fonts/')
      const filePath = join(rootDir, 'public', relative)
      const buffer = readFileSync(filePath)
      return new Response(buffer, { status: 200 })
    }
    if (!originalFetch) {
      throw new Error(`未 mock 的 fetch: ${url}`)
    }
    return originalFetch(input, init)
  }
}

function installWindowMock(): void {
  if (typeof globalThis.window === 'undefined') {
    ;(globalThis as typeof globalThis & { window: Window }).window = globalThis as unknown as Window
  }
  if (typeof globalThis.window.setTimeout === 'undefined') {
    globalThis.window.setTimeout = setTimeout
    globalThis.window.clearTimeout = clearTimeout
  }
}

async function testConvertLeavesNoOverlappingDigitPrefix(): Promise<void> {
  installWindowMock()
  installFontFetchMock()
  const svg = loadSvgFixture(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="composition-token">
        <text x="10" y="20" font-size="12" fill="#000">
          <tspan x="10" y="20">3</tspan>
          <tspan x="10" y="20">6.6%</tspan>
          <tspan x="10" y="20">锦纶</tspan>
        </text>
      </g>
    </svg>
  `)

  await convertSvgTextToPaths(svg)
  assert(countTexts(svg) === 0, '转曲后不应残留 text')

  const paths = [...svg.querySelectorAll('path')]
  assert(paths.length >= 1, `转曲后应有 path，实际 ${paths.length}`)

  const xs: number[] = []
  for (const path of paths) {
    const d = path.getAttribute('d') ?? ''
    const match = d.match(/M\s*([-\d.]+)/)
    if (match?.[1]) xs.push(parseFloat(match[1]))
  }
  assert(xs.length >= 1, '应能解析 path 起点 x')

  if (paths.length >= 2) {
    const minX = Math.min(...xs)
    const nearMin = xs.filter((x) => Math.abs(x - minX) < 0.5)
    assert(
      nearMin.length <= 1,
      `数字行首「3」处不应有多条 path 叠画（同 x 有 ${nearMin.length} 条），x=${xs.join(',')}`,
    )
  }
}

function collectPathStartXs(svg: SVGSVGElement): number[] {
  const xs: number[] = []
  for (const path of svg.querySelectorAll('path')) {
    const d = path.getAttribute('d') ?? ''
    const match = d.match(/M\s*([-\d.]+)/)
    if (match?.[1]) xs.push(parseFloat(match[1]))
  }
  return xs
}

/** 解析 path 局部坐标并沿父级 translate/scale 变换到 SVG 世界坐标 */
function pathWorldXExtents(path: Element): { minX: number; maxX: number } {
  const nums = (path.getAttribute('d') ?? '').match(/-?\d+\.?\d*/g)?.map(Number) ?? []
  let minX = Infinity
  let maxX = -Infinity
  for (let i = 0; i + 1 < nums.length; i += 2) {
    minX = Math.min(minX, nums[i])
    maxX = Math.max(maxX, nums[i])
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0 }

  let el: Element | null = path.parentElement
  while (el && el.tagName.toLowerCase() !== 'svg') {
    const transform = el.getAttribute('transform') ?? ''
    const translate = transform.match(/translate\(\s*([-\d.]+)/)
    const scale = transform.match(/scale\(\s*([-\d.]+)/)
    const tx = translate ? parseFloat(translate[1]) : 0
    const sx = scale ? parseFloat(scale[1]) : 1
    minX = minX * sx + tx
    maxX = maxX * sx + tx
    el = el.parentElement
  }
  return { minX, maxX }
}

async function testArabicRtlPathsStayInView(): Promise<void> {
  installWindowMock()
  installFontFetchMock()

  // 阿语整形+bidi+分字体，按 data-ex-left/right 缩放，应落在该区间内
  const left = 30
  const right = 63
  const svg = loadSvgFixture(`
    <svg xmlns="http://www.w3.org/2000/svg" width="95" height="120" viewBox="0 0 95 120">
      <g class="composition-token composition-material-unit">
        <text y="20" font-size="6" direction="rtl" fill="#000" data-ex-left="${left}" data-ex-right="${right}">
          <tspan x="${left}" y="20">57.7%أكريليك</tspan>
        </text>
      </g>
    </svg>
  `)
  await convertSvgTextToPaths(svg)
  assert(countTexts(svg) === 0, '阿语：转曲后不应残留 text')

  let minX = Infinity
  let maxX = -Infinity
  for (const path of svg.querySelectorAll('path')) {
    const { minX: pMin, maxX: pMax } = pathWorldXExtents(path)
    minX = Math.min(minX, pMin)
    maxX = Math.max(maxX, pMax)
  }
  assert(Number.isFinite(minX), '阿语：应有 path 坐标')
  assert(minX >= left - 2, `阿语：左缘应≈${left}，实际 minX=${minX.toFixed(2)}`)
  assert(maxX <= right + 2, `阿语：右缘应≈${right}，实际 maxX=${maxX.toFixed(2)}`)
}

/** 回归：阿语数字段转曲（带横向缩放）不得污染 GO 字形缓存，导致后续中文数字错位 */
async function testZhCompositionDigitBBox(): Promise<void> {
  installWindowMock()
  installFontFetchMock()

  const svg = loadSvgFixture(`
    <svg xmlns="http://www.w3.org/2000/svg" width="95" height="226" viewBox="0 0 95 226">
      <g class="composition-token composition-material-unit">
        <text font-size="6.66667" font-family="FZ, SimSun, 宋体, serif" direction="ltr" fill="#000">
          <tspan x="26.44" y="82">36.6%锦纶</tspan>
        </text>
      </g>
    </svg>
  `)
  await convertSvgTextToPaths(svg)

  let digitMaxX = -Infinity
  for (const path of svg.querySelectorAll('path')) {
    const { minX, maxX } = pathWorldXExtents(path)
    if (minX >= 26 && minX <= 28 && maxX > digitMaxX) digitMaxX = maxX
  }
  assert(
    digitMaxX <= 42,
    `中文 36.6 数字 path 右缘应≈39，不应被拉伸到 ~78，实际 maxX=${digitMaxX.toFixed(2)}`,
  )
}

async function testArabicDoesNotPolluteLatinGlyphs(): Promise<void> {
  installWindowMock()
  installFontFetchMock()

  // 1. 先转曲含数字的阿语行（数字段走 GO + scaleX 缩放）
  const ar = loadSvgFixture(`
    <svg xmlns="http://www.w3.org/2000/svg" width="95" height="226" viewBox="0 0 95 226">
      <g class="composition-token composition-material-unit">
        <text y="20" font-size="6" direction="rtl" fill="#000" data-ex-left="30" data-ex-right="63">
          <tspan x="30" y="20">36.6%البولي</tspan>
        </text>
      </g>
    </svg>
  `)
  await convertSvgTextToPaths(ar)

  // 2. 再转曲中文成分 36.6%锦纶（数字段走同一 GO）
  const zh = loadSvgFixture(`
    <svg xmlns="http://www.w3.org/2000/svg" width="95" height="226" viewBox="0 0 95 226">
      <g class="composition-token composition-material-unit">
        <text font-size="6.66667" font-family="FZ, SimSun, 宋体, serif" direction="ltr" fill="#000">
          <tspan x="26.44" y="82">36.6%锦纶</tspan>
        </text>
      </g>
    </svg>
  `)
  await convertSvgTextToPaths(zh)

  let maxX = -Infinity
  for (const path of zh.querySelectorAll('path')) {
    const { maxX: pMax } = pathWorldXExtents(path)
    maxX = Math.max(maxX, pMax)
  }
  // 36.6%锦纶 起点 26.44、整行宽约 35，右缘应 ~61；若被污染会被拉到 ~78
  assert(maxX <= 66, `中文 36.6%锦纶 不应被阿语数字转曲污染拉伸，实际 maxX=${maxX.toFixed(2)}`)
}

function testPrepareSkipsArabicDigitMerge(): void {
  const svg = loadSvgFixture(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="composition-token">
        <text x="10" y="20" font-size="12">57.7</text>
        <text x="10" y="20" font-size="12">%أكريليك</text>
      </g>
    </svg>
  `)

  prepareSvgTextForPathConvert(svg)
  assert(countTexts(svg) === 2, `阿语行不应被数字叠字合并逻辑吞掉，实际 ${countTexts(svg)} 个 text`)
}

function testPrepareMergesLatinPercentSplit(): void {
  const svg = loadSvgFixture(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="composition-material-head">
        <text x="10" y="20" font-size="12" font-family="GO">57.7</text>
        <text x="10" y="20" font-size="12" font-family="FZ">%</text>
      </g>
    </svg>
  `)

  prepareSvgTextForPathConvert(svg)
  assert(countTexts(svg) === 1, `英文 % 叠字：应合并为 1 个 text，实际 ${countTexts(svg)}`)
  assert(textBodies(svg)[0] === '57.7%', `英文 % 叠字：内容应为 57.7%，实际 ${textBodies(svg)[0]}`)
}

async function main(): Promise<void> {
  testFlattenLabelLatinSpans()
  testFlattenGridAlignHeadBody()
  testFlattenInlineWrapMaterials()
  testPrepareMergesLatinPercentSplit()
  testPrepareMergesFlatSvgTexts()
  testPrepareMergesSplitTspans()
  testPrepareMergesSplitTextNodes()
  testPrepareMergesFalseMultiline()
  testPrepareSkipsArabicDigitMerge()
  await testConvertLeavesNoOverlappingDigitPrefix()
  await testZhCompositionDigitBBox()
  await testArabicRtlPathsStayInView()
  await testArabicDoesNotPolluteLatinGlyphs()
  console.log('verify:digit-export 全部通过')
}

main().catch((error) => {
  console.error('verify:digit-export 失败:', error)
  process.exit(1)
})
