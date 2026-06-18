import { AutoFitLabel, LABEL_FONT } from './AutoFitLabel'
import { useTemplate } from '../context/TemplateContext'
import type { CSSProperties } from 'react'
import type { Dictionary, LabelData } from '../types'
import { resolveOutputLanguages } from '../utils/dictionary'
import {
  LabelTopSeam,
  SourceBrandSection,
  SourceCareSection,
  SourceCompositionSection,
  SourceDownJacketSection,
  SourceFooterSection,
  TranslatedCareSection,
  TranslatedCompositionSection,
  TranslatedDownJacketCompositionSection,
  TranslatedFooterSection,
} from './WashLabelSections'

interface WashLabelPreviewProps {
  data: LabelData
  dictionary: Dictionary
  mode: 'source' | 'translated'
  selectedLanguages?: string[]
  /** 隐藏导出区专用：完整渲染、不裁剪 */
  forExport?: boolean
}

export function WashLabelPreview({
  data,
  dictionary,
  mode,
  selectedLanguages,
  forExport = false,
}: WashLabelPreviewProps) {
  const template = useTemplate()
  const templateClass = `wash-label--${template.id}`
  const isDownJacket = template.compositionMode === 'down-jacket'
  const maxHeightMm = forExport ? undefined : template.layout.labelHeightMm
  const labelStyle = {
    '--label-head-seam': `${template.layout.headSeamMm}mm`,
  } as CSSProperties

  const isMiniCentered = template.layout.careLayout === 'mini-centered'
  const isBalabalaFixedSource = template.id === 'balabala'

  if (mode === 'source') {
    const sourceFont = isBalabalaFixedSource ? LABEL_FONT.balabalaChinese : LABEL_FONT.chinese
    return (
      <AutoFitLabel
        className={`wash-label wash-label--source ${templateClass}${forExport ? ' wash-label--export' : ''}`}
        style={labelStyle}
        baseFontPt={sourceFont.basePt}
        minFontPt={sourceFont.minPt}
        maxHeightMm={isBalabalaFixedSource ? undefined : maxHeightMm}
        forExport={forExport}
      >
        <LabelTopSeam />
        {template.layout.showBrandLogo ? <SourceBrandSection data={data} /> : null}
        {isDownJacket ? (
          <SourceDownJacketSection data={data} />
        ) : (
          <SourceCompositionSection data={data} />
        )}
        {template.id === 'balabala' ? (
          <div className="label-composition-care-spacer" aria-hidden="true" />
        ) : null}
        <SourceCareSection data={data} />
        {isMiniCentered ? null : <SourceFooterSection data={data} />}
      </AutoFitLabel>
    )
  }

  const languages = resolveOutputLanguages(dictionary, selectedLanguages)

  if (languages.length === 0) {
    return (
      <div className="wash-label wash-label--empty">
        请勾选出稿语言
      </div>
    )
  }

  const isBalabala = template.id === 'balabala'

  return (
    <AutoFitLabel
      className={`wash-label wash-label--translated ${templateClass}${forExport ? ' wash-label--export' : ''}`}
      style={labelStyle}
      baseFontPt={isBalabala ? 4 : LABEL_FONT.latin.basePt}
      minFontPt={isBalabala ? 4 : LABEL_FONT.latin.minPt}
      maxHeightMm={isBalabala || forExport ? undefined : maxHeightMm}
      forExport={forExport}
    >
      <LabelTopSeam />
      {isDownJacket ? (
        <TranslatedDownJacketCompositionSection
          data={data}
          dictionary={dictionary}
          languages={languages}
        />
      ) : (
        <TranslatedCompositionSection
          data={data}
          dictionary={dictionary}
          languages={languages}
        />
      )}
      {template.id === 'balabala' ? (
        <div className="label-composition-care-spacer" aria-hidden="true" />
      ) : null}
      {template.id !== 'balabala' ? (
        <div className="label-divider label-divider--solid" />
      ) : null}
      <TranslatedCareSection data={data} languages={languages} />
      <TranslatedFooterSection data={data} />
    </AutoFitLabel>
  )
}
