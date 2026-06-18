import type { Dictionary, LabelData } from '../types'
import { DOWN_JACKET_LABELS, FIXED_LABELS } from '../types'
import {
  getLanguageFontClass,
  isRtlLanguage,
  translateText,
} from '../utils/dictionary'
import { CompositionPlainBlock, CareAdvicePlainBlock } from '../utils/labelTextRender'
import {
  buildDownJacketCompositionPlainLines,
  buildSourceCompositionPlainLines,
  buildTranslatedCompositionPlainLines,
} from '../utils/compositionPlainText'
import { translateCompositionLabel } from '../utils/compositionFormat'
import { CareSymbols } from './CareSymbols'
import { InlineSvg } from './InlineSvg'
import { TRANSLATED_LABEL_GRAPHICS } from '../assets/care-symbols'
import { BrandLogo } from './BrandLogo'
import { DownFillGridPreview } from './DownFillGrid'
import { useTemplate } from '../context/TemplateContext'
import { resolveCareSymbols } from '../utils/careSymbols'
import { splitCareAdviceLines } from '../utils/miniBalabalaLayout'

interface SectionProps {
  data: LabelData
  dictionary: Dictionary
  languages: string[]
}

function langClass(lang: string) {
  return `${getLanguageFontClass(lang)} ${isRtlLanguage(lang) ? 'rtl' : ''}`.trim()
}

export function LabelTopSeam() {
  return (
    <>
      <div className="label-head-seam" aria-hidden="true" />
      <div className="label-fold-line" />
    </>
  )
}

export function SourceBrandSection(_props: Pick<SectionProps, 'data'>) {
  return (
    <div className="label-brand">
      <BrandLogo />
    </div>
  )
}

export function SourceDownJacketSection({
  data,
}: Pick<SectionProps, 'data'>) {
  const downJacket = data.downJacket
  if (!downJacket) return null

  const plainLines = [
    { text: FIXED_LABELS.composition },
    ...buildDownJacketCompositionPlainLines([
      { partLabel: `${DOWN_JACKET_LABELS.facing}：`, lines: downJacket.facingLines },
      { partLabel: `${DOWN_JACKET_LABELS.lining}：`, lines: [downJacket.liningLine] },
      { partLabel: `${DOWN_JACKET_LABELS.stuffing}：`, lines: downJacket.stuffingLines },
    ]),
  ]

  return (
    <div className="label-section label-section--composition label-section--down-jacket">
      <div className="label-source-body">
        <CompositionPlainBlock lines={plainLines} useLatinDigits />
      </div>
      <DownFillGridPreview grid={downJacket.fillGrid} />
    </div>
  )
}

export function TranslatedDownJacketCompositionSection({ data, dictionary, languages }: SectionProps) {
  const downJacket = data.downJacket
  const template = useTemplate()
  if (!downJacket || languages.length === 0) return null

  return (
    <>
      {languages.map((lang) => {
        const bodyLines = buildDownJacketCompositionPlainLines([
          {
            partLabel: `${translateCompositionLabel(dictionary, DOWN_JACKET_LABELS.facing, lang)}:`,
            lines: downJacket.facingLines.map((line) => translateText(dictionary, line, lang)),
          },
          {
            partLabel: `${translateCompositionLabel(dictionary, DOWN_JACKET_LABELS.lining, lang)}:`,
            lines: [translateText(dictionary, downJacket.liningLine, lang)],
          },
          {
            partLabel: `${translateCompositionLabel(dictionary, DOWN_JACKET_LABELS.stuffing, lang)}:`,
            lines: downJacket.stuffingLines.map((line) => translateText(dictionary, line, lang)),
          },
        ])
        const plainLines = [
          { text: translateCompositionLabel(dictionary, FIXED_LABELS.composition, lang) },
          ...bodyLines,
        ]
        const rtl = isRtlLanguage(lang)

        return (
          <div
            key={lang}
            className={`lang-block ${langClass(lang)} ${
              template.layout.arabicBlockBorder === 'solid' && rtl
                ? 'lang-block--arabic-bordered'
                : ''
            }`.trim()}
          >
            <div className="label-section label-section--composition label-section--down-jacket">
              <div className="label-translated-body">
                <CompositionPlainBlock
                  lines={plainLines}
                  useLatinDigits
                  dir={rtl ? 'rtl' : undefined}
                />
              </div>
            </div>
          </div>
        )
      })}
      <DownFillGridPreview
        grid={downJacket.fillGrid}
        title={translateText(dictionary, downJacket.fillGrid.title, languages[0])}
        className="down-fill-grid--translated"
      />
    </>
  )
}

export function SourceCompositionSection({
  data,
}: Pick<SectionProps, 'data'>) {
  const template = useTemplate()
  const plainLines = buildSourceCompositionPlainLines({ data, template })

  return (
    <div className="label-section label-section--composition">
      <div className="label-source-body">
        <CompositionPlainBlock lines={plainLines} useLatinDigits />
      </div>
    </div>
  )
}

export function SourceCareSection({ data }: Pick<SectionProps, 'data'>) {
  const template = useTemplate()
  const careSymbols = resolveCareSymbols(data)
  const isMiniCentered = template.layout.careLayout === 'mini-centered'
  const adviceLines = isMiniCentered ? splitCareAdviceLines(data.careAdvice) : []

  return (
    <div
      className={`label-section label-section--care ${isMiniCentered ? 'label-section--care-mini' : ''}`}
    >
      <div className="label-source-title">{FIXED_LABELS.washingInstructions}</div>
      <CareSymbols symbols={careSymbols} size="sm" />
      <div className="label-source-emphasis">{data.dryCleanNote}</div>
      {isMiniCentered ? (
        <div className="label-source-advice-lines">
          {adviceLines.map((line, index) => (
            <div key={index} className="label-source-advice-line">
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div className="label-source-advice">
          <CareAdvicePlainBlock text={data.careAdvice} />
        </div>
      )}
      {isMiniCentered ? (
        <div className="label-source-care-footer">
          <div className="footer-made-in">{data.madeIn}</div>
          <div className="product-codes label-latin">
            <div>{data.productCode1}</div>
            <div>{data.productCode2}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function SourceFooterSection({ data }: Pick<SectionProps, 'data'>) {
  return (
    <div className="label-footer">
      <div className="footer-made-in">{data.madeIn}</div>
      <div className="product-codes label-latin">
        <div>{data.productCode1}</div>
        <div>{data.productCode2}</div>
      </div>
    </div>
  )
}

export function TranslatedCompositionSection({
  data,
  dictionary,
  languages,
}: SectionProps) {
  const template = useTemplate()
  if (languages.length === 0) return null

  return (
    <>
      {languages.map((lang) => {
        const plainLines = buildTranslatedCompositionPlainLines({
          data,
          dictionary,
          lang,
          template,
        })
        const rtl = isRtlLanguage(lang)

        return (
          <div
            key={lang}
            className={`lang-block ${langClass(lang)} ${
              template.layout.arabicBlockBorder === 'solid' && rtl
                ? 'lang-block--arabic-bordered'
                : ''
            }`.trim()}
          >
            <div className="label-section label-section--composition">
              <div className="label-translated-body">
                <CompositionPlainBlock
                  lines={plainLines}
                  useLatinDigits
                  dir={rtl ? 'rtl' : undefined}
                />
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

export function TranslatedCareSection({ data, languages }: Pick<SectionProps, 'data' | 'languages'>) {
  if (languages.length === 0) return null

  const careSymbols = resolveCareSymbols(data)

  return (
    <>
      <div className="label-section label-section--care">
        <div className="label-translated-wash-head">
          <div className="label-translated-wash-line label-translated-wash-line--graphic">
            <InlineSvg
              markup={TRANSLATED_LABEL_GRAPHICS.washingInstructions}
              className="translated-label-graphic translated-label-graphic--washing"
              ariaLabel="Washing instructions"
            />
          </div>
        </div>
        <CareSymbols symbols={careSymbols} size="sm" />
      </div>
      <div className="label-box-footer">
        <div className="label-box-footer__dry-clean">
          <InlineSvg
            markup={TRANSLATED_LABEL_GRAPHICS.doNotClean}
            className="translated-label-graphic translated-label-graphic--dry-clean"
            ariaLabel="Do not dry clean"
          />
        </div>
      </div>
    </>
  )
}

export function TranslatedFooterSection({ data }: Pick<SectionProps, 'data'>) {
  return (
    <div className="label-footer">
      <div className="product-codes label-font-latin">
        <div>{data.productCode1}</div>
        <div>{data.productCode2}</div>
      </div>
    </div>
  )
}

export type { CompositionPart } from '../types'
