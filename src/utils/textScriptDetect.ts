export const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
export const CJK_PUNCT_RE = /[\u3000-\u303f\uff00-\uffef]/
export const ARABIC_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/
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
  if (ARABIC_RE.test(char)) return 'arabic'
  if (needsZhFont(char, textHasCjk)) return 'zh'
  // 数字 / % 全局铁律：GO / FZ（阿语行内亦同）
  if (char === '%' || char === '％') return 'zh'
  if (/[\d.]/.test(char)) return 'latin'
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
  const textHasArabic = chars.some((char) => ARABIC_RE.test(char))

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
