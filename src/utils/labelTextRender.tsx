import {
  ARABIC_RE,
  FZ_PERCENT_GLYPH,
  isDigitThenPercentPair,
  splitTextByFontRole,
} from './textScriptDetect'
import type { FontRole } from './svgTextToPathsUtils'
import type { CSSProperties, ReactNode } from 'react'
import { LIVE_EXPORT_SINGLE_TEXT_CLASS } from './flattenCompositionBlocksForLive'
import {
  estimateCompositionAlignCh,
  joinCompositionPlainLines,
  type CompositionPlainLine,
} from './compositionPlainLines'

function isArabicCompositionToken(token: string): boolean {
  return ARABIC_RE.test(token)
}

function renderFontRun(content: string, role: FontRole, key: number): ReactNode {
  if (!content) return null
  if (role === 'latin' && /^[\d.]+$/.test(content)) {
    return (
      <span key={key} className="label-latin">
        {content}
      </span>
    )
  }
  if (content === '%' || content === '％') {
    return (
      <span key={key} className="composition-percent">
        {FZ_PERCENT_GLYPH}
      </span>
    )
  }
  // zh-role run starting with %：split to apply composition-percent class
  // (e.g. %锦纶 → ％ with FZ + 锦纶 inheriting parent)
  if (role === 'zh' && /^[%％]/.test(content)) {
    const rest = content.slice(1)
    return (
      <>
        <span key={`${key}-pct`} className="composition-percent">{FZ_PERCENT_GLYPH}</span>
        {rest && <span key={`${key}-rest`}>{rest}</span>}
      </>
    )
  }
  if (role === 'latin' && /[a-zA-Z]/.test(content)) {
    return (
      <span key={key} className="label-latin">
        {content}
      </span>
    )
  }
  return <span key={key}>{content}</span>
}

function renderDigitPercentLtr(digits: string, key: number): ReactNode {
  return (
    <span key={key} className="composition-digit-percent" dir="ltr">
      <span className="label-latin">{digits}</span>
      <span className="composition-percent">{FZ_PERCENT_GLYPH}</span>
    </span>
  )
}

/** 阿语 RTL：数字+% 须包在 LTR 隔离段，避免 bidi 显示成 %57.7 */
function renderArabicCompositionLine(line: string): ReactNode {
  const runs = splitTextByFontRole(line, 'arabic')
  const nodes: ReactNode[] = []
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i]
    const next = runs[i + 1]
    if (isDigitThenPercentPair(run, next)) {
      nodes.push(renderDigitPercentLtr(run.content, i))
      i += 1
      continue
    }
    nodes.push(renderFontRun(run.content, run.role, i))
  }
  return nodes
}

/** 预览：整段可复制，行内数字 GO / % FZ */
export function renderPlainCompositionLine(line: string, useLatinDigits: boolean): ReactNode {
  if (!useLatinDigits) return line

  if (isArabicCompositionToken(line)) {
    return renderArabicCompositionLine(line)
  }

  const runs = splitTextByFontRole(line, 'zh')
  return runs.map((run, index) => renderFontRun(run.content, run.role, index))
}

interface CompositionPlainBlockProps {
  text?: string
  lines?: CompositionPlainLine[]
  useLatinDigits?: boolean
  className?: string
  dir?: 'ltr' | 'rtl' | 'auto'
}

/** 单文本框多行（\\n + 空格），预览与 live 导出 DOM 结构一致 */
export function CompositionPlainBlock({
  text,
  lines: structuredLines,
  useLatinDigits = true,
  className,
  dir,
}: CompositionPlainBlockProps) {
  const lines: CompositionPlainLine[] =
    structuredLines ??
    (text ?? '')
      .split('\n')
      .map((line) => ({ text: line }))
      .filter((line) => line.text.length > 0)

  if (!lines.length) return null

  return (
    <div
      className={`${LIVE_EXPORT_SINGLE_TEXT_CLASS} composition-plain${className ? ` ${className}` : ''}`.trim()}
      dir={dir}
      data-plain-text={joinCompositionPlainLines(lines)}
    >
      {lines.map((line, index) => {
        const labelCh = line.hangingLabel ?? line.alignLabel
        const alignStyle: CSSProperties | undefined = labelCh
          ? ({ '--composition-align-ch': estimateCompositionAlignCh(labelCh) } as CSSProperties)
          : undefined

        const classNames = [
          'composition-plain-line',
          line.hangingLabel ? 'composition-plain-line--hanging' : '',
          line.continuation ? 'composition-plain-line--continuation' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <span key={index} className={classNames} style={alignStyle}>
            {renderPlainCompositionLine(line.text, useLatinDigits)}
          </span>
        )
      })}
    </div>
  )
}

/** 成分行：数字用 GO，% 与中文材质用 FZ */
export function renderCompositionToken(token: string, useLatinDigits: boolean) {
  if (!useLatinDigits) return token

  const match = token.match(/^([\d.]+)(%?)(.*)$/)
  if (!match?.[1]) return token

  const [, digits, percent, rest] = match

  const digitPercent = percent ? (
    <span className="composition-digit-percent" dir="ltr">
      <span className="label-latin">{digits}</span>
      <span className="composition-percent">{FZ_PERCENT_GLYPH}</span>
    </span>
  ) : (
    <span className="label-latin">{digits}</span>
  )

  return (
    <>
      {digitPercent}
      {rest}
    </>
  )
}

/** 翻译预览：数字 GO，% 用 FZ；阿语同样拆数字/%，阿拉伯字母仍 ARIAL（继承） */
export function renderTranslatedCompositionToken(token: string, useLatinDigits: boolean) {
  if (!useLatinDigits) return token
  return renderCompositionToken(token, true)
}

/** 巴拉翻译 grid-align：LTR 比例|材质分列；阿语整段 RTL */
export function renderGridAlignCompositionToken(
  token: string,
  useLatinDigits: boolean,
  rtl = false,
) {
  if (!useLatinDigits) return token

  // 阿语：不分列，整段保持 RTL，仅把数字拆成 GO、% 拆成 FZ（阿拉伯字母仍 ARIAL）
  if (rtl || isArabicCompositionToken(token)) {
    return renderCompositionToken(token, true)
  }

  const percentMatch = token.match(/^([\d.]+%)([\s\S]*)$/)
  if (!percentMatch?.[1]) {
    return (
      <span className="composition-material-body">
        {renderTranslatedCompositionToken(token, true)}
      </span>
    )
  }

  const [, percent, rawName] = percentMatch
  const name = rawName.trim()
  if (!name) {
    return (
      <span className="composition-material-head">
        {renderTranslatedCompositionToken(percent, true)}
      </span>
    )
  }

  return (
    <>
      <span className="composition-material-head">
        {renderTranslatedCompositionToken(percent, true)}
      </span>
      <span className="composition-material-body">{name}</span>
    </>
  )
}

export function renderLatinText(text: string) {
  return <span className="label-latin">{text}</span>
}

/** 洗涤建议：单段纯文本，预览按宽度自然换行，导出合并为一个 AI 文本框 */
export function CareAdvicePlainBlock({ text }: { text: string }) {
  const trimmed = text.trim()
  if (!trimmed) return null
  const preLine = trimmed.includes('\n')

  return (
    <div
      className={`${LIVE_EXPORT_SINGLE_TEXT_CLASS} care-advice-live${
        preLine ? ' care-advice-live--pre-line' : ''
      }`}
    >
      {trimmed}
    </div>
  )
}

const CARE_ADVICE_TAIL_RE =
  /^([\s\S]*)([\u4e00-\u9fffA-Za-z0-9])([。．.！!？?；;]+)$/u

/** 句末最后一字与标点不换行拆开，避免「。」单独占一行 */
export function renderCareAdviceText(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null

  const match = trimmed.match(CARE_ADVICE_TAIL_RE)
  if (!match) return trimmed

  const [, head, lastChar, punct] = match
  return (
    <>
      {head}
      <span className="care-advice-tail">
        {lastChar}
        {punct}
      </span>
    </>
  )
}
