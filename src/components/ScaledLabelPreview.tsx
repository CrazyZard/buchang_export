import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface ScaledLabelPreviewProps {
  scale: number
  children: ReactNode
}

/** scale 放大预览，同时为布局预留正确宽高，避免与相邻列重叠 */
export function ScaledLabelPreview({ scale, children }: ScaledLabelPreviewProps) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = innerRef.current
    if (!element) return

    const updateSize = () => {
      setSize({
        width: element.offsetWidth * scale,
        height: element.offsetHeight * scale,
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [scale, children])

  return (
    <div
      className="preview-scale-slot"
      style={{
        width: size.width || undefined,
        height: size.height || undefined,
      }}
    >
      <div
        ref={innerRef}
        className="preview-scale-inner"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  )
}
