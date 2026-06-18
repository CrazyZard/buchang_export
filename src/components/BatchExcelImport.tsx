import { useRef, useState } from 'react'
import type { BatchLabelItem } from '../types'
import { exportBatchExcelTemplate, parseBatchExcelFile } from '../utils/parseBatchExcel'
import type { LabelData } from '../types'

interface BatchExcelImportProps {
  baseLabelData: LabelData
  batchCount: number
  onImport: (items: BatchLabelItem[]) => void
  onClear: () => void
}

export function BatchExcelImport({
  baseLabelData,
  batchCount,
  onImport,
  onClear,
}: BatchExcelImportProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const handleFile = async (file: File) => {
    setImporting(true)
    try {
      const items = await parseBatchExcelFile(file, baseLabelData)
      onImport(items)
    } catch (err) {
      alert(err instanceof Error ? err.message : '批量 Excel 解析失败')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="batch-excel-import">
      <div className="batch-excel-import-head">
        <span className="batch-excel-import-title">批量 Excel 导入</span>
        {batchCount > 0 ? (
          <span className="batch-excel-import-meta">已加载 {batchCount} 条，预览区从上到下排列</span>
        ) : (
          <span className="batch-excel-import-meta">上传表格后批量解析并在右侧预览</span>
        )}
      </div>
      <div className="batch-excel-import-actions">
        <button type="button" className="btn-secondary" onClick={() => exportBatchExcelTemplate()}>
          下载批量模板
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
        >
          {importing ? '解析中…' : '上传批量 Excel'}
        </button>
        {batchCount > 0 ? (
          <button type="button" className="btn-link" onClick={onClear}>
            清空批量预览
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
