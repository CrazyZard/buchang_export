import { isArabicExportText } from './arabicTextExport'
import { convertTextElementToLive } from './exportTextLiveRender'
import { textContainsCjkOrPunct } from './textScriptDetect'
import type { FontRole } from './svgTextToPathsUtils'

/** 将 SVG 文本写成可编辑 tspan（文字 + SVG），不走转曲 / groupTspansByLine */
export async function convertSvgTextToLiveText(svg: SVGSVGElement): Promise<void> {
  for (const textEl of [...svg.querySelectorAll('text')]) {
    if (!textEl.isConnected) continue
    const content = textEl.textContent ?? ''
    const role: FontRole = isArabicExportText(content)
      ? 'arabic'
      : textContainsCjkOrPunct(content)
        ? 'zh'
        : 'latin'
    try {
      await convertTextElementToLive(textEl, role)
    } catch (error) {
      console.warn('可编辑文字处理失败', { content: content.slice(0, 80) }, error)
      throw error instanceof Error
        ? error
        : new Error('可编辑文字处理失败')
    }
  }
}
