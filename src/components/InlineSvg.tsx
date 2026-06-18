import { normalizeSvgForExport } from '../utils/normalizeSvgForExport'

interface InlineSvgProps {
  markup: string
  className?: string
  ariaLabel?: string
}

function injectClass(markup: string, className?: string): string {
  if (!className) return markup
  return markup.replace(/<svg\b/, `<svg class="${className}"`)
}

function prepareMarkup(markup: string, className?: string): string {
  return injectClass(normalizeSvgForExport(markup), className)
}

/** 内联 SVG（同步渲染），便于 dom-to-svg 导出为矢量路径 */
export function InlineSvg({ markup, className, ariaLabel }: InlineSvgProps) {
  return (
    <span
      className="inline-svg-host"
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      dangerouslySetInnerHTML={{ __html: prepareMarkup(markup, className) }}
    />
  )
}
