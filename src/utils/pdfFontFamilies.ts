import type { FontRole } from './svgTextToPathsUtils'

/**
 * 可编辑 PDF 字体名（svg2pdf setFont / SVG font-family 须与 jsPDF getFontList 键一致）。
 * GO：PostScript 名 CenturyGothic（勿用带空格的 Century Gothic）。
 * FZ：TTF PostScript 名 FZLTXIHJW--GB1-0（AI 从嵌入字体内显示「方正兰亭细黑简体」）。
 * 阿语：ArialMT（勿用 Arial —— svg2pdf 会把 arial 映射成 Helvetica；AI 显示 Arial）。
 */
export const PDF_FONT_GO = 'CenturyGothic'
export const PDF_FONT_FZ = 'FZLTXIHJW--GB1-0'
export const PDF_FONT_ARIAL = 'ArialMT'
export const PDF_FONT_MISANS = 'MiSans-Regular'

/** jsPDF addFont postScriptName / VFS 键（与 TTF 内建 PS 名一致） */
export const PDF_FONT_GO_VFS = 'CenturyGothic'
export const PDF_FONT_FZ_VFS = 'FZLTXIHJW--GB1-0'
export const PDF_FONT_ARIAL_VFS = 'ArialMT'
export const PDF_FONT_MISANS_VFS = 'MiSans-Regular'

export const PDF_EMBEDDED_FONT_FAMILIES = new Set([
  PDF_FONT_GO,
  PDF_FONT_FZ,
  PDF_FONT_ARIAL,
  PDF_FONT_MISANS,
  PDF_FONT_GO_VFS,
  PDF_FONT_FZ_VFS,
  PDF_FONT_ARIAL_VFS,
  PDF_FONT_MISANS_VFS,
  'CenturyGothic',
  'FZLanTingHeiS-L-GB',
  'FZ',
  'ARIAL',
  'MiSans-Regular',
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

export function svgFontFamilyForRole(role: FontRole, elementFamily?: string): string {
  if (elementFamily) {
    const elToken = elementFamily.replace(/['"]/g, '').split(',')[0].trim()
    if (elToken === PDF_FONT_MISANS || elToken === PDF_FONT_MISANS_VFS) {
      return formatSvgFontFamily(PDF_FONT_MISANS)
    }
  }
  return formatSvgFontFamily(pdfFontFamilyForRole(role))
}

/** 将预览/CSS 字体名映射为已嵌入 PDF 字体名（单一族名，禁止 FZ,SimSun 回退栈） */
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
    lower === 'fzlanthingheis-l-gb' ||
    lower === 'simsun' ||
    lower === '宋体' ||
    lower === 'songti'
  ) {
    return PDF_FONT_FZ
  }
  if (lower === 'arial' || lower === 'arialmt' || lower === 'arabic') {
    return PDF_FONT_ARIAL
  }
  if (
    lower === 'misans-regular' ||
    lower === 'misans' ||
    lower.includes('misans')
  ) {
    return PDF_FONT_MISANS
  }
  if (PDF_EMBEDDED_FONT_FAMILIES.has(token)) {
    return pdfFontFamilyForRole(
      token === PDF_FONT_GO_VFS || token === 'CenturyGothic'
        ? 'latin'
        : token === PDF_FONT_FZ_VFS ||
            token === 'FZLanTingHeiS-L-GB' ||
            token === 'FZ' ||
            token === '方正兰亭细黑简体'
          ? 'zh'
          : 'arabic',
    )
  }
  return null
}
