import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { ScaledLabelPreview } from './ScaledLabelPreview'
import { WashLabelPreview } from './WashLabelPreview'
import type { BatchLabelItem, Dictionary } from '../types'
import { formatLabelSizeMm, LABEL_WIDTH_MM, pxToMm } from '../utils/labelMeasure'

interface PairedBatchLabelPreviewsProps {
  items: BatchLabelItem[]
  scale: number
  dictionary: Dictionary
  outputLanguages: string[]
}

export function PairedBatchLabelPreviews({
  items,
  scale,
  dictionary,
  outputLanguages,
}: PairedBatchLabelPreviewsProps) {
  const sourceScrollRef = useRef<HTMLDivElement>(null)
  const translatedScrollRef = useRef<HTMLDivElement>(null)
  const syncingScrollRef = useRef(false)
  const syncFrameRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const sourceCol = sourceScrollRef.current
    const translatedCol = translatedScrollRef.current
    if (!sourceCol || !translatedCol) return

    const syncScroll = (from: HTMLElement, to: HTMLElement) => {
      if (syncingScrollRef.current) return
      syncingScrollRef.current = true
      to.scrollTop = from.scrollTop
      requestAnimationFrame(() => {
        syncingScrollRef.current = false
      })
    }

    const onSourceScroll = () => syncScroll(sourceCol, translatedCol)
    const onTranslatedScroll = () => syncScroll(translatedCol, sourceCol)
    sourceCol.addEventListener('scroll', onSourceScroll, { passive: true })
    translatedCol.addEventListener('scroll', onTranslatedScroll, { passive: true })

    const syncRowHeights = () => {
      const sourceRows = sourceCol.querySelectorAll<HTMLElement>('.batch-preview-item')
      const translatedRows = translatedCol.querySelectorAll<HTMLElement>('.batch-preview-item')

      sourceRows.forEach((sourceRow, index) => {
        const translatedRow = translatedRows[index]
        if (!translatedRow) return

        sourceRow.style.minHeight = ''
        translatedRow.style.minHeight = ''

        const maxRowPx = Math.max(sourceRow.offsetHeight, translatedRow.offsetHeight)
        if (maxRowPx > 0) {
          const rowHeight = `${maxRowPx}px`
          if (sourceRow.style.minHeight !== rowHeight) {
            sourceRow.style.minHeight = rowHeight
          }
          if (translatedRow.style.minHeight !== rowHeight) {
            translatedRow.style.minHeight = rowHeight
          }
        }

        const pairedMm = pxToMm(maxRowPx)
        const sizeText = formatLabelSizeMm(LABEL_WIDTH_MM, pairedMm)
        const sourceSize = sourceRow.querySelector('.batch-preview-item-size')
        const translatedSize = translatedRow.querySelector('.batch-preview-item-size')
        if (sourceSize) sourceSize.textContent = sizeText
        if (translatedSize) translatedSize.textContent = sizeText
      })
    }

    const scheduleRowHeightSync = () => {
      if (syncFrameRef.current !== null) return
      syncFrameRef.current = window.requestAnimationFrame(() => {
        syncFrameRef.current = null
        syncRowHeights()
      })
    }

    syncRowHeights()

    const observer = new ResizeObserver(scheduleRowHeightSync)
    const targets = [
      ...sourceCol.querySelectorAll('.batch-preview-item'),
      ...translatedCol.querySelectorAll('.batch-preview-item'),
    ]
    targets.forEach((target) => observer.observe(target))

    return () => {
      sourceCol.removeEventListener('scroll', onSourceScroll)
      translatedCol.removeEventListener('scroll', onTranslatedScroll)
      observer.disconnect()
      if (syncFrameRef.current !== null) {
        window.cancelAnimationFrame(syncFrameRef.current)
        syncFrameRef.current = null
      }
    }
  }, [items, scale, dictionary, outputLanguages])

  return (
    <>
      <div
        ref={sourceScrollRef}
        className="workspace-preview workspace-preview--source workspace-preview--batch"
      >
        <div className="batch-preview-list">
          {items.map((item) => (
            <BatchPreviewRow
              key={item.id}
              item={item}
              scale={scale}
              label={
                <WashLabelPreview data={item.labelData} dictionary={dictionary} mode="source" />
              }
            />
          ))}
        </div>
      </div>
      <div
        ref={translatedScrollRef}
        className="workspace-preview workspace-preview--translated workspace-preview--batch"
      >
        <div className="batch-preview-list">
          {items.map((item) => (
            <BatchPreviewRow
              key={item.id}
              item={item}
              scale={scale}
              label={
                <WashLabelPreview
                  data={item.labelData}
                  dictionary={dictionary}
                  mode="translated"
                  selectedLanguages={outputLanguages}
                />
              }
            />
          ))}
        </div>
      </div>
    </>
  )
}

function BatchPreviewRow({
  item,
  scale,
  label,
}: {
  item: BatchLabelItem
  scale: number
  label: ReactNode
}) {
  return (
    <div className="batch-preview-item">
      <div className="batch-preview-item-head">
        <span className="batch-preview-item-index">#{item.index}</span>
        {item.title ? <span className="batch-preview-item-title">{item.title}</span> : null}
        {item.labelData.productCode1 ? (
          <span className="batch-preview-item-code">{item.labelData.productCode1}</span>
        ) : null}
      </div>
      <ScaledLabelPreview scale={scale}>{label}</ScaledLabelPreview>
      <span className="batch-preview-item-size preview-size-badge" />
    </div>
  )
}
