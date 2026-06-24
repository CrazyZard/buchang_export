import { AutoFitLabel, LABEL_FONT } from './AutoFitLabel'
import { useTemplate } from '../context/TemplateContext'
import type { CSSProperties } from 'react'
import type { Dictionary, LabelData } from '../types'
import { resolveOutputLanguages } from '../utils/dictionary'
import { resolveCareSymbols } from '../utils/careSymbols'
import { frogCareAdviceTitleEn, frogCareAdviceBodyEn } from '../utils/labelDefaults'
import { CareSymbols } from './CareSymbols'
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
  const maxHeightMm = template.layout.labelHeightMm
  const labelStyle = {
    '--label-head-seam': `${template.layout.headSeamMm}mm`,
    '--label-width': `${template.layout.labelWidthMm ?? 25}mm`,
  } as CSSProperties

  const isMiniCentered = template.layout.careLayout === 'mini-centered'
  const isBalabalaFixedSource = template.id === 'balabala'
  const isFrog = template.id === 'frog'
  const isFrogDown = template.id === 'frog-down'
  const isSenma = template.id === 'senma-regular'
  const isSenmaDown = template.id === 'senma-down'

  if (mode === 'source') {
    const sourceFont = isFrogDown
      ? LABEL_FONT.frogDownChinese
      : isFrog
        ? LABEL_FONT.frogChinese
        : isBalabalaFixedSource
          ? LABEL_FONT.balabalaChinese
          : isSenma
            ? LABEL_FONT.senmaChinese
            : isSenmaDown
              ? LABEL_FONT.senmaDownChinese
              : LABEL_FONT.chinese
    return (
      <AutoFitLabel
        className={`wash-label wash-label--source ${templateClass}${forExport ? ' wash-label--export' : ''}`}
        style={labelStyle}
        baseFontPt={sourceFont.basePt}
        minFontPt={sourceFont.minPt}
        maxHeightMm={maxHeightMm}
        forExport={forExport}
      >
        <LabelTopSeam />
        {template.layout.showBrandLogo ? <SourceBrandSection data={data} /> : null}
        {isDownJacket ? (
          <SourceDownJacketSection data={data} />
        ) : (
          <SourceCompositionSection data={data} />
        )}
        {template.id === 'balabala' || template.id === 'frog' ? (
          <div className="label-composition-care-spacer" aria-hidden="true" />
        ) : isSenma || isSenmaDown ? (
          <>
            <div className="label-composition-care-spacer" aria-hidden="true" />
            <SourceCareSection data={data} skipDryCleanNote adviceLabel="温馨提示" />
          </>
        ) : isFrogDown ? (
          <>
            <div className="label-composition-care-spacer" aria-hidden="true" />
            <SourceCareSection data={data} skipDryCleanNote adviceLabel="洗涤维护方式" sourceWashTitle="洗涤维护方式" />
          </>
        ) : null}
        <div className="label-bottom-group">
          {(isSenma || isSenmaDown || isFrogDown) ? (
            <SourceFooterSection data={data} />
          ) : (
            <>
              <SourceCareSection
                data={data}
                sourceWashTitle={template.id === 'frog' ? '洗涤维护方法' : undefined}
              />
              {isMiniCentered ? null : <SourceFooterSection data={data} />}
            </>
          )}
        </div>
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
  const isFrogTranslated = template.id === 'frog'
  const isFrogDownTranslated = template.id === 'frog-down'
  const translatedFont =     isFrogDownTranslated
    ? LABEL_FONT.frogDownTranslated
    : isFrogTranslated
      ? LABEL_FONT.frogTranslated
      : isSenmaDown || isSenma
        ? LABEL_FONT.senmaTranslated
        : isBalabala
          ? { basePt: 4, minPt: 3.1 }
          : LABEL_FONT.latin

  return (
    <AutoFitLabel
      className={`wash-label wash-label--translated ${templateClass}${forExport ? ' wash-label--export' : ''}`}
      style={labelStyle}
      baseFontPt={translatedFont.basePt}
      minFontPt={translatedFont.minPt}
      maxHeightMm={maxHeightMm}
      forExport={forExport}
    >
      <LabelTopSeam />
      {(isSenma || isSenmaDown || isFrogDown || template.id === 'frog') && template.layout.showBrandLogo ? (
        <>
          <SourceBrandSection data={data} />
          <div className="label-composition-care-spacer" aria-hidden="true" />
        </>
      ) : null}
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
      {template.id === 'balabala' || template.id === 'frog' ? (
        <div className="label-composition-care-spacer" aria-hidden="true" />
      ) : null}
      {template.id !== 'balabala' && template.id !== 'frog' && !(isSenma || isSenmaDown || isFrogDown) ? (
        <div className="label-divider label-divider--solid" />
      ) : null}
      {(isSenma || isSenmaDown || isFrogDown) ? (
        <>
          <TranslatedCareSection data={data} languages={languages} useTextOnly dictionary={dictionary} />
          <div className="label-bottom-group">
            <TranslatedFooterSection data={data} dictionary={dictionary} languages={languages} />
          </div>
        </>
      ) : template.id === 'frog' ? (
        <div className="label-bottom-group">
          <div className="label-section label-section--care">
            <div className="label-translated-wash-head label-translated-wash-head--text-only">
              <div className="label-translated-wash-title-frog label-font-latin">
                {frogCareAdviceTitleEn}
              </div>
            </div>
            <CareSymbols symbols={resolveCareSymbols(data)} size="sm" />
          </div>
          <div className="label-translated-wash-body-frog label-font-latin">
            {frogCareAdviceBodyEn}
          </div>
          <TranslatedFooterSection data={data} dictionary={dictionary} languages={languages} />
        </div>
      ) : (
        <>
          <TranslatedCareSection data={data} languages={languages} />
          <TranslatedFooterSection data={data} dictionary={dictionary} languages={languages} />
        </>
      )}
    </AutoFitLabel>
  )
}
