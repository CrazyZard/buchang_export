import { ARABIC_RE, isDigitThenPercentPair, type TextFontRole } from './textScriptDetect'

export type ArabicPlacementSegment =
  | { kind: 'single'; content: string; role: TextFontRole }
  | { kind: 'digit-percent'; digits: string; percent: string }

/** 阿语 RTL 排版：数字与 % 合并为同一 LTR 单元，避免 %57.7 */
export function coalesceDigitPercentRuns(
  runs: Array<{ content: string; role: TextFontRole }>,
): ArabicPlacementSegment[] {
  const out: ArabicPlacementSegment[] = []
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i]
    const next = runs[i + 1]
    if (isDigitThenPercentPair(run, next)) {
      out.push({ kind: 'digit-percent', digits: run.content, percent: next!.content })
      i += 1
      continue
    }
    out.push({ kind: 'single', content: run.content, role: run.role })
  }
  return out
}

export const ARABIC_RENDER_OPTIONS = {
  script: 'arab',
  language: 'ARA',
  kerning: true,
} as const

/** 阿语 RTL 行末弱标点（ASCII/全角冒号等），导出转曲时需画在词左侧 */
const RTL_WEAK_TRAIL_PUNCT_RE = /^([\s\S]+?)([:：,，;；.．!?؟！]+)$/

/** 混排阿语行（含数字 / %） */
export function isMixedArabicExportLine(text: string): boolean {
  return /[0-9.]/.test(text) || text.includes('%') || text.includes('％')
}

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
