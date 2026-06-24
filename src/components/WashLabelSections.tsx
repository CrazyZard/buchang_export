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
import { translateCompositionLabel, translateKeyValueLine } from '../utils/compositionFormat'
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
  const template = useTemplate()
  if (!downJacket) return null

  const isSenmaDown = template.id === 'senma-down'
  const isFrogDown = template.id === 'frog-down'

  const plainLines = isFrogDown
    ? [
        { text: '成分含量' },
        ...downJacket.facingLines
          .filter((l) => l.trim())
          .map((l) => ({ text: l })),
        ...downJacket.stuffingLines
          .filter((l) => l.trim())
          .map((l) => ({ text: l })),
      ]
    : isSenmaDown
      ? [
          { text: FIXED_LABELS.composition },
          ...downJacket.facingLines
            .filter((l) => l.trim())
            .map((l) => ({ text: l })),
          ...downJacket.stuffingLines
            .filter((l) => l.trim())
            .map((l) => ({ text: l })),
        ]
      : [
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

  const isSenmaDown = template.id === 'senma-down'
  const isFrogDown = template.id === 'frog-down'

  return (
    <>
      {languages.map((lang) => {
        const bodyLines = (isSenmaDown || isFrogDown)
          ? [
              // 森马羽绒翻译侧：按 "key：value" 拆分后分别翻译
              ...downJacket.facingLines
                .filter((l) => l.trim())
                .map((line) => ({ text: translateKeyValueLine(dictionary, line, lang) })),
              ...downJacket.stuffingLines
                .filter((l) => l.trim())
                .map((line) => ({ text: translateKeyValueLine(dictionary, line, lang) })),
            ]
          : buildDownJacketCompositionPlainLines([
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
          { text: isFrogDown ? 'Composition content:' : translateCompositionLabel(dictionary, FIXED_LABELS.composition, lang) },
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
        title={
          isFrogDown
            ? (() => {
                const raw = downJacket.fillGrid.title
                const parenIdx = raw.indexOf('(')
                if (parenIdx <= 0) return translateText(dictionary, raw, languages[0])
                const main = raw.slice(0, parenIdx).trimEnd() // "充绒量："
                const suffix = raw.slice(parenIdx)             // "(单位：克)"
                return (
                  translateCompositionLabel(dictionary, main.replace(/[：:]$/, ''), languages[0]) +
                  translateText(dictionary, suffix, languages[0])
                )
              })()
            : isSenmaDown
              ? (() => {
                  const raw = downJacket.fillGrid.title
                  const parenIdx = raw.indexOf('(')
                  if (parenIdx <= 0) return translateText(dictionary, raw, languages[0])
                  const main = raw.slice(0, parenIdx).trimEnd() // "充绒量："
                  const suffix = raw.slice(parenIdx)             // "(单位：克)"
                  return (
                    translateCompositionLabel(dictionary, main.replace(/[：:]$/, ''), languages[0]) +
                    ' ' +
                    translateText(dictionary, suffix, languages[0])
                  )
                })()
              : translateText(dictionary, downJacket.fillGrid.title, languages[0])
        }
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

export function SourceCareSection({
  data,
  skipDryCleanNote = false,
  adviceLabel,
  sourceWashTitle,
}: Pick<SectionProps, 'data'> & { skipDryCleanNote?: boolean; adviceLabel?: string; sourceWashTitle?: string }) {
  const template = useTemplate()
  const careSymbols = resolveCareSymbols(data)
  const isMiniCentered = template.layout.careLayout === 'mini-centered'
  const adviceLines = isMiniCentered ? splitCareAdviceLines(data.careAdvice) : []

  return (
    <div
      className={`label-section label-section--care ${isMiniCentered ? 'label-section--care-mini' : ''}`}
    >
      <div className="label-source-title">{sourceWashTitle ?? FIXED_LABELS.washingInstructions}</div>
      <CareSymbols symbols={careSymbols} size="sm" />
      {!skipDryCleanNote ? <div className="label-source-emphasis">{data.dryCleanNote}</div> : null}
      {isMiniCentered ? (
        <div className="label-source-advice-lines">
          {adviceLines.map((line, index) => (
            <div key={index} className="label-source-advice-line">
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div className={`label-source-advice${adviceLabel ? ' label-source-advice--with-label' : ''}`}>
          {adviceLabel ? <div className="label-source-advice-label">{adviceLabel}</div> : null}
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
  const template = useTemplate()
  const isFrog = template.id === 'frog'
  return (
    <div className="label-footer">
      <div className="footer-made-in">{data.madeIn}</div>
      <div className="product-codes label-latin">
        {isFrog ? (
          <>
            <div>{data.productCode2}</div>
            <div>{data.productCode1}</div>
          </>
        ) : (
          <>
            <div>{data.productCode1}</div>
            <div>{data.productCode2}</div>
          </>
        )}
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

export function TranslatedCareSection({
  data,
  languages,
  useTextOnly = false,
  dictionary,
}: Pick<SectionProps, 'data' | 'languages'> & { useTextOnly?: boolean; dictionary?: Dictionary }) {
  const careSymbols = resolveCareSymbols(data)

  if (useTextOnly && dictionary && languages.length > 0) {
    return (
      <div className="label-section label-section--care">
        <div className="label-translated-wash-head label-translated-wash-head--text-only">
          {languages.map((lang) => {
            const translated = dictionary.entries['洗涤说明']?.[lang] ?? translateText(dictionary, '洗涤说明', lang)
            return (
              <div key={lang} className={`label-translated-wash-text ${langClass(lang)}`}>
                {translated}
              </div>
            )
          })}
        </div>
        <CareSymbols symbols={careSymbols} size="sm" />
      </div>
    )
  }

  if (languages.length === 0) return null

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

export function TranslatedFooterSection({ data, dictionary, languages }: SectionProps) {
  const template = useTemplate()
  const isSenma = template.id === 'senma-regular' || template.id === 'senma-down' || template.id === 'frog-down'
  const isFrog = template.id === 'frog'

  return (
    <div className="label-footer">
      {(isSenma || isFrog) && languages.length > 0 ? (
        <div className="footer-made-in-translated">
          {languages.map((lang) => {
            const translated = dictionary.entries['中国制造']?.[lang] ?? translateText(dictionary, '中国制造', lang)
            return (
              <div key={lang} className={`footer-made-in-line ${getLanguageFontClass(lang)}`}>
                {translated}
              </div>
            )
          })}
        </div>
      ) : null}
      <div className="product-codes label-font-latin">
        {isFrog ? (
          <>
            <div>{data.productCode2}</div>
            <div>{data.productCode1}</div>
          </>
        ) : (
          <>
            <div>{data.productCode1}</div>
            <div>{data.productCode2}</div>
          </>
        )}
      </div>
    </div>
  )
}

export type { CompositionPart } from '../types'
