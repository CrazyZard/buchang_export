import { useCallback, useState, type CSSProperties } from 'react'
import { BatchExcelImport } from './BatchExcelImport'
import { BrandLogo } from './BrandLogo'
import { useSelectedLogo } from '../context/SelectedLogoContext'
import { CareSymbolPicker } from './CareSymbols'
import { CompositionPasteInput } from './CompositionPasteInput'
import { DownJacketEditor } from './DownJacketEditor'
import { MaterialEditor } from './MaterialEditor'
import { PairedBatchLabelPreviews } from './PairedBatchLabelPreviews'
import { PairedWashLabelPreviews } from './PairedWashLabelPreviews'
import { WashLabelPreview } from './WashLabelPreview'
import { resolveCompositionParts } from '../templates'
import { useTemplate } from '../context/TemplateContext'
import type { BatchLabelItem, CompositionPart, Dictionary, LabelData } from '../types'
import { FIXED_LABELS } from '../types'
import { formatLabelSizeMm, type PreviewLabelHeights } from '../utils/labelMeasure'

interface LabelWorkspaceProps {
  labelData: LabelData
  batchItems: BatchLabelItem[]
  dictionary: Dictionary
  outputLanguages: string[]
  scale: number
  materialSuggestions: string[]
  onUpdateField: <K extends keyof LabelData>(key: K, value: LabelData[K]) => void
  onUpdateComposition: (
    part: CompositionPart,
    items: LabelData['composition'][CompositionPart],
  ) => void
  onApplyCompositionPaste: (text: string) => void
  onCompositionClear: () => void
  onBatchImport: (items: BatchLabelItem[]) => void
  onBatchClear: () => void
}

export function LabelWorkspace({
  labelData,
  batchItems,
  dictionary,
  outputLanguages,
  scale,
  materialSuggestions,
  onUpdateField,
  onUpdateComposition,
  onApplyCompositionPaste,
  onCompositionClear,
  onBatchImport,
  onBatchClear,
}: LabelWorkspaceProps) {
  const template = useTemplate()
  const isSenma = template.id === 'senma-regular' || template.id === 'senma-down'
  const isFrogDown = template.id === 'frog-down'
  const { logoSvg: selectedLogo, setLogoSvg } = useSelectedLogo()
  const compositionParts = resolveCompositionParts(template)
  const [previewHeights, setPreviewHeights] = useState<PreviewLabelHeights | null>(null)
  const handlePreviewHeightsChange = useCallback((heights: PreviewLabelHeights) => {
    setPreviewHeights((prev) => {
      if (
        prev &&
        prev.sourceMm === heights.sourceMm &&
        prev.translatedMm === heights.translatedMm &&
        prev.pairedMm === heights.pairedMm
      ) {
        return prev
      }
      return heights
    })
  }, [])
  const editorLabelStyle = {
    '--label-head-seam': `${template.layout.headSeamMm}mm`,
    '--label-width': `${template.layout.labelWidthMm ?? 25}mm`,
  } as CSSProperties
  const labelWidthMm = template.layout.labelWidthMm ?? 25
  const batchMode = batchItems.length > 0
  const previewSizeHint = batchMode
    ? `共 ${batchItems.length} 条`
    : previewHeights
      ? formatLabelSizeMm(labelWidthMm, previewHeights.pairedMm)
      : `${labelWidthMm}×…mm`

  return (
    <main className="label-workspace">
      <div className={`workspace-grid${batchMode ? ' workspace-grid--batch' : ''}`}>
        <div className="workspace-col-head">编辑字段</div>
        <div className="workspace-col-head">
          中文预览
          <small>{previewSizeHint}</small>
        </div>
        <div className="workspace-col-head">
          翻译出稿
          <small>
            {previewSizeHint}
            {outputLanguages.length > 0 ? ` · ${outputLanguages.join('、')}` : batchMode ? '' : ' · 未选语言'}
          </small>
        </div>

        <div className="workspace-editor">
          <section className="edit-section">
            <BatchExcelImport
              baseLabelData={template.createDefaultLabelData()}
              batchCount={batchItems.length}
              templateId={template.id}
              onImport={onBatchImport}
              onClear={onBatchClear}
            />
          </section>
          {template.layout.showBrandLogo ? (
            <section className="edit-section">
              <div className="edit-section-label">品牌 Logo</div>
              {template.logoOptions && template.logoOptions.length > 1 ? (
                <select
                  className="logo-selector"
                  value={selectedLogo ?? template.logoSvg}
                  onChange={(e) => {
                    const v = e.target.value
                    setLogoSvg(v === template.logoSvg ? null : v)
                  }}
                >
                  {template.logoOptions.map((opt) => (
                    <option key={opt.svg} value={opt.svg}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className={`brand-logo-preview wash-label--${template.id}`} style={editorLabelStyle}>
                <div className="label-head-seam" aria-hidden="true" />
                <div className="label-fold-line" />
                <BrandLogo />
              </div>
            </section>
          ) : null}

          <section className="edit-section">
            <div className="edit-section-label">{FIXED_LABELS.composition}</div>
            {template.compositionMode === 'down-jacket' && labelData.downJacket ? (
              <>
                {isSenma || isFrogDown ? <CompositionPasteInput onApply={onApplyCompositionPaste} onClear={onCompositionClear} /> : null}
                <DownJacketEditor
                  value={labelData.downJacket}
                  onChange={(downJacket) => onUpdateField('downJacket', downJacket)}
                />
              </>
            ) : (
              <>
                <CompositionPasteInput onApply={onApplyCompositionPaste} onClear={onCompositionClear} />
                <MaterialEditor
                  parts={compositionParts}
                  optionalParts={template.optionalCompositionParts}
                  requiredParts={template.requiredCompositionParts}
                  composition={labelData.composition}
                  onChange={onUpdateComposition}
                />
                <datalist id="material-suggestions">
                  {materialSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </>
            )}
          </section>

          <section className="edit-section">
            <div className="edit-section-label">{FIXED_LABELS.washingInstructions}</div>
            <div className="field">
              <span>洗护图标</span>
              <CareSymbolPicker
                data={labelData}
                onChange={(symbols) => onUpdateField('careSymbols', symbols)}
              />
            </div>
            {!isSenma ? (
              <label className="field">
                <span>干洗说明</span>
                <input
                  type="text"
                  value={labelData.dryCleanNote}
                  onChange={(e) => onUpdateField('dryCleanNote', e.target.value)}
                />
              </label>
            ) : null}
            <label className="field">
              <span>{isSenma ? '温馨提示' : isFrogDown ? '洗涤维护方式' : '洗涤建议'}</span>
              <textarea
                rows={3}
                value={labelData.careAdvice}
                onChange={(e) => onUpdateField('careAdvice', e.target.value)}
              />
            </label>
          </section>

          <section className="edit-section">
            <div className="edit-section-label">底部信息</div>
            <label className="field">
              <span>产地</span>
              <input
                type="text"
                value={labelData.madeIn}
                onChange={(e) => onUpdateField('madeIn', e.target.value)}
              />
            </label>
            <div className="footer-codes">
              <label className="field">
                <span>款号</span>
                <input
                  type="text"
                  value={labelData.productCode1}
                  onChange={(e) => onUpdateField('productCode1', e.target.value)}
                />
              </label>
              <label className="field">
                <span>工厂代码</span>
                <input
                  type="text"
                  value={labelData.productCode2}
                  onChange={(e) => onUpdateField('productCode2', e.target.value)}
                />
              </label>
            </div>
          </section>
        </div>

        {batchMode ? (
          <PairedBatchLabelPreviews
            items={batchItems}
            scale={scale}
            dictionary={dictionary}
            outputLanguages={outputLanguages}
          />
        ) : (
          <PairedWashLabelPreviews
            scale={scale}
            onHeightsChange={handlePreviewHeightsChange}
            source={
              <WashLabelPreview data={labelData} dictionary={dictionary} mode="source" />
            }
            translated={
              <WashLabelPreview
                key={outputLanguages.join('|')}
                data={labelData}
                dictionary={dictionary}
                mode="translated"
                selectedLanguages={outputLanguages}
              />
            }
          />
        )}
      </div>
    </main>
  )
}
