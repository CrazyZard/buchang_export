import type { FontRole } from './svgTextToPathsUtils'

/**
 * 可编辑 PDF 字体名（svg2pdf setFont / SVG font-family 须与 jsPDF getFontList 键一致）。
 * GO 用 PostScript 名 CenturyGothic（勿用带空格的 Century Gothic，否则 PDF 为 Century#20Gothic，AI 显示 Century Gothic*）。
 * FZ 用 FZLanTingHeiS-L-GB（jsPDF 仅 ASCII）；Illustrator 可从字体内读「方正兰亭细黑简体」。
 */
export const PDF_FONT_GO = 'CenturyGothic'
export const PDF_FONT_FZ = 'FZLanTingHeiS-L-GB'
export const PDF_FONT_ARIAL = 'Arial'

/** jsPDF addFont postScriptName / VFS 键（与 TTF 内建 PS 名一致） */
export const PDF_FONT_GO_VFS = 'CenturyGothic'
export const PDF_FONT_FZ_VFS = 'FZLTXIHJW--GB1-0'
export const PDF_FONT_ARIAL_VFS = 'ArialMT'

export const PDF_EMBEDDED_FONT_FAMILIES = new Set([
  PDF_FONT_GO,
  PDF_FONT_FZ,
  PDF_FONT_ARIAL,
  PDF_FONT_GO_VFS,
  PDF_FONT_FZ_VFS,
  PDF_FONT_ARIAL_VFS,
  'CenturyGothic',
  'ArialMT',
  '方正兰亭细黑简体',
])

/** VFS 键须与 addFont 第一参数（postScriptName）一致 */
export const PDF_FONT_VFS: Record<FontRole, string> = {
  latin: PDF_FONT_GO_VFS,
  zh: PDF_FONT_FZ_VFS,
  arabic: PDF_FONT_ARIAL_VFS,
}

export function pdfFontFamilyForRole(role: FontRole): string {
  switch (role) {
    case 'latin':
      return PDF_FONT_GO
    case 'zh':
      return PDF_FONT_FZ
    case 'arabic':
      return PDF_FONT_ARIAL
  }
}

export function formatSvgFontFamily(family: string): string {
  if (/[^a-zA-Z0-9 _-]/.test(family)) {
    return `'${family.replace(/'/g, "\\'")}'`
  }
  return family
}

export function svgFontFamilyForRole(role: FontRole): string {
  return formatSvgFontFamily(pdfFontFamilyForRole(role))
}

/** 将预览/CSS 字体名映射为已嵌入 PDF 字体名（单一 ASCII 族名，禁止 FZ,SimSun 回退栈） */
export function mapCssFontFamilyToPdfEmbedded(raw: string): string | null {
  const token = raw
    .replace(/['"]/g, '')
    .split(',')[0]
    .trim()
  if (!token) return null

  const lower = token.toLowerCase()
  if (
    lower === 'go' ||
    lower === 'centurygothic' ||
    lower === 'century gothic' ||
    (lower.includes('century') && lower.includes('gothic'))
  ) {
    return PDF_FONT_GO
  }
  if (
    lower === 'fz' ||
    lower.includes('fzltxihjw') ||
    lower.includes('fzlanth') ||
    lower.includes('lanting') ||
    lower.includes('方正') ||
    lower === 'simsun' ||
    lower === '宋体' ||
    lower === 'songti'
  ) {
    return PDF_FONT_FZ
  }
  if (lower === 'arial' || lower === 'arialmt' || lower === 'arabic') {
    return PDF_FONT_ARIAL
  }
  if (PDF_EMBEDDED_FONT_FAMILIES.has(token)) {
    return pdfFontFamilyForRole(
      token === PDF_FONT_GO_VFS || token === 'CenturyGothic'
        ? 'latin'
        : token === PDF_FONT_FZ_VFS ||
            token === PDF_FONT_FZ ||
            token === '方正兰亭细黑简体'
          ? 'zh'
          : 'arabic',
    )
  }
  return null
}
