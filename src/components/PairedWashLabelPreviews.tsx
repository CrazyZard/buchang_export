import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { ScaledLabelPreview } from './ScaledLabelPreview'
import { useTemplate } from '../context/TemplateContext'
import { formatLabelSizeMm, LABEL_WIDTH_MM, pxToMm, type PreviewLabelHeights } from '../utils/labelMeasure'

interface PairedWashLabelPreviewsProps {
  scale: number
  source: ReactNode
  translated: ReactNode
  onHeightsChange?: (heights: PreviewLabelHeights) => void
}

/** 中文与翻译洗唛高度按较长一侧对齐，并回传实测高度 */
export function PairedWashLabelPreviews({
  scale,
  source,
  translated,
  onHeightsChange,
}: PairedWashLabelPreviewsProps) {
  const template = useTemplate()
  const labelWidth = template.layout.labelWidthMm ?? LABEL_WIDTH_MM
  const sourceSlotRef = useRef<HTMLDivElement>(null)
  const translatedSlotRef = useRef<HTMLDivElement>(null)
  const onHeightsChangeRef = useRef(onHeightsChange)
  onHeightsChangeRef.current = onHeightsChange

  useLayoutEffect(() => {
    const syncHeights = () => {
      const sourceLabel = sourceSlotRef.current?.querySelector(
        '.wash-label',
      ) as HTMLElement | null
      const translatedLabel = translatedSlotRef.current?.querySelector(
        '.wash-label',
      ) as HTMLElement | null
      if (!sourceLabel || !translatedLabel) return

      sourceLabel.style.minHeight = ''
      translatedLabel.style.minHeight = ''

      const sourcePx = sourceLabel.offsetHeight
      const translatedPx = translatedLabel.offsetHeight
      const maxPx = Math.max(sourcePx, translatedPx)
      if (maxPx <= 0) return

      const height = `${maxPx}px`
      sourceLabel.style.minHeight = height
      translatedLabel.style.minHeight = height

      onHeightsChangeRef.current?.({
        sourceMm: pxToMm(sourcePx),
        translatedMm: pxToMm(translatedPx),
        pairedMm: pxToMm(maxPx),
      })

      updateBadge(sourceSlotRef.current, sourceLabel.offsetHeight, labelWidth)
      updateBadge(translatedSlotRef.current, translatedLabel.offsetHeight, labelWidth)
    }

    syncHeights()

    const observer = new ResizeObserver(syncHeights)
    const sourceSlot = sourceSlotRef.current
    const translatedSlot = translatedSlotRef.current
    if (sourceSlot) observer.observe(sourceSlot)
    if (translatedSlot) observer.observe(translatedSlot)

    return () => observer.disconnect()
  }, [source, translated])

  return (
    <>
      <div
        className="workspace-preview workspace-preview--source"
        ref={sourceSlotRef}
      >
        <ScaledLabelPreview scale={scale}>{source}</ScaledLabelPreview>
        <span className="preview-size-badge" data-preview-size="source" />
      </div>
      <div
        className="workspace-preview workspace-preview--translated"
        ref={translatedSlotRef}
      >
        <ScaledLabelPreview scale={scale}>{translated}</ScaledLabelPreview>
        <span className="preview-size-badge" data-preview-size="translated" />
      </div>
    </>
  )
}

function updateBadge(slot: HTMLElement | null, heightPx: number, labelWidthMm: number) {
  if (!slot || heightPx <= 0) return
  const badge = slot.querySelector('.preview-size-badge') as HTMLElement | null
  if (!badge) return
  badge.textContent = formatLabelSizeMm(labelWidthMm, pxToMm(heightPx))
}
