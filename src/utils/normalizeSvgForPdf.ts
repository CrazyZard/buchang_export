/** dom-to-svg 的 viewBox 常带偏移；svg2pdf 按 viewBox 缩放，偏移会导致内容错位 */
export function normalizeSvgRootForPdf(svg: SVGSVGElement): void {
  const parseDim = (raw: string | null): number => {
    if (!raw) return 0
    const parsed = parseFloat(raw.replace(/px|pt/gi, ''))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }

  let width = parseDim(svg.getAttribute('width'))
  let height = parseDim(svg.getAttribute('height'))

  const viewBoxRaw = svg.getAttribute('viewBox')
  if (!viewBoxRaw) return

  const parts = viewBoxRaw.split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return

  const [minX, minY, vbWidth, vbHeight] = parts
  if (minX !== 0 || minY !== 0) {
    const wrapper = svg.ownerDocument?.createElementNS('http://www.w3.org/2000/svg', 'g')
    if (!wrapper) return
    wrapper.setAttribute('transform', `translate(${-minX}, ${-minY})`)
    while (svg.firstChild) {
      wrapper.appendChild(svg.firstChild)
    }
    svg.appendChild(wrapper)
  }

  if (!width) width = vbWidth
  if (!height) height = vbHeight

  svg.setAttribute('viewBox', `0 0 ${vbWidth} ${vbHeight}`)
  if (width > 0) svg.setAttribute('width', String(width))
  if (height > 0) svg.setAttribute('height', String(height))
}
