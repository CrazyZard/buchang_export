/**
 * live 可编辑 PDF 文本合并自检：单文本框、换行、空格。
 * 运行：npm run verify:live-export
 */
import { parseHTML } from 'linkedom'
import {
  collectCareAdviceText,
  collectCompositionBlockText,
  flattenCompositionBlocksForLive,
  LIVE_EXPORT_SINGLE_TEXT_CLASS,
} from './flattenCompositionBlocksForLive'
import { flattenInlineTextSpans } from './flattenExportTextSpans'
import { mergeLiveSingleTextBlocks } from './mergeLiveSingleTextBlocks'
import { expandLiveDisplayLines, extractLiveTextLines } from './exportTextLiveGeometry'
import { toArabicVisualBaseString } from './arabicVisualOrder'
import { FZ_PERCENT_GLYPH } from './textScriptDetect'
import { PDF_FONT_FZ, PDF_FONT_GO } from './pdfFontFamilies'
import { prepareSvgForEditablePdf } from './prepareSvgForEditablePdf'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function parseFixture(html: string): HTMLElement {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`)
  const root = document.body.firstElementChild
  if (!root) throw new Error('fixture 缺少根元素')
  return root as unknown as HTMLElement
}

function testChineseSourceComposition(): void {
  const root = parseFixture(`
    <div class="wash-label wash-label--source wash-label--balabala">
      <div class="label-section label-section--composition">
        <div class="label-source-body">
          <div class="composition-block">
            <div class="composition-line">
              <span class="part-label">面料：</span>
              <span class="composition-token">
                <span class="label-latin">57.7</span><span class="composition-percent">%</span>腈纶
              </span>
            </div>
            <div class="composition-line">
              <span class="part-label part-label--continuation" aria-hidden="true"></span>
              <span class="composition-token">
                <span class="label-latin">36.6</span><span class="composition-percent">%</span>锦纶
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `)

  const body = root.querySelector('.label-source-body') as HTMLElement
  const text = collectCompositionBlockText(body)
  assert(text === '面料：57.7%腈纶\n36.6%锦纶', `中文成分采集错误: ${JSON.stringify(text)}`)
}

function testTranslatedGridAlignSpace(): void {
  const root = parseFixture(`
    <div class="wash-label wash-label--translated wash-label--balabala">
      <div class="lang-block">
        <div class="label-translated-body">
          <div class="composition-block composition-block--translated composition-block--grid-align">
            <div class="composition-line">
              <span class="part-label">Fabric:</span>
              <span class="composition-token composition-material-unit">
                <span class="composition-material-head">
                  <span class="label-latin">57.7</span><span class="composition-percent">%</span>
                </span>
                <span class="composition-material-body">Acrylic</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `)

  const body = root.querySelector('.label-translated-body') as HTMLElement
  const text = collectCompositionBlockText(body)
  assert(text === 'Fabric:57.7% Acrylic', `grid-align 空格丢失: ${JSON.stringify(text)}`)
}

function testInlineWrapMaterials(): void {
  const root = parseFixture(`
    <div class="wash-label wash-label--translated">
      <div class="lang-block">
        <div class="label-translated-body">
          <div class="composition-block composition-block--inline-wrap">
            <div class="composition-line">
              <span class="part-label">Shell:</span>
              <span class="composition-token">
                <span class="composition-material-unit">84.4% Acrylic</span>
                <span class="composition-material-unit">15.6% Wool</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `)

  const body = root.querySelector('.label-translated-body') as HTMLElement
  const text = collectCompositionBlockText(body)
  assert(text === 'Shell:84.4% Acrylic 15.6% Wool', `inline-wrap 空格丢失: ${JSON.stringify(text)}`)
}

function testCareAdviceNewlines(): void {
  const root = parseFixture(`
    <div class="wash-label wash-label--source wash-label--balabala">
      <div class="label-section label-section--care">
        <div class="label-source-advice label-source-advice--pre-line">深色洗涤。\n不可漂白。</div>
      </div>
    </div>
  `)

  const advice = root.querySelector('.label-source-advice') as HTMLElement
  const text = collectCareAdviceText(advice)
  assert(text === '深色洗涤。\n不可漂白。', `洗涤建议换行丢失: ${JSON.stringify(text)}`)
}

function testLiveFlattenPipelinePreservesText(): void {
  const root = parseFixture(`
    <div class="wash-label wash-label--source wash-label--balabala">
      <div class="label-section label-section--composition">
        <div class="label-source-body">
          <div class="composition-block">
            <div class="composition-line">
              <span class="part-label">面料：</span>
              <span class="composition-token">57.7%腈纶</span>
            </div>
          </div>
        </div>
      </div>
      <div class="label-section label-section--care">
        <div class="label-source-advice">第一行。\n第二行。</div>
      </div>
    </div>
  `)

  const restoreLive = flattenCompositionBlocksForLive(root)
  const restoreFlatten = flattenInlineTextSpans(root)

  const composition = root.querySelector(`.${LIVE_EXPORT_SINGLE_TEXT_CLASS}`) as HTMLElement
  const advice = root.querySelectorAll(`.${LIVE_EXPORT_SINGLE_TEXT_CLASS}`)[1] as HTMLElement

  assert(composition?.textContent === '面料：57.7%腈纶', `live 成分合并错误: ${composition?.textContent}`)
  assert(advice?.textContent === '第一行。\n第二行。', `live 洗涤换行被压平: ${JSON.stringify(advice?.textContent)}`)

  restoreFlatten()
  restoreLive()
}

function testExtractMultiTspanLines(): void {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="20" font-size="12" dominant-baseline="text-after-edge">
        <tspan x="0" y="20">第一行</tspan>
        <tspan x="0" y="33.8">第二行</tspan>
      </text>
    </svg>
  </body></html>`)
  const textEl = document.querySelector('text') as unknown as SVGTextElement
  const { content, lineYs } = extractLiveTextLines(textEl)
  assert(content === '第一行\n第二行', `多 tspan 未还原换行: ${JSON.stringify(content)}`)
  assert(lineYs.length === 2, `行 y 数量错误: ${lineYs.length}`)
  assert(Math.abs(lineYs[0] - 20) < 0.01, `首行 y 错误: ${lineYs[0]}`)
}

async function testWrapLongCareAdvice(): Promise<void> {
  const long = '深色洗涤时请注意与其他衣物分开洗涤并且不可使用漂白剂以免褪色。'
  const wrapped = await expandLiveDisplayLines([long], 80, 12, 'zh')
  assert(wrapped.length > 1, `长洗涤建议未折行: ${wrapped.length}`)
}

function testDownJacketIncluded(): void {
  const root = parseFixture(`
    <div class="wash-label wash-label--source wash-label--bala-down">
      <div class="label-section label-section--composition label-section--down-jacket">
        <div class="label-source-body">
          <div class="composition-block">
            <div class="composition-line">
              <span class="part-label">面料：</span>
              <span class="composition-token">100%聚酯纤维</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `)

  const restoreLive = flattenCompositionBlocksForLive(root)
  const merged = root.querySelector(`.${LIVE_EXPORT_SINGLE_TEXT_CLASS}`)
  assert(Boolean(merged), '羽绒成分区未合并为单文本')
  assert(merged?.textContent === '面料：100%聚酯纤维', `羽绒成分文本错误: ${merged?.textContent}`)
  restoreLive()
}

function testMergeSameYCompositionFragments(): void {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="live-export-single-text composition-plain">
        <text x="0" y="20" data-ex-left="0" data-ex-right="24">面料：</text>
        <text x="24" y="20" data-ex-left="24" data-ex-right="48">57.7</text>
        <text x="48" y="20" data-ex-left="48" data-ex-right="80">%腈纶</text>
      </g>
    </svg>
  </body></html>`)
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  mergeLiveSingleTextBlocks(svg)
  const texts = [...svg.querySelectorAll('text')]
  assert(texts.length === 1, `同行碎片应合并为 1 个 text，实际 ${texts.length}`)
  assert(
    texts[0]?.textContent === '面料：57.7%腈纶',
    `同行碎片拼接错误: ${JSON.stringify(texts[0]?.textContent)}`,
  )
}

async function testPercentUsesFzFont(): Promise<void> {
  ;(import.meta as ImportMeta & { env: { BASE_URL: string } }).env = {
    ...(import.meta as ImportMeta & { env: { BASE_URL?: string } }).env,
    BASE_URL: '/',
  }

  const { convertTextElementToLive } = await import('./exportTextLiveRender')

  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="live-export-single-text composition-plain">
        <text x="0" y="20" data-ex-left="0" data-ex-right="120" font-size="12" fill="#000">面料：57.7%腈纶</text>
      </g>
    </svg>
  </body></html>`)
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement

  await convertTextElementToLive(textEl)
  prepareSvgForEditablePdf(svg)

  const tspans = [...textEl.querySelectorAll('tspan')]
  const percentTspan = tspans.find((t) => (t.textContent ?? '').includes(FZ_PERCENT_GLYPH))
  assert(percentTspan !== undefined, '应有含 % 的 tspan')
  const percentFamily = (percentTspan!.getAttribute('font-family') ?? '').replace(/['"]/g, '')
  assert(
    percentFamily.includes(PDF_FONT_FZ),
    `% 应嵌入 FZ（${PDF_FONT_FZ}），实际 ${percentFamily}`,
  )

  const digitTspan = tspans.find((t) => /^[\d.]+$/.test(t.textContent ?? ''))
  assert(digitTspan !== undefined, '应有纯数字 tspan')
  const digitFamily = (digitTspan!.getAttribute('font-family') ?? '').replace(/['"]/g, '')
  assert(
    digitFamily.includes(PDF_FONT_GO),
    `数字应嵌入 GO（${PDF_FONT_GO}），实际 ${digitFamily}`,
  )
}

function testPrepareSvgMapsGoPostScriptName(): void {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="20" font-family="GO, Century Gothic, sans-serif">Acrylic</text>
    </svg>
  </body></html>`)
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement
  prepareSvgForEditablePdf(svg)
  const family = (textEl.getAttribute('font-family') ?? '').replace(/['"]/g, '')
  assert(
    family === PDF_FONT_GO,
    `GO 应映射为 PostScript 名 ${PDF_FONT_GO}，实际 ${family}`,
  )
}

function testArabicBidiVisualOrder(): void {
  const logical = 'أكريليك'
  const visual = toArabicVisualBaseString(logical)
  assert(visual !== logical, '纯阿语须经 bidi 转为视觉序')
  assert(visual === 'كيليركأ', `视觉序错误: ${visual}`)

  const mixed = '57.7%أكريليك'
  const mixedVisual = toArabicVisualBaseString(mixed)
  assert(mixedVisual === 'كيليركأ57.7%', `混排视觉序错误: ${mixedVisual}`)
}

function testPrepareSvgStripsRtlDirection(): void {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="20" direction="rtl" unicode-bidi="plaintext" font-family="Arial">أكريليك</text>
    </svg>
  </body></html>`)
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement
  prepareSvgForEditablePdf(svg)
  assert(!textEl.getAttribute('direction'), 'prepare 应移除 direction=rtl')
  assert(!textEl.getAttribute('unicode-bidi'), 'prepare 应移除 unicode-bidi')
}

function testPrepareSvgMapsFzDisplayName(): void {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="20" font-family="FZ, SimSun, 宋体, serif">36.6%锦纶</text>
    </svg>
  </body></html>`)
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement
  prepareSvgForEditablePdf(svg)
  const percentTspan = [...textEl.querySelectorAll('tspan')].find((t) =>
    (t.textContent ?? '').includes(FZ_PERCENT_GLYPH),
  )
  assert(percentTspan !== undefined, '混排应拆出 % tspan')
  const percentFamily = (percentTspan!.getAttribute('font-family') ?? '').replace(/['"]/g, '')
  assert(
    percentFamily === PDF_FONT_FZ,
    `% 应映射为 ${PDF_FONT_FZ}，实际 ${percentFamily}`,
  )
}

function testPrepareSvgSplitsPercentFromDigits(): void {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <text>
        <tspan x="0" y="20" font-family="Century Gothic">57.7%</tspan>
      </text>
    </svg>
  </body></html>`)
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement
  prepareSvgForEditablePdf(svg)
  const tspans = [...textEl.querySelectorAll('tspan')]
  assert(tspans.length >= 2, `57.7% 应拆成至少 2 个 tspan，实际 ${tspans.length}`)
  const digitTspan = tspans.find((t) => (t.textContent ?? '').match(/^[\d.]+$/))
  const percentTspan = tspans.find((t) => (t.textContent ?? '').includes(FZ_PERCENT_GLYPH))
  assert(digitTspan !== undefined, '应有数字 tspan')
  assert(percentTspan !== undefined, '应有 % tspan')
  const digitFamily = (digitTspan!.getAttribute('font-family') ?? '').replace(/['"]/g, '')
  const percentFamily = (percentTspan!.getAttribute('font-family') ?? '').replace(/['"]/g, '')
  assert(digitFamily === PDF_FONT_GO, `数字应为 ${PDF_FONT_GO}，实际 ${digitFamily}`)
  assert(percentFamily.includes(PDF_FONT_FZ), `% 应为 ${PDF_FONT_FZ}，实际 ${percentFamily}`)
}

function testProductCodesPreserveTwoLines(): void {
  const root = parseFixture(`
    <div class="wash-label wash-label--source wash-label--balabala">
      <div class="label-footer">
        <div class="footer-made-in">中国制造</div>
        <div class="product-codes label-latin">
          <div>202426103123</div>
          <div>1227</div>
        </div>
      </div>
    </div>
  `)

  const restoreFlatten = flattenInlineTextSpans(root)
  const codes = root.querySelector('.product-codes') as HTMLElement
  assert(
    codes?.textContent === '202426103123\n1227',
    `款号/工厂代码换行丢失: ${JSON.stringify(codes?.textContent)}`,
  )
  restoreFlatten()

  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="product-codes">
        <text x="10" y="20" data-ex-left="10" data-ex-right="80">202426103123</text>
        <text x="10" y="32" data-ex-left="10" data-ex-right="80">1227</text>
      </g>
    </svg>
  </body></html>`)
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  mergeLiveSingleTextBlocks(svg)
  const texts = [...svg.querySelectorAll('text')]
  assert(texts.length === 1, `工厂代码应合并为 1 个 text，实际 ${texts.length}`)
  assert(
    texts[0]?.textContent === '202426103123\n1227',
    `工厂代码合并错误: ${JSON.stringify(texts[0]?.textContent)}`,
  )
  const lineYs = texts[0]?.getAttribute('data-ex-line-ys')?.split(',') ?? []
  assert(lineYs.length === 2, `工厂代码应保留 2 行 y，实际 ${lineYs.length}`)
}

function testMergeCareAdviceWordFragments(): void {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="live-export-single-text care-advice-live">
        <text x="0" y="20" font-size="6.67" data-ex-left="0" data-ex-right="94">本商品</text>
        <text x="18" y="20.4" font-size="6.67" data-ex-left="18" data-ex-right="94">建议</text>
        <text x="36" y="19.8" font-size="6.67" data-ex-left="36" data-ex-right="94">单独</text>
        <text x="0" y="28" font-size="6.67" data-ex-left="0" data-ex-right="94">洗涤。</text>
      </g>
    </svg>
  </body></html>`)
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  mergeLiveSingleTextBlocks(svg)
  const texts = [...svg.querySelectorAll('text')]
  assert(texts.length === 1, `洗涤建议应合并为 1 个 text，实际 ${texts.length}`)
  assert(
    texts[0]?.textContent === '本商品建议单独\n洗涤。',
    `同行词碎片未合并: ${JSON.stringify(texts[0]?.textContent)}`,
  )
}

async function runAll(): Promise<void> {
  testChineseSourceComposition()
  testTranslatedGridAlignSpace()
  testInlineWrapMaterials()
  testCareAdviceNewlines()
  testLiveFlattenPipelinePreservesText()
  testExtractMultiTspanLines()
  await testWrapLongCareAdvice()
  testDownJacketIncluded()
  testMergeSameYCompositionFragments()
  testArabicBidiVisualOrder()
  testPrepareSvgStripsRtlDirection()
  testPrepareSvgMapsFzDisplayName()
  testPrepareSvgMapsGoPostScriptName()
  testPrepareSvgSplitsPercentFromDigits()
  testProductCodesPreserveTwoLines()
  testMergeCareAdviceWordFragments()
  await testPercentUsesFzFont()
  console.log('verify:live-export 全部通过')
}

void runAll()
