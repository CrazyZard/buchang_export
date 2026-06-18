import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

const DEFAULT_MAX_BODY_HEIGHT_MM = 78

function mmToPx(mm: number) {
  return (mm / 25.4) * 96
}

interface AutoFitLabelProps {
  children: ReactNode
  className: string
  style?: CSSProperties
  baseFontPt: number
  minFontPt: number
  maxHeightMm?: number
  /** PDF 导出：仅适配宽度，不限制高度、不裁剪溢出 */
  forExport?: boolean
}

/** 根据 25mm 宽内换行与内容高度自动缩小字号 */
export function AutoFitLabel({
  children,
  className,
  style,
  baseFontPt,
  minFontPt,
  maxHeightMm,
  forExport = false,
}: AutoFitLabelProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [fontSize, setFontSize] = useState(baseFontPt)
  const heightLimitMm = forExport ? undefined : (maxHeightMm ?? DEFAULT_MAX_BODY_HEIGHT_MM)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const step = 0.25

    const fit = () => {
      let size = baseFontPt
      element.style.fontSize = `${size}pt`
      element.style.overflow = forExport ? 'visible' : ''
      element.style.overflowX = forExport ? 'visible' : 'hidden'
      element.style.overflowY = forExport ? 'visible' : ''

      const maxWidth = element.clientWidth
      if (maxWidth <= 0) return

      while (size > minFontPt) {
        const overflowsX = element.scrollWidth > maxWidth
        const overflowsY =
          heightLimitMm != null && element.scrollHeight > mmToPx(heightLimitMm) + 1
        if (!overflowsX && !overflowsY) break
        size = Math.max(minFontPt, size - step)
        element.style.fontSize = `${size}pt`
      }

      setFontSize(size)
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [children, baseFontPt, minFontPt, heightLimitMm, forExport])

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style, fontSize: `${fontSize}pt` }}
    >
      {children}
    </div>
  )
}

export const LABEL_FONT = {
  /** 中文预览基准字号（成分区 4.5pt；洗涤区在 CSS 中放大至 5pt） */
  chinese: { basePt: 4.5, minPt: 3.5 },
  /** 巴拉中文：全文 5pt，不随内容缩字 */
  balabalaChinese: { basePt: 5, minPt: 5 },
  /** 翻译预览基准字号 4pt */
  latin: { basePt: 4, minPt: 3 },
  arabic: { basePt: 4, minPt: 3 },
} as const
