import { isArabicExportText } from './arabicTextExport'
import { prepareSvgTextForPathConvert } from './exportTextPrepare'
import { renderTextRunsByBlock } from './exportTextRender'
import { textContainsCjkOrPunct } from './textScriptDetect'
import {
  createReplacementGroup,
  parseColor,
  parseFontSize,
  pickFontRole,
  preloadExportFonts,
  removeRasterImages,
  resetExportFontCache,
  type FontRole,
} from './svgTextToPathsUtils'

export { preloadExportFonts, removeRasterImages, prepareSvgTextForPathConvert, resetExportFontCache }

async function convertTextElement(
  textEl: SVGTextElement,
  forceRole?: FontRole,
): Promise<boolean> {
  const ownerDocument = textEl.ownerDocument
  if (!ownerDocument) return false

  const fontFamily = textEl.getAttribute('font-family') || ''
  const fullText = textEl.textContent ?? ''
  const role =
    forceRole ?? (isArabicExportText(fullText) ? 'arabic' : pickFontRole(fontFamily, fullText))

  const fontSize = parseFontSize(textEl.getAttribute('font-size'))
  const fill = parseColor(textEl.getAttribute('fill'))
  const group = createReplacementGroup(ownerDocument, textEl)

  const rendered = await renderTextRunsByBlock(
    ownerDocument,
    group,
    textEl,
    fontSize,
    fill,
    role,
  )
  if (!rendered) return false
  textEl.replaceWith(group)
  return true
}

/** 将 SVG 文本转为 path；未转曲的文本若交给 svg2pdf+Helvetica 会中文乱码 */
export async function convertSvgTextToPaths(svg: SVGSVGElement): Promise<void> {
  prepareSvgTextForPathConvert(svg)

  for (const textEl of [...svg.querySelectorAll('text')]) {
    try {
      await convertTextElement(textEl)
    } catch (error) {
      console.warn('单条文字转曲失败', error)
    }
  }

  for (const textEl of [...svg.querySelectorAll('text')]) {
    const content = textEl.textContent ?? ''
    const role: FontRole = isArabicExportText(content)
      ? 'arabic'
      : textContainsCjkOrPunct(content)
        ? 'zh'
        : 'latin'
    try {
      await convertTextElement(textEl, role)
    } catch (error) {
      console.warn('补转文字失败', error)
    }
  }

  const stillRemaining = [...svg.querySelectorAll('text')]
  if (stillRemaining.length > 0) {
    console.warn(`仍有 ${stillRemaining.length} 处文字未能转曲，PDF 可能出现乱码`)
  }
}
