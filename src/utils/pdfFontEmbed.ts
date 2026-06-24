import type { jsPDF } from 'jspdf'
import { PDF_FONT_ARIAL, PDF_FONT_FZ, PDF_FONT_GO, PDF_FONT_MISANS, PDF_FONT_VFS, PDF_FONT_MISANS_VFS } from './pdfFontFamilies'
import { isMixedArabicExportLine } from './arabicTextExport'

const BASE_URL = import.meta.env?.BASE_URL ?? '/'

type JsPdfWithArabicHook = jsPDF & {
  processArabic?: (arg: string | { text: unknown }) => string | { text: unknown }
  text: jsPDF['text']
}

async function fetchFontBase64(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`字体加载失败: ${url}`)
  const buffer = await response.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

let embeddedPdf: jsPDF | null = null

export function resetEmbeddedPdfFontCache(): void {
  embeddedPdf = null
}

/** 向 jsPDF 嵌入洗唛字体（CenturyGothic / FZLTXIHJW--GB1-0 / ArialMT），供 svg2pdf 可编辑文字 */
export async function embedWashLabelPdfFonts(pdf: jsPDF): Promise<void> {
  if (embeddedPdf === pdf) return

  const [go, fz, ar, misans] = await Promise.all([
    fetchFontBase64(`${BASE_URL}fonts/GO.TTF`),
    fetchFontBase64(`${BASE_URL}fonts/FZ.TTF`),
    fetchFontBase64(`${BASE_URL}fonts/ARIAL.TTF`),
    fetchFontBase64(`${BASE_URL}fonts/MiSans-Regular.ttf`).catch(() => null),
  ])

  pdf.addFileToVFS(PDF_FONT_VFS.latin, go)
  pdf.addFont(PDF_FONT_VFS.latin, PDF_FONT_GO, 'normal', 'Identity-H')
  pdf.addFont(PDF_FONT_VFS.latin, 'Century Gothic', 'normal', 'Identity-H')
  pdf.addFont(PDF_FONT_VFS.latin, 'GO', 'normal', 'Identity-H')

  pdf.addFileToVFS(PDF_FONT_VFS.zh, fz)
  pdf.addFont(PDF_FONT_VFS.zh, PDF_FONT_FZ, 'normal', 'Identity-H')
  pdf.addFont(PDF_FONT_VFS.zh, 'FZLanTingHeiS-L-GB', 'normal', 'Identity-H')
  pdf.addFont(PDF_FONT_VFS.zh, 'FZ', 'normal', 'Identity-H')
  // 勿用 TTF 内中文显示名（如「方正兰亭细黑简体」）作 addFont 别名 —— jsPDF Name 仅接受 ASCII；
  // AI 仍会从嵌入字体的 name 表显示中文族名。

  pdf.addFileToVFS(PDF_FONT_VFS.arabic, ar)
  pdf.addFont(PDF_FONT_VFS.arabic, PDF_FONT_ARIAL, 'normal', 'Identity-H')
  pdf.addFont(PDF_FONT_VFS.arabic, 'ARIAL', 'normal', 'Identity-H')

  if (misans) {
    pdf.addFileToVFS(PDF_FONT_MISANS_VFS, misans)
    pdf.addFont(PDF_FONT_MISANS_VFS, PDF_FONT_MISANS, 'normal', 'Identity-H')
    pdf.addFont(PDF_FONT_MISANS_VFS, 'MiSans-Regular', 'normal', 'Identity-H')
  }

  const list = pdf.getFontList()
  if (!list[PDF_FONT_GO] || !list[PDF_FONT_FZ] || !list[PDF_FONT_ARIAL]) {
    throw new Error('PDF 字体嵌入失败，可编辑导出不可用')
  }

  embeddedPdf = pdf
}

const ARABIC_CHAR_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/
const ARABIC_PRESENTATION_RE = /[\ufb50-\ufdff\ufe70-\ufeff]/

function flattenPdfTextArg(text: unknown): string {
  if (typeof text === 'string') return text
  if (Array.isArray(text)) {
    return text
      .map((part) => (Array.isArray(part) ? String(part[0] ?? '') : String(part ?? '')))
      .join('')
  }
  return String(text ?? '')
}

function applyLiveArabicTextOptions(flat: string, opts: Record<string, unknown>): void {
  if (!ARABIC_CHAR_RE.test(flat) && !ARABIC_PRESENTATION_RE.test(flat)) return

  // 呈现形 + isInputVisual 会让 jsPDF 二次 bidi → PDF 空白；live 导出应写逻辑序
  if (ARABIC_PRESENTATION_RE.test(flat)) {
    opts.isInputVisual = true
    opts.isOutputVisual = true
    return
  }

  if (isMixedArabicExportLine(flat)) {
    opts.isInputVisual = true
    opts.isOutputVisual = true
    opts.isInputRtl = true
    opts.isOutputRtl = true
    return
  }

  opts.isInputVisual = false
  opts.isOutputVisual = true
  opts.isInputRtl = true
}

/**
 * 可编辑 PDF：关掉 processArabic（呈现形破坏 AI 编辑），并按行类型设置 bidi 选项。
 */
export function patchPdfLiveTextPipeline(pdf: jsPDF): () => void {
  const api = pdf as JsPdfWithArabicHook
  const savedProcessArabic = api.processArabic
  const savedText = api.text

  api.processArabic = ((arg: string | { text: unknown }) => arg) as NonNullable<
    JsPdfWithArabicHook['processArabic']
  >

  api.text = function patchedText(this: jsPDF, text, x, y, options, transform) {
    const opts = { ...(options as Record<string, unknown> | undefined) }
    applyLiveArabicTextOptions(flattenPdfTextArg(text), opts)
    return savedText.call(this, text, x, y, opts as never, transform)
  }

  return () => {
    if (savedProcessArabic) {
      api.processArabic = savedProcessArabic
    }
    api.text = savedText
  }
}
