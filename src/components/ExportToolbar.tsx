import { useRef, useState, type RefObject } from 'react'
import type { Dictionary, LabelData } from '../types'
import type { TemplateId } from '../templates'
import { exportLabelsPdf, resolvePdfFilename, type ExportPdfTextMode } from '../utils/exportPdf'
import {
  createProjectSnapshot,
  exportProjectSnapshot,
  exportProjectToExcel,
  importProjectFile,
} from '../utils/projectData'

interface ExportToolbarProps {
  templateId: TemplateId
  labelData: LabelData
  batchCount: number
  dictionary: Dictionary
  selectedLanguages: string[]
  sourceExportRef: RefObject<HTMLElement | null>
  translatedExportRef: RefObject<HTMLElement | null>
  onImportProject: (payload: {
    labelData: LabelData
    dictionary: Dictionary
    selectedLanguages: string[]
  }) => void
}

export function ExportToolbar({
  templateId,
  labelData,
  batchCount,
  dictionary,
  selectedLanguages,
  sourceExportRef,
  translatedExportRef,
  onImportProject,
}: ExportToolbarProps) {
  const importRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)

  const handleExportPdf = async (textMode: ExportPdfTextMode = 'outline') => {
    if (!sourceExportRef.current || !translatedExportRef.current) return
    if (selectedLanguages.length === 0) {
      alert('请至少选择一种出稿语言')
      return
    }

    setExporting(true)
    try {
      await exportLabelsPdf(
        sourceExportRef.current,
        translatedExportRef.current,
        resolvePdfFilename(batchCount, textMode),
        { textMode },
      )
    } catch (err) {
      const message =
        err instanceof Error
          ? err.cause instanceof Error
            ? `${err.message}：${err.cause.message}`
            : err.message
          : 'PDF 导出失败'
      alert(message)
      console.error('PDF 导出失败', err)
    } finally {
      setExporting(false)
    }
  }

  const handleExportProject = () => {
    const snapshot = createProjectSnapshot(labelData, selectedLanguages, dictionary, templateId)
    exportProjectToExcel(snapshot, templateId)
  }

  const handleExportProjectJson = () => {
    exportProjectSnapshot(
      createProjectSnapshot(labelData, selectedLanguages, dictionary, templateId),
    )
  }

  const handleImportProject = async (file: File) => {
    try {
      const snapshot = await importProjectFile(file, dictionary)
      onImportProject({
        labelData: snapshot.labelData,
        dictionary: snapshot.dictionary,
        selectedLanguages: snapshot.selectedLanguages.filter((lang) =>
          snapshot.dictionary.languages.includes(lang),
        ),
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : '项目导入失败')
    }
  }

  return (
    <div className="export-toolbar">
      <div className="export-info">
        <span className="dict-label">保存与导出</span>
        <span className="dict-meta">
          PDF 矢量出稿，左中文右翻译、25mm 宽
          {batchCount > 1 ? `；批量共 ${batchCount} 条合并为一个 PDF` : ''}
          ；「AI 可编辑 PDF」保留文字，成分区与洗涤建议各合并为一个文本框（换行排版）
          ；项目可导出/导入 Excel（亦兼容 JSON）
        </span>
      </div>
      <div className="export-actions">
        <button type="button" className="btn-secondary" onClick={handleExportProject}>
          导出 Excel
        </button>
        <button type="button" className="btn-secondary" onClick={handleExportProjectJson}>
          导出 JSON
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => importRef.current?.click()}
        >
          导入项目
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleExportPdf('live')}
          disabled={exporting || selectedLanguages.length === 0}
        >
          {exporting ? '导出中…' : 'AI 可编辑 PDF'}
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".xlsx,.xls,.json,.buchang.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImportProject(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
