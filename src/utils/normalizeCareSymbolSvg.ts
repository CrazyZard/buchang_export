/**
 * 将不同 viewBox 的洗护符号 SVG 标准化为统一视口，
 * 使所有符号在相同 CSS 尺寸下视觉大小一致。
 *
 * - 目标 viewBox: 0 0 10 8
 * - 内容等比缩放 + 居中
 * - <defs>（含 <style>）保留在 <g transform> 之外，供 downstream normalizeSvgForExport 处理
 */
export function normalizeCareSymbolSvg(svgMarkup: string, targetW = 10, targetH = 8): string {
  const viewBoxPattern =
    /viewBox\s*=\s*"(?<x>[\d.-]+)\s+(?<y>[\d.-]+)\s+(?<w>[\d.-]+)\s+(?<h>[\d.-]+)"/
  const vbMatch = svgMarkup.match(viewBoxPattern)
  if (!vbMatch) return svgMarkup

  const w = parseFloat(vbMatch.groups!.w)
  const h = parseFloat(vbMatch.groups!.h)
  if (w <= 0 || h <= 0) return svgMarkup

  const scale = Math.min(targetW / w, targetH / h)
  const dx = (targetW - w * scale) / 2
  const dy = (targetH - h * scale) / 2

  // 去掉 <?xml ...?> 前言
  let markup = svgMarkup.replace(/<\?xml[\s\S]*?\?>\s*/g, '')

  // 提取 <svg ...> 和 </svg> 之间的内容
  const svgOpenEnd = markup.indexOf('>', markup.indexOf('<svg'))
  if (svgOpenEnd < 0) return svgMarkup
  const svgTag = markup.slice(0, svgOpenEnd + 1)

  const svgClose = markup.lastIndexOf('</svg>')
  if (svgClose < 0) return svgMarkup
  const body = markup.slice(svgOpenEnd + 1, svgClose)

  // 提取 <defs>...</defs>（含前面的注释/空白）
  const defsRegex = /^((?:\s*<!--[\s\S]*?-->)*\s*)<defs[\s\S]*?<\/defs>/s
  const defsMatch = body.match(defsRegex)
  let prefix = ''
  let inner = body
  if (defsMatch) {
    prefix = defsMatch[0]
    inner = body.slice(defsMatch[0].length)
  }

  const transform = `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${scale.toFixed(4)})`

  const innerCleaned = inner.trim()
  const result =
    svgTag +
    '\n' +
    prefix +
    (prefix ? '\n' : '') +
    `<g transform="${transform}">` +
    '\n' +
    innerCleaned +
    '\n</g>' +
    '\n</svg>'

  return result.replace(viewBoxPattern, `viewBox="0 0 ${targetW} ${targetH}"`)
}
