import { CJK_RE, ARABIC_RE } from './textScriptDetect'

/** svg2pdf 的 font-family 解析器只认 ASCII；仅对纯拉丁残留文本做兜底 */

function pickSafePdfFontFamily(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('arabic') || lower.includes('arial')) {
    return 'Arial'
  }
  return 'Helvetica'
}

function textNeedsComplexShaping(text: string): boolean {
  return CJK_RE.test(text) || ARABIC_RE.test(text)
}

/** 导出前规范化 SVG；已转曲为 path 的文本不受影响 */
export function sanitizeSvgForSvg2pdf(svg: SVGSVGElement): void {
  svg.querySelectorAll<SVGTextElement>('text').forEach((el) => {
    const content = el.textContent ?? ''
    if (textNeedsComplexShaping(content)) {
      el.remove()
      return
    }

    const raw = el.getAttribute('font-family') || ''
    el.setAttribute('font-family', pickSafePdfFontFamily(raw))

    const style = el.getAttribute('style')
    if (!style) return

    const cleaned = style
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part && !part.toLowerCase().startsWith('font-family'))
      .join('; ')

    if (cleaned) {
      el.setAttribute('style', cleaned)
    } else {
      el.removeAttribute('style')
    }
  })

  svg.querySelectorAll('style').forEach((styleEl) => {
    if (styleEl.textContent?.includes('@font-face')) {
      styleEl.remove()
    }
  })
}
