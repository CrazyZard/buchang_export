import { useEffect, useMemo, useRef, useState } from 'react'
import { TemplateProvider } from '../context/TemplateContext'
import { ExportToolbar } from '../components/ExportToolbar'
import { LabelWorkspace } from '../components/LabelWorkspace'
import { LanguageSelector } from '../components/LanguageSelector'
import { WashLabelPreview } from '../components/WashLabelPreview'
import type { BatchLabelItem, CompositionPart, Dictionary, LabelData } from '../types'
import { getTemplate, type TemplateId } from '../templates'
import { defaultDictionary } from '../utils/defaultDictionary'
import { defaultSelectedLanguages, normalizeComposition } from '../utils/labelDefaults'
import { applyCompositionPaste } from '../utils/parseCompositionPaste'
import { loadDictionaryFromUrl, resolveOutputLanguages } from '../utils/dictionary'

interface EditorPageProps {
  templateId: TemplateId
  onBack: () => void
}

export function EditorPage({ templateId, onBack }: EditorPageProps) {
  const template = getTemplate(templateId)
  const [labelData, setLabelData] = useState<LabelData>(() => template.createDefaultLabelData())
  const [batchItems, setBatchItems] = useState<BatchLabelItem[]>([])
  const [dictionary, setDictionary] = useState<Dictionary>(defaultDictionary)
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(defaultSelectedLanguages)
  const [scale, setScale] = useState(2)

  const sourceExportRef = useRef<HTMLDivElement>(null)
  const translatedExportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLabelData(template.createDefaultLabelData())
    setBatchItems([])
    setSelectedLanguages(defaultSelectedLanguages)

    loadDictionaryFromUrl(template.dictionaryUrl)
      .then((parsed) => {
        setDictionary(parsed)
        setSelectedLanguages(parsed.languages)
      })
      .catch((err) => {
        console.warn(err)
      })
  }, [template])

  const materialSuggestions = useMemo(
    () => Object.keys(dictionary.entries).filter((k) => !k.includes('，') && k.length <= 8),
    [dictionary],
  )

  const outputLanguages = useMemo(
    () => resolveOutputLanguages(dictionary, selectedLanguages),
    [selectedLanguages, dictionary],
  )

  /** 批量模式下洗涤区块需同步到各条预览，否则左侧编辑看起来「无反应」 */
  const BATCH_WASH_SYNC_FIELDS: (keyof LabelData)[] = ['careSymbols', 'dryCleanNote', 'careAdvice']

  const updateField = <K extends keyof LabelData>(key: K, value: LabelData[K]) => {
    setLabelData((prev) => ({ ...prev, [key]: value }))
    if (BATCH_WASH_SYNC_FIELDS.includes(key)) {
      setBatchItems((prev) =>
        prev.length === 0
          ? prev
          : prev.map((item) => ({
              ...item,
              labelData: { ...item.labelData, [key]: value },
            })),
      )
    }
  }

  const updateComposition = (part: CompositionPart, items: LabelData['composition'][CompositionPart]) => {
    setLabelData((prev) => ({
      ...prev,
      composition: { ...prev.composition, [part]: items },
    }))
  }

  const handleCompositionPaste = (text: string) => {
    setLabelData((prev) => applyCompositionPaste(prev, text))
  }

  const handleBatchImport = (items: BatchLabelItem[]) => {
    setBatchItems(items)
    if (items.length > 0) {
      const first = items[0].labelData
      setLabelData((prev) => ({
        ...prev,
        careSymbols: [...first.careSymbols],
        dryCleanNote: first.dryCleanNote,
        careAdvice: first.careAdvice,
      }))
    }
  }

  const handleBatchClear = () => {
    setBatchItems([])
  }

  const handleProjectImport = (payload: {
    labelData: LabelData
    dictionary: Dictionary
    selectedLanguages: string[]
  }) => {
    setLabelData({
      ...payload.labelData,
      composition: normalizeComposition(payload.labelData.composition),
    })
    setDictionary(payload.dictionary)
    setSelectedLanguages(
      payload.selectedLanguages.length > 0
        ? payload.selectedLanguages
        : payload.dictionary.languages,
    )
  }

  return (
    <TemplateProvider template={template}>
      <div className="app">
        <header className="app-header">
          <div>
            <button type="button" className="back-link" onClick={onBack}>
              ← 返回模板选择
            </button>
            <h1>
              洗唛排版系统 · {template.title}
            </h1>
            <p className="subtitle">
              左编辑 · 中文预览 · 翻译出稿 · 字典：{template.dictionaryName}
            </p>
          </div>
          <div className="scale-control">
            <label htmlFor="scale">预览缩放</label>
            <input
              id="scale"
              type="range"
              min={1}
              max={4}
              step={0.5}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            />
            <span>{scale}x</span>
          </div>
        </header>

        <LanguageSelector
          languages={dictionary.languages}
          selected={selectedLanguages}
          onChange={setSelectedLanguages}
        />

        <ExportToolbar
          templateId={templateId}
          labelData={labelData}
          batchCount={batchItems.length}
          dictionary={dictionary}
          selectedLanguages={outputLanguages}
          sourceExportRef={sourceExportRef}
          translatedExportRef={translatedExportRef}
          onImportProject={handleProjectImport}
        />

        <LabelWorkspace
          labelData={labelData}
          batchItems={batchItems}
          dictionary={dictionary}
          outputLanguages={outputLanguages}
          scale={scale}
          materialSuggestions={materialSuggestions}
          onUpdateField={updateField}
          onUpdateComposition={updateComposition}
          onApplyCompositionPaste={handleCompositionPaste}
          onBatchImport={handleBatchImport}
          onBatchClear={handleBatchClear}
        />

        <div className="export-capture" aria-hidden="true">
          <div ref={sourceExportRef} className="export-capture-column">
            {batchItems.length > 0 ? (
              batchItems.map((item) => (
                <WashLabelPreview
                  key={item.id}
                  data={item.labelData}
                  dictionary={dictionary}
                  mode="source"
                  forExport
                />
              ))
            ) : (
              <WashLabelPreview
                data={labelData}
                dictionary={dictionary}
                mode="source"
                forExport
              />
            )}
          </div>
          <div ref={translatedExportRef} className="export-capture-column">
            {batchItems.length > 0 ? (
              batchItems.map((item) => (
                <WashLabelPreview
                  key={item.id}
                  data={item.labelData}
                  dictionary={dictionary}
                  mode="translated"
                  selectedLanguages={outputLanguages}
                  forExport
                />
              ))
            ) : (
              <WashLabelPreview
                data={labelData}
                dictionary={dictionary}
                mode="translated"
                selectedLanguages={outputLanguages}
                forExport
              />
            )}
          </div>
        </div>
      </div>
    </TemplateProvider>
  )
}
