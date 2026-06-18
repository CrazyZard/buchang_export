import { LIVE_EXPORT_SINGLE_TEXT_CLASS } from './flattenCompositionBlocksForLive'

const FLATTEN_SELECTORS = [
  '.composition-token',
  '.composition-material-unit',
  '.composition-footnote',
  '.label-source-advice',
  '.care-advice-tail',
  '.product-codes',
  '.down-fill-grid-cell',
].join(',')

function shouldFlattenElement(el: HTMLElement): boolean {
  if (
    el.classList.contains(LIVE_EXPORT_SINGLE_TEXT_CLASS) ||
    el.querySelector(`.${LIVE_EXPORT_SINGLE_TEXT_CLASS}`)
  ) {
    return false
  }
  if (el.closest(`.${LIVE_EXPORT_SINGLE_TEXT_CLASS}`)) return false
  if (el.classList.contains('care-advice-tail')) return false
  if (el.querySelector('.label-latin, .composition-percent')) return true
  return Boolean(el.querySelector('*'))
}

function normalizeFlattenedText(text: string, preserveNewlines = false): string {
  if (preserveNewlines) {
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t]+/g, ' ').replace(/\s+$/, ''))
      .join('\n')
      .replace(/^\s+/, '')
  }
  return text.replace(/\s+/g, ' ').trim()
}

/** 压平 head/body 内的 label-latin、composition-percent，保留分列 DOM */
function flattenNestedLatinSpans(el: HTMLElement): void {
  if (!el.querySelector('.label-latin, .composition-percent')) return
  el.textContent = normalizeFlattenedText(el.textContent ?? '')
}

/** 阿语：整段压成纯文本，走 arabic-rtl 转曲 */
function flattenArabicToken(el: HTMLElement): void {
  el.textContent = normalizeFlattenedText(el.textContent ?? '')
}

/** LTR grid：head/body 分列压平，与 ltr-grid-head / ltr-grid-body 转曲对应 */
function flattenLtrGridToken(el: HTMLElement): void {
  const head = el.querySelector<HTMLElement>('.composition-material-head')
  const body = el.querySelector<HTMLElement>('.composition-material-body')
  if (!head || !body) {
    el.textContent = normalizeFlattenedText(el.textContent ?? '')
    return
  }
  flattenNestedLatinSpans(head)
  flattenNestedLatinSpans(body)
}

/** inline-wrap 多材质：空格拼接 */
function flattenInlineWrapToken(el: HTMLElement): void {
  const units = el.querySelectorAll<HTMLElement>('.composition-material-unit')
  el.textContent = [...units]
    .map((unit) => (unit.textContent ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

/** 中文源稿等：压平行内 span */
function flattenGenericToken(el: HTMLElement): void {
  el.textContent = normalizeFlattenedText(el.textContent ?? '')
}

/** 款号/工厂代码：保留两行（子 div 用换行拼接，避免 textContent 直接粘连） */
function flattenProductCodes(el: HTMLElement): void {
  const lines = [...el.children]
    .map((child) => normalizeFlattenedText(child.textContent ?? ''))
    .filter((line) => line.length > 0)
  el.textContent = lines.join('\n')
}

function flattenCompositionToken(el: HTMLElement): void {
  if (el.closest('.rtl')) {
    flattenArabicToken(el)
    return
  }

  const units = el.querySelectorAll<HTMLElement>('.composition-material-unit')
  if (units.length > 1) {
    flattenInlineWrapToken(el)
    return
  }

  if (
    el.querySelector('.composition-material-head') &&
    el.querySelector('.composition-material-body')
  ) {
    flattenLtrGridToken(el)
    return
  }

  flattenGenericToken(el)
}

/**
 * 导出前把行内嵌套 span 压成纯文本。
 * 各块策略独立：阿语整段 / grid 分列 / inline-wrap 拼接 / 中文源稿压平。
 */
export function flattenInlineTextSpans(root: HTMLElement): () => void {
  const snapshots: Array<{ el: HTMLElement; html: string }> = []
  const flattened = new Set<HTMLElement>()

  const flattenEl = (el: HTMLElement) => {
    if (flattened.has(el)) return
    flattened.add(el)
    snapshots.push({ el, html: el.innerHTML })

    if (el.classList.contains('composition-token')) {
      flattenCompositionToken(el)
      return
    }

    if (el.classList.contains('product-codes')) {
      flattenProductCodes(el)
      return
    }

    const preserveNewlines =
      el.classList.contains('label-source-advice') ||
      el.classList.contains('label-source-advice-lines')
    el.textContent = normalizeFlattenedText(el.textContent ?? '', preserveNewlines)
  }

  root.querySelectorAll<HTMLElement>('.composition-line').forEach((line) => {
    line.querySelectorAll<HTMLElement>('.composition-token').forEach((token) => {
      if (shouldFlattenElement(token)) flattenEl(token)
    })
  })

  root.querySelectorAll<HTMLElement>(FLATTEN_SELECTORS).forEach((el) => {
    if (!shouldFlattenElement(el)) return
    flattenEl(el)
  })

  return () => {
    snapshots.forEach(({ el, html }) => {
      el.innerHTML = html
    })
  }
}
