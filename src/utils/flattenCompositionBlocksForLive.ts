/** 可编辑 PDF：成分区 / 洗涤建议合并为单一多行文本，AI 里一个文本框一块 */
export const LIVE_EXPORT_SINGLE_TEXT_CLASS = 'live-export-single-text'

function normalizeInlineSpaces(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/\s+$/, '')
}

function normalizeTokenText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function collectCompositionTokenText(token: HTMLElement): string {
  const head = token.querySelector<HTMLElement>('.composition-material-head')
  const body = token.querySelector<HTMLElement>('.composition-material-body')
  if (head && body) {
    const headText = normalizeTokenText(head.textContent ?? '')
    const bodyText = normalizeTokenText(body.textContent ?? '')
    if (!headText) return bodyText
    if (!bodyText) return headText
    const needsSpace = !headText.endsWith(' ') && !bodyText.startsWith(' ')
    return needsSpace ? `${headText} ${bodyText}` : `${headText}${bodyText}`
  }

  const units = token.querySelectorAll<HTMLElement>('.composition-material-unit')
  if (units.length > 1) {
    return [...units]
      .map((unit) => normalizeTokenText(unit.textContent ?? ''))
      .filter(Boolean)
      .join(' ')
  }

  return normalizeTokenText(token.textContent ?? '')
}

function collectCompositionLine(line: HTMLElement): string {
  const parts: string[] = []

  const partLabel = line.querySelector<HTMLElement>('.part-label')
  if (partLabel && !partLabel.classList.contains('part-label--continuation')) {
    const label = normalizeTokenText(partLabel.textContent ?? '')
    if (label) parts.push(label)
  }

  const token = line.querySelector<HTMLElement>('.composition-token')
  if (token) {
    const tokenText = collectCompositionTokenText(token)
    if (tokenText) parts.push(tokenText)
  }

  return parts.join('')
}

function isHtmlElement(node: ChildNode): node is HTMLElement {
  return node.nodeType === 1
}

function walkCompositionBody(el: HTMLElement, lines: string[]): void {
  for (const child of [...el.children]) {
    if (!isHtmlElement(child)) continue

    if (child.classList.contains('composition-line')) {
      const line = collectCompositionLine(child)
      if (line) lines.push(line)
      continue
    }

    if (
      child.classList.contains('composition-section-title') ||
      child.classList.contains('composition-footnote')
    ) {
      const line = normalizeInlineSpaces(child.textContent ?? '')
      if (line) lines.push(line)
      continue
    }

    if (child.classList.contains('composition-block')) {
      walkCompositionBody(child, lines)
    }
  }
}

/** legacy 网格 DOM 采集 */
export function collectCompositionBlockText(el: HTMLElement): string {
  const lines: string[] = []
  walkCompositionBody(el, lines)
  return lines.join('\n')
}

/** 优先读取 data-plain-text / live-export-single-text（预览与导出 DOM 一致） */
function collectPlainBlockText(el: HTMLElement): string {
  const host =
    el.classList.contains('composition-plain') ||
    el.classList.contains(LIVE_EXPORT_SINGLE_TEXT_CLASS)
      ? el
      : el.querySelector<HTMLElement>('.composition-plain, .live-export-single-text')

  const fromAttr = host?.getAttribute('data-plain-text')?.trim()
  if (fromAttr) return fromAttr

  const existing = el.querySelector<HTMLElement>(`:scope > .${LIVE_EXPORT_SINGLE_TEXT_CLASS}`)
  if (existing?.textContent?.trim()) {
    return existing.textContent
  }
  return ''
}

/** 优先读取 live-export-single-text（预览与导出 DOM 一致） */
function collectBodyPlainText(el: HTMLElement): string {
  const fromBlock = collectPlainBlockText(el)
  if (fromBlock) return fromBlock
  return collectCompositionBlockText(el)
}

export function collectCareAdviceText(el: HTMLElement): string {
  if (el.classList.contains(LIVE_EXPORT_SINGLE_TEXT_CLASS)) {
    return el.textContent ?? ''
  }

  const existing = el.querySelector<HTMLElement>(`:scope > .${LIVE_EXPORT_SINGLE_TEXT_CLASS}`)
  if (existing?.textContent?.trim()) {
    return existing.textContent
  }

  if (el.classList.contains('label-source-advice-lines')) {
    return [...el.querySelectorAll<HTMLElement>('.label-source-advice-line')]
      .map((line) => normalizeInlineSpaces(line.textContent ?? ''))
      .filter(Boolean)
      .join('\n')
  }

  return (el.textContent ?? '')
    .split(/\r?\n/)
    .map(normalizeInlineSpaces)
    .filter(Boolean)
    .join('\n')
}

function replaceWithSingleTextDiv(el: HTMLElement, text: string, extraClass = ''): void {
  const wrapper = el.ownerDocument.createElement('div')
  wrapper.className = `${LIVE_EXPORT_SINGLE_TEXT_CLASS}${extraClass ? ` ${extraClass}` : ''}`.trim()
  const hasExplicitBreaks = text.includes('\n')
  wrapper.style.whiteSpace = hasExplicitBreaks ? 'pre-wrap' : 'normal'
  wrapper.style.wordBreak = 'normal'
  wrapper.textContent = text
  el.replaceChildren(wrapper)
}

/**
 * 将成分正文、洗涤建议压成单段多行纯文本（仅 live 导出）。
 * 预览 DOM 在 restore 时还原。
 */
export function flattenCompositionBlocksForLive(root: HTMLElement): () => void {
  const snapshots: Array<{ el: HTMLElement; html: string }> = []

  const flatten = (el: HTMLElement, text: string, extraClass = '') => {
    if (!text) return
    const child = el.firstElementChild as HTMLElement | null
    if (
      child?.classList.contains(LIVE_EXPORT_SINGLE_TEXT_CLASS) &&
      extraClass.split(' ').every((cls) => cls && child.classList.contains(cls)) &&
      child.textContent === text
    ) {
      return
    }
    snapshots.push({ el, html: el.innerHTML })
    replaceWithSingleTextDiv(el, text, extraClass)
  }

  root
    .querySelectorAll<HTMLElement>(
      '.wash-label--source .label-section--composition .label-source-body',
    )
    .forEach((el) => flatten(el, collectBodyPlainText(el), 'composition-plain'))

  root
    .querySelectorAll<HTMLElement>(
      '.wash-label--translated .lang-block .label-translated-body',
    )
    .forEach((el) => flatten(el, collectBodyPlainText(el), 'composition-plain'))

  root
    .querySelectorAll<HTMLElement>(
      '.wash-label--source .label-section--care .label-source-advice, .wash-label--source .label-section--care .label-source-advice-lines',
    )
    .forEach((el) => flatten(el, collectCareAdviceText(el), 'care-advice-live'))

  return () => {
    snapshots.forEach(({ el, html }) => {
      el.innerHTML = html
    })
  }
}
