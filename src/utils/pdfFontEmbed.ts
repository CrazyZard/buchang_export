import type { jsPDF } from 'jspdf'
import { PDF_FONT_ARIAL, PDF_FONT_FZ, PDF_FONT_GO, PDF_FONT_VFS } from './pdfFontFamilies'

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

/** 向 jsPDF 嵌入洗唛字体（CenturyGothic / FZLanTingHeiS-L-GB / ArialMT），供 svg2pdf 可编辑文字 */
export async function embedWashLabelPdfFonts(pdf: jsPDF): Promise<void> {
  if (embeddedPdf === pdf) return

  const [go, fz, ar] = await Promise.all([
    fetchFontBase64(`${BASE_URL}fonts/GO.TTF`),
    fetchFontBase64(`${BASE_URL}fonts/FZ.TTF`),
    fetchFontBase64(`${BASE_URL}fonts/ARIAL.TTF`),
  ])

  pdf.addFileToVFS(PDF_FONT_VFS.latin, go)
  pdf.addFont(PDF_FONT_VFS.latin, PDF_FONT_GO, 'normal', 'Identity-H')
  pdf.addFont(PDF_FONT_VFS.latin, 'Century Gothic', 'normal', 'Identity-H')
  pdf.addFont(PDF_FONT_VFS.latin, 'GO', 'normal', 'Identity-H')

  pdf.addFileToVFS(PDF_FONT_VFS.zh, fz)
  pdf.addFont(PDF_FONT_VFS.zh, PDF_FONT_FZ, 'normal', 'Identity-H')
  pdf.addFont(PDF_FONT_VFS.zh, 'FZ', 'normal', 'Identity-H')

  pdf.addFileToVFS(PDF_FONT_VFS.arabic, ar)
  pdf.addFont(PDF_FONT_VFS.arabic, PDF_FONT_ARIAL, 'normal', 'Identity-H')

  const list = pdf.getFontList()
  if (!list[PDF_FONT_GO] || !list[PDF_FONT_FZ] || !list[PDF_FONT_ARIAL]) {
    throw new Error('PDF 字体嵌入失败，可编辑导出不可用')
  }

  embeddedPdf = pdf
}

const ARABIC_CHAR_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/

function flattenPdfTextArg(text: unknown): string {
  if (typeof text === 'string') return text
  if (Array.isArray(text)) {
    return text
      .map((part) => (Array.isArray(part) ? String(part[0] ?? '') : String(part ?? '')))
      .join('')
  }
  return String(text ?? '')
}

function isMixedArabicExportLine(text: string): boolean {
  return /[0-9.]/.test(text) || text.includes('%')
}

function applyLiveArabicTextOptions(flat: string, opts: Record<string, unknown>): void {
  if (!ARABIC_CHAR_RE.test(flat)) return

  if (isMixedArabicExportLine(flat)) {
    // 整块混排（单文本框）：逻辑序，jsPDF 统一 bidi
    opts.isInputVisual = false
    opts.isOutputVisual = true
    opts.isInputRtl = true
    return
  }

  // 视觉序拆出的纯阿语短段
  opts.isInputVisual = true
  opts.isOutputVisual = true
  opts.isInputRtl = true
  opts.isOutputRtl = true
}

/**
 * 可编辑 PDF：关掉 processArabic（呈现形破坏 AI 编辑），并按行类型设置 bidi 选项。
 */
export function patchPdfLiveTextPipeline(pdf: jsPDF): () => void {
  const api = pdf as JsPdfWithArabicHook
  const savedProcessArabic = api.processArabic
  const savedText = api.text.bind(pdf)

  api.processArabic = ((arg: string | { text: unknown }) => arg) as NonNullable<
    JsPdfWithArabicHook['processArabic']
  >

  api.text = function patchedText(text, x, y, options, transform) {
    const opts = { ...(options as Record<string, unknown> | undefined) }
    applyLiveArabicTextOptions(flattenPdfTextArg(text), opts)
    return savedText(text, x, y, opts as never, transform)
  }

  return () => {
    if (savedProcessArabic) {
      api.processArabic = savedProcessArabic
    }
    api.text = savedText
  }
}
