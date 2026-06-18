import { ARABIC_RE } from './textScriptDetect'

export const ARABIC_RENDER_OPTIONS = {
  script: 'arab',
  language: 'ARA',
  kerning: true,
} as const

/** 阿语 RTL 行末弱标点（ASCII/全角冒号等），导出转曲时需画在词左侧 */
const RTL_WEAK_TRAIL_PUNCT_RE = /^([\s\S]+?)([:：,，;；.．!?؟！]+)$/

export function isArabicExportText(text: string): boolean {
  return ARABIC_RE.test(text)
}

export function splitRtlWeakTrailingPunct(text: string): { core: string; trail: string } {
  const match = text.match(RTL_WEAK_TRAIL_PUNCT_RE)
  if (!match?.[1] || !match[2]) {
    return { core: text, trail: '' }
  }
  return { core: match[1], trail: match[2] }
}
