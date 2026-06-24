export const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
export const CJK_PUNCT_RE = /[\u3000-\u303f\uff00-\uffef]/
export const ARABIC_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/
export const ARABIC_PRESENTATION_RE = /[\ufb50-\ufdff\ufe70-\ufeff]/
export const CYRILLIC_RE = /[\u0400-\u04ff]/

export type TextFontRole = 'zh' | 'latin' | 'arabic'

/** FZ 中文语境百分号：全角 ％ 与「方正兰亭细黑简体」同字形；ASCII % 在 FZ 内是西文 glyph */
export const FZ_PERCENT_GLYPH = '％'

export function toFzPercentGlyph(text: string): string {
  return text.replace(/%/g, FZ_PERCENT_GLYPH)
}

/** 与中文混排的 ASCII 标点（导出时跟 FZ，避免 GO 缺字成黑点） */
const ZH_CONTEXT_ASCII_PUNCT_RE = /^[%/\\、:：,，;；.．·\-()（）]$/

function needsZhFont(char: string, textHasCjk: boolean): boolean {
  if (CJK_RE.test(char) || CJK_PUNCT_RE.test(char)) return true
  return textHasCjk && ZH_CONTEXT_ASCII_PUNCT_RE.test(char)
}

function resolveCharFontRole(
  char: string,
  textHasCjk: boolean,
  _textHasArabic: boolean,
  fallback: TextFontRole,
): TextFontRole {
    if (ARABIC_RE.test(char) || ARABIC_PRESENTATION_RE.test(char)) return 'arabic'
    // 数字和小数点必须在 needsZhFont 之前判定，避免 CJK 上下文把 . 误判为 zh 导致 0.3 被拆成 0+.+3
    if (/[\d.]/.test(char)) return 'latin'
    if (char === '%' || char === '％') return 'zh'
    if (needsZhFont(char, textHasCjk)) return 'zh'
  if (CYRILLIC_RE.test(char)) return 'latin'
  if (/[a-zA-Z]/.test(char)) return 'latin'
  return fallback
}

/** 按字形拆分文本，避免混排时整段误用 GO 导致中文/全角标点变成黑点 */
export function splitTextByFontRole(
  text: string,
  fallback: TextFontRole,
): Array<{ content: string; role: TextFontRole }> {
  if (!text) return []

  const chars = [...text]
  const textHasCjk = chars.some((char) => CJK_RE.test(char) || CJK_PUNCT_RE.test(char))
  const textHasArabic = chars.some(
    (char) => ARABIC_RE.test(char) || ARABIC_PRESENTATION_RE.test(char),
  )

  const runs: Array<{ content: string; role: TextFontRole }> = []
  let current = ''
  let currentRole: TextFontRole | null = null

  for (const char of chars) {
    const role = resolveCharFontRole(char, textHasCjk, textHasArabic, fallback)
    if (currentRole === null) {
      currentRole = role
      current = char
      continue
    }
    if (role === currentRole) {
      current += char
      continue
    }
    runs.push({ content: current, role: currentRole })
    current = char
    currentRole = role
  }

  if (current && currentRole) {
    runs.push({ content: current, role: currentRole })
  }

  return runs
}

export function textContainsCjkOrPunct(text: string): boolean {
  return CJK_RE.test(text) || CJK_PUNCT_RE.test(text)
}

/** 阿语 RTL 行内：数字段后紧跟 %，须作为 LTR 单元（否则预览/导出会变成 %57.7） */
export function isDigitThenPercentPair(
  run: { content: string; role: TextFontRole },
  next: { content: string; role: TextFontRole } | undefined,
): boolean {
  return (
    run.role === 'latin' &&
    /^[\d.]+$/.test(run.content) &&
    next !== undefined &&
    next.role === 'zh' &&
    (next.content === '%' || next.content === '％')
  )
}
