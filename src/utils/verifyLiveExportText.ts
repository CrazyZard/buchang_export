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
import { expandLiveDisplayLines, extractLiveTextLines, LIVE_LABEL_TEXT_WIDTH_PX, measureMixedWidth } from './exportTextLiveGeometry'
import { toArabicVisualBaseString } from './arabicVisualOrder'
import { FZ_PERCENT_GLYPH } from './textScriptDetect'
import { PDF_FONT_ARIAL, PDF_FONT_FZ, PDF_FONT_GO } from './pdfFontFamilies'
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

async function testRussianFootnoteWrapsWithinLabel(): Promise<void> {
  const footnote = '(Кроме аппликации/рисунка тюля)'
  const wrapped = await expandLiveDisplayLines([footnote], LIVE_LABEL_TEXT_WIDTH_PX, 8, 'latin')
  assert(wrapped.length > 1, `俄文脚注应折行: ${wrapped.join(' | ')}`)
  for (const line of wrapped) {
    const width = await measureMixedWidth(line, 8, 'latin')
    assert(
      width <= LIVE_LABEL_TEXT_WIDTH_PX + 1,
      `折行后仍超宽: ${line} width=${width}`,
    )
  }
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

function testPrepareSvgMapsFzChineseDisplayNameToPostScript(): void {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="20" font-family="方正兰亭细黑简体">锦纶</text>
    </svg>
  </body></html>`)
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement
  prepareSvgForEditablePdf(svg)
  const family = (textEl.getAttribute('font-family') ?? '').replace(/['"]/g, '')
  assert(
    family === PDF_FONT_FZ,
    `FZ 中文显示名应映射为 PostScript 名 ${PDF_FONT_FZ}，实际 ${family}`,
  )
  assert(
    !/[^\x00-\x7F]/.test(family),
    `PDF 字体名须为 ASCII，实际 ${family}`,
  )
}

function testArabicBidiVisualOrder(): void {
  const logical = 'أكريليك'
  const visual = toArabicVisualBaseString(logical)
  assert(visual !== logical, '转曲管线：纯阿语须经 bidi 转为视觉序')
  assert(visual === 'كيليركأ', `视觉序错误: ${visual}`)

  const mixed = '57.7%أكريليك'
  const mixedVisual = toArabicVisualBaseString(mixed)
  assert(mixedVisual === 'كيليركأ57.7%', `混排视觉序错误: ${mixedVisual}`)
}

async function testArabicLiveLongLineStaysVisibleAfterPrepare(): Promise<void> {
  const { appendArabicLiveTspans } = await import('./exportTextLiveUtils')
  const longLine =
    'النسيج الرئيسي: 57.7% أكريليك 36.6% نايلون 5.7% صوف ميرينو 3.4% قطن'
  const { document } = parseHTML(
    `<!DOCTYPE html><html><body><svg xmlns="http://www.w3.org/2000/svg"><g class="live-export-single-text composition-plain" dir="rtl"><text data-ex-left="0" data-ex-right="94"></text></g></svg></body></html>`,
  )
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement

  await appendArabicLiveTspans(textEl, longLine, 0, 94, 20, 6, '#000')
  prepareSvgForEditablePdf(svg)

  const tspans = [...textEl.querySelectorAll('tspan')].filter((t) => (t.textContent ?? '').trim())
  assert(tspans.length >= 1, '长阿语行应有 tspan')
  for (const tspan of tspans) {
    const x = parseFloat(tspan.getAttribute('x') ?? 'NaN')
    assert(
      Number.isFinite(x) && x >= 0 && x <= 94,
      `长阿语行 x 不应跑出画布: ${x} text=${JSON.stringify(tspan.textContent)}`,
    )
    assert(!tspan.getAttribute('text-anchor'), 'prepare 后不应保留 text-anchor=end')
  }
  assert(
    tspans.some((t) => (t.textContent ?? '').length > 0),
    '长阿语行内容不应被清空',
  )
}

async function testArabicLivePrepareConvertsEndAnchor(): Promise<void> {
  const { appendArabicLiveTspans, resolveArabicLiveBoxBounds } = await import('./exportTextLiveUtils')
  const { document } = parseHTML(
    `<!DOCTYPE html><html><body><svg xmlns="http://www.w3.org/2000/svg"><g class="rtl composition-plain"><text data-ex-left="0" data-ex-right="94"></text></g></svg></body></html>`,
  )
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement

  const bounds = resolveArabicLiveBoxBounds(textEl, 0, 94)
  await appendArabicLiveTspans(textEl, 'المكونات:', bounds.leftX, bounds.rightX, 20, 12, '#000')
  prepareSvgForEditablePdf(svg)
  const tspans = [...textEl.querySelectorAll('tspan')]
  assert(tspans.length >= 1, '应有阿语 tspan')
  assert(!tspans[0]?.getAttribute('text-anchor'), 'prepare 应将右锚换算为左锚 x')
  const x = parseFloat(tspans[0]?.getAttribute('x') ?? 'NaN')
  assert(x > 0 && x < 94, `阿语应靠右排列（x 在 0~94 内偏右）: ${x}`)
}

async function testArabicSurvivesZeroTextLengthCaptured(): Promise<void> {
  const { appendArabicLiveTspans, resolveArabicLiveBoxBounds } = await import('./exportTextLiveUtils')
  const { document } = parseHTML(
    `<!DOCTYPE html><html><body><svg xmlns="http://www.w3.org/2000/svg"><g class="live-export-single-text composition-plain" dir="rtl"><text direction="rtl" data-ex-left="73.51" data-ex-right="73.51">المكونات:</text></g></svg></body></html>`,
  )
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement

  const bounds = resolveArabicLiveBoxBounds(textEl, 73.51, 73.51)
  assert(bounds.leftX === 0, `textLength=0 捕获左缘应忽略右锚: ${bounds.leftX}`)
  assert(bounds.rightX === LIVE_LABEL_TEXT_WIDTH_PX, `阿语右缘应贴 25mm: ${bounds.rightX}`)

  await appendArabicLiveTspans(textEl, 'المكونات:', bounds.leftX, bounds.rightX, 20, 12, '#000')
  for (const tspan of textEl.querySelectorAll('tspan')) {
    const x = parseFloat(tspan.getAttribute('x') ?? 'NaN')
    assert(
      Number.isFinite(x) && x >= 0 && x <= LIVE_LABEL_TEXT_WIDTH_PX,
      `textLength=0 时阿语 x 应在画布内: ${x}`,
    )
  }
}

async function testArabicSurvivesOverflowCapturedRight(): Promise<void> {
  const { appendArabicLiveTspans, resolveArabicLiveBoxBounds } = await import('./exportTextLiveUtils')
  const { document } = parseHTML(
    `<!DOCTYPE html><html><body><svg xmlns="http://www.w3.org/2000/svg"><g class="live-export-single-text composition-plain" dir="rtl"><text data-ex-left="0" data-ex-right="220">المكونات:</text></g></svg></body></html>`,
  )
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement

  const bounds = resolveArabicLiveBoxBounds(textEl, 0, 220)
  assert(bounds.rightX === LIVE_LABEL_TEXT_WIDTH_PX, `阿语右缘应贴 25mm: ${bounds.rightX}`)

  await appendArabicLiveTspans(textEl, 'المكونات:', bounds.leftX, bounds.rightX, 20, 12, '#000')
  prepareSvgForEditablePdf(svg)

  for (const tspan of textEl.querySelectorAll('tspan')) {
    const x = parseFloat(tspan.getAttribute('x') ?? 'NaN')
    assert(
      Number.isFinite(x) && x >= 0 && x <= LIVE_LABEL_TEXT_WIDTH_PX,
      `溢出 capturedRight 时阿语 x 仍应在画布内: ${x}`,
    )
  }
}

function testFlattenPreservesArabicDir(): void {
  const root = parseFixture(`
    <div class="wash-label wash-label--translated wash-label--balabala">
      <div class="lang-block rtl">
        <div class="label-translated-body">
          <div class="live-export-single-text composition-plain" dir="rtl" data-plain-text="أكريليك">
            <span class="composition-plain-line">أكريليك</span>
          </div>
        </div>
      </div>
    </div>
  `)
  const restore = flattenCompositionBlocksForLive(root)
  const plain = root.querySelector('.composition-plain') as HTMLElement
  assert(plain?.getAttribute('dir') === 'rtl', 'live 压平应保留 dir=rtl')
  assert(plain?.style.textAlign === 'right', 'live 压平应保留右对齐')
  restore()
}

async function testArabicLiveKeepsLogicalOrder(): Promise<void> {
  const { appendArabicLiveTspans } = await import('./exportTextLiveUtils')
  const { document } = parseHTML(
    `<!DOCTYPE html><html><body><svg xmlns="http://www.w3.org/2000/svg"><g class="rtl composition-plain"><text data-ex-left="0" data-ex-right="94"></text></g></svg></body></html>`,
  )
  const textEl = document.querySelector('text') as unknown as SVGTextElement

  await appendArabicLiveTspans(textEl, 'المكونات:', 0, 94, 20, 12, '#000')
  const tspans = [...textEl.querySelectorAll('tspan')]
  assert(tspans.length >= 1, '应有阿语 tspan')
  assert(tspans[0]?.getAttribute('text-anchor') === 'end', '阿语应右锚对齐')
  assert(tspans[0]?.getAttribute('x') === '94', `阿语应锚在右缘: ${tspans[0]?.getAttribute('x')}`)
  assert(
    tspans[0]?.textContent === 'المكونات:',
    `live 阿语应写逻辑序: ${JSON.stringify(tspans[0]?.textContent)}`,
  )
  assert(
    !tspans.some((t) => (t.textContent ?? '').includes('كيليركأ')),
    'live 阿语不应 bidi 反序',
  )

  const mixedEl = document.createElementNS('http://www.w3.org/2000/svg', 'text') as unknown as SVGTextElement
  await appendArabicLiveTspans(mixedEl, '57.7%أكريليك', 0, 94, 20, 12, '#000')
  const mixedTspans = [...mixedEl.querySelectorAll('tspan')]
  const mixedRuns = mixedTspans.map((t) => t.textContent ?? '')
  assert(mixedRuns.includes('57.7') && mixedRuns.length === 3, `混排应 3 段: ${JSON.stringify(mixedRuns)}`)
  assert(mixedRuns.includes('أكريليك'), `混排阿语段应为逻辑序: ${JSON.stringify(mixedRuns)}`)
  const digitIdx = mixedRuns.indexOf('57.7')
  const percentIdx = mixedRuns.findIndex((t) => t.includes('％') || t === '%')
  const arabicIdx = mixedRuns.indexOf('أكريليك')
  assert(digitIdx >= 0 && percentIdx > digitIdx, `57.7% 应作 LTR 单元: ${JSON.stringify(mixedRuns)}`)
  assert(
    mixedTspans[arabicIdx]?.getAttribute('text-anchor') === 'end',
    '阿语材质段应右锚',
  )
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

async function testProductCodesCenteredInLiveExport(): Promise<void> {
  const { convertTextElementToLive } = await import('./exportTextLiveRender')
  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="product-codes">
        <text x="10" y="20" data-ex-left="0" data-ex-right="94" font-size="12" fill="#000">202426103123\n1227</text>
      </g>
    </svg>
  </body></html>`)
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement
  await convertTextElementToLive(textEl)

  const tspans = [...textEl.querySelectorAll('tspan')]
  assert(tspans.length >= 2, `工厂代码应有多行 tspan，实际 ${tspans.length}`)
  const xs = tspans.map((t) => parseFloat(t.getAttribute('x') || 'NaN'))
  assert(xs.every((x) => Number.isFinite(x) && x >= 0 && x <= 80), `工厂代码应居中在画布内: ${xs.join(',')}`)
  assert(xs[0]! < 30, `款号行应居中（x<30），实际 ${xs[0]}`)
  assert(xs[1]! > 10, `工厂代码行应居中（x>10），实际 ${xs[1]}`)
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
  const rows = [...codes?.querySelectorAll(':scope > div') ?? []]
  assert(rows.length === 2, `款号/工厂代码应保持两行 DOM，实际 ${rows.length}`)
  assert(rows[0]?.textContent === '202426103123', `款号错误: ${rows[0]?.textContent}`)
  assert(rows[1]?.textContent === '1227', `工厂代码错误: ${rows[1]?.textContent}`)
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

function testPrepareSvgMapsArabicFont(): void {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>
    <svg xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="20" font-family="ARIAL, Arial, sans-serif">أكريليك</text>
    </svg>
  </body></html>`)
  const svg = document.querySelector('svg') as unknown as SVGSVGElement
  const textEl = svg.querySelector('text') as unknown as SVGTextElement
  prepareSvgForEditablePdf(svg)
  const family = (textEl.getAttribute('font-family') ?? '').replace(/['"]/g, '')
  assert(
    family === PDF_FONT_ARIAL,
    `阿语应映射为 ${PDF_FONT_ARIAL}（避免 svg2pdf 把 Arial 当成 Helvetica），实际 ${family}`,
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
  await testRussianFootnoteWrapsWithinLabel()
  testDownJacketIncluded()
  testMergeSameYCompositionFragments()
  testArabicBidiVisualOrder()
  await testArabicLiveKeepsLogicalOrder()
  await testArabicLivePrepareConvertsEndAnchor()
  await testArabicSurvivesZeroTextLengthCaptured()
  await testArabicSurvivesOverflowCapturedRight()
  await testArabicLiveLongLineStaysVisibleAfterPrepare()
  testFlattenPreservesArabicDir()
  testPrepareSvgStripsRtlDirection()
  testPrepareSvgMapsFzDisplayName()
  testPrepareSvgMapsGoPostScriptName()
  testPrepareSvgMapsFzChineseDisplayNameToPostScript()
  testPrepareSvgMapsArabicFont()
  testPrepareSvgSplitsPercentFromDigits()
  testProductCodesPreserveTwoLines()
  await testProductCodesCenteredInLiveExport()
  testMergeCareAdviceWordFragments()
  await testPercentUsesFzFont()
  console.log('verify:live-export 全部通过')
}

void runAll()
