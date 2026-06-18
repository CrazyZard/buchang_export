import * as XLSX from 'xlsx'
import type { Dictionary } from '../types'
import balabalaUrl from '../assets/balabala.xlsx?url'

/** 简体 UI 与 Excel 繁体/异体词条对照 */
const CHINESE_ALIASES: Record<string, string[]> = {
  成分: ['成份'],
  成份: ['成分'],
  '本商品建议单独洗涤，如有轻微褪色属正常现象，为保持衣服色泽，衣服不宜久浸。': [
    '本商品建议单独洗涤，如有轻微褪色属正常现象，为保持衣服色泽，衣服不宜久浸',
  ],
  '本商品建议单独洗涤，如有轻微褪色属正常现象，为保持衣服色泽，衣服不宜久浸': [
    '本商品建议单独洗涤，如有轻微褪色属正常现象，为保持衣服色泽，衣服不宜久浸。',
  ],
}

const WHOLE_PAREN_RE = /^[（(]([^（）()]+)[）)]$/
const INLINE_PAREN_RE = /[（(]([^（）()]+)[）)]/g
const HAS_PAREN_RE = /[（(][^（）()]+[）)]/

function lookupTranslation(
  dictionary: Dictionary,
  chinese: string,
  language: string,
): string | null {
  const trimmed = chinese.trim()
  if (!trimmed) return null

  const keys = new Set<string>([
    trimmed,
    `（${trimmed}）`,
    `(${trimmed})`,
    ...(CHINESE_ALIASES[trimmed] ?? []),
    ...(CHINESE_ALIASES[`（${trimmed}）`] ?? []),
  ])

  for (const key of keys) {
    const direct = dictionary.entries[key]?.[language]?.trim()
    if (direct) return direct
    for (const alias of CHINESE_ALIASES[key] ?? []) {
      const value = dictionary.entries[alias]?.[language]?.trim()
      if (value) return value
    }
  }

  return null
}

function translatePlain(dictionary: Dictionary, chinese: string, language: string): string {
  const trimmed = chinese.trim()
  if (!trimmed) return ''
  return lookupTranslation(dictionary, trimmed, language) ?? `[${trimmed}]`
}

/** 译文统一为半角括号包裹 */
function wrapParenTranslation(translated: string): string {
  const inner = translated.trim().replace(/^[（(]+|[）)]+$/g, '').trim()
  return inner ? `(${inner})` : '()'
}

export function translateText(
  dictionary: Dictionary,
  chinese: string,
  language: string,
): string {
  const trimmed = chinese.trim()
  if (!trimmed) return ''

  const wholeParen = trimmed.match(WHOLE_PAREN_RE)
  if (wholeParen) {
    const inner = wholeParen[1].trim()
    const translated = lookupTranslation(dictionary, inner, language)
    if (translated) return wrapParenTranslation(translated)
    return `[${inner}]`
  }

  if (HAS_PAREN_RE.test(trimmed)) {
    let result = ''
    let lastIndex = 0
    INLINE_PAREN_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = INLINE_PAREN_RE.exec(trimmed)) !== null) {
      const before = trimmed.slice(lastIndex, match.index)
      if (before) result += translatePlain(dictionary, before, language)

      const inner = match[1].trim()
      const translated = lookupTranslation(dictionary, inner, language)
      result += translated ? wrapParenTranslation(translated) : `[${inner}]`
      lastIndex = INLINE_PAREN_RE.lastIndex
    }

    const tail = trimmed.slice(lastIndex)
    if (tail) result += translatePlain(dictionary, tail, language)
    return result
  }

  return translatePlain(dictionary, trimmed, language)
}

/** 按字典列顺序，解析当前勾选的出稿语言 */
export function resolveOutputLanguages(
  dictionary: Dictionary,
  selected?: string[],
): string[] {
  if (!selected) return [...dictionary.languages]
  return dictionary.languages.filter((lang) => selected.includes(lang))
}

export function parseDictionaryFromExcel(buffer: ArrayBuffer): Dictionary {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: '',
  })

  if (rows.length < 2) {
    throw new Error('Excel 至少需要表头行和一行数据')
  }

  const headerRow = rows[0].map((cell) => String(cell).trim())
  const chineseIndex = headerRow.findIndex(
    (h) => h === '中文' || h.toLowerCase() === 'chinese' || h === '简体',
  )

  if (chineseIndex === -1) {
    throw new Error('未找到「中文」列，请确保第一列或表头包含「中文」')
  }

  const languages: string[] = []
  for (let i = chineseIndex + 1; i < headerRow.length; i++) {
    const name = headerRow[i]
    if (!name) break
    if (name === '中文' || name.toLowerCase() === 'chinese' || name === '简体') break
    languages.push(name)
  }

  if (languages.length === 0) {
    throw new Error('未找到外文列，请在「中文」列后添加 English、英文、Russian 等列')
  }

  const entries: Dictionary['entries'] = {}

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const chinese = String(row[chineseIndex] ?? '').trim()
    if (!chinese) continue

    entries[chinese] = {}
    for (const lang of languages) {
      const langIndex = headerRow.indexOf(lang)
      entries[chinese][lang] = String(row[langIndex] ?? '').trim()
    }
  }

  for (const [key, aliases] of Object.entries(CHINESE_ALIASES)) {
    if (entries[key]) continue
    for (const alias of aliases) {
      if (entries[alias]) {
        entries[key] = { ...entries[alias] }
        break
      }
    }
  }

  return { languages, entries }
}

export async function loadDictionaryFromUrl(url: string): Promise<Dictionary> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`无法加载字典: ${url}`)
  }
  const buffer = await response.arrayBuffer()
  return parseDictionaryFromExcel(buffer)
}

export async function loadBundledDictionary(): Promise<Dictionary> {
  return loadDictionaryFromUrl(balabalaUrl)
}

export function isRtlLanguage(language: string): boolean {
  const normalized = language.toLowerCase()
  return (
    normalized.includes('arabic') ||
    normalized.includes('arabi') ||
    language.includes('阿语') ||
    language.includes('阿拉伯')
  )
}

export function isRussianLanguage(language: string): boolean {
  const normalized = language.toLowerCase()
  return normalized.includes('russian') || language.includes('俄')
}

export function isEnglishLanguage(language: string): boolean {
  const normalized = language.toLowerCase()
  return normalized.includes('english') || language.includes('英文')
}

export function getLanguageFontClass(language: string): 'label-font-latin' | 'label-font-arabic' {
  return isRtlLanguage(language) ? 'label-font-arabic' : 'label-font-latin'
}

export function languageFontFamily(language: string): string {
  return getLanguageFontClass(language) === 'label-font-arabic'
    ? "'ARIAL', Arial, sans-serif"
    : "'GO', sans-serif"
}

export function exportDictionaryTemplate(): void {
  const data = [
    ['中文', '英文', '俄文', '阿语译文'],
    ['成分', 'Composition:', 'Состав:', 'المكونات:'],
    ['面料', 'Fabric:', 'материал:', 'النسيج:'],
    ['罗纹', 'Ribbing:', 'рисунок тюля:', 'قماش مضلع:'],
    ['里料', 'Lining:', 'материал подкладки:', 'البطانة:'],
    ['腈纶', 'Acrylic', 'нитрон', 'أكريليك'],
    ['棉', 'Cotton', 'хлопок', 'قطن'],
  ]

  const sheet = XLSX.utils.aoa_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '字典')
  XLSX.writeFile(workbook, '洗唛翻译字典模板.xlsx')
}
