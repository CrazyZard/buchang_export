import * as XLSX from 'xlsx'
import type { CareSymbolKey, CompositionPart, LabelData } from '../types'
import type { TemplateId } from '../templates'
import { normalizeComposition } from './labelDefaults'
import {
  PROJECT_FILE_VERSION,
  type ProjectSnapshot,
  parseProjectSnapshot,
} from './projectData'

const SHEET_META = '项目'
const SHEET_FIELDS = '洗唛字段'
const SHEET_COMPOSITION = '成分'
const SHEET_EXTENDED = '扩展成分'
const SHEET_FOOTNOTES = '扩展脚注'
const SHEET_CARE = '洗护图标'
const SHEET_DOWN = '羽绒成分'
const SHEET_FILL = '充绒量'

function sheetToRows(sheet: XLSX.WorkSheet | undefined): string[][] {
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: '',
  }).map((row) => row.map((cell) => String(cell ?? '').trim()))
}

function rowsToMap(rows: string[][], keyIndex = 0, valueIndex = 1): Record<string, string> {
  const map: Record<string, string> = {}
  for (let i = 1; i < rows.length; i++) {
    const key = rows[i][keyIndex]?.trim()
    if (!key) continue
    map[key] = rows[i][valueIndex]?.trim() ?? ''
  }
  return map
}

function formatFileDate(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`
}

export function exportProjectToExcel(
  snapshot: ProjectSnapshot,
  templateId: TemplateId,
  filename?: string,
): void {
  const { labelData, selectedLanguages } = snapshot
  const workbook = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['字段', '值'],
      ['version', String(PROJECT_FILE_VERSION)],
      ['templateId', templateId],
      ['savedAt', snapshot.savedAt],
      ['selectedLanguages', selectedLanguages.join(',')],
    ]),
    SHEET_META,
  )

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['字段', '值'],
      ['dryCleanNote', labelData.dryCleanNote],
      ['careAdvice', labelData.careAdvice],
      ['madeIn', labelData.madeIn],
      ['productCode1', labelData.productCode1],
      ['productCode2', labelData.productCode2],
    ]),
    SHEET_FIELDS,
  )

  const compositionRows: (string | number)[][] = [['部位', '序号', '比例', '材质']]
  ;(['fabric', 'ribbing', 'lining', 'filling'] as CompositionPart[]).forEach((part) => {
    labelData.composition[part].forEach((item, index) => {
      compositionRows.push([part, index + 1, item.percentage, item.name])
    })
  })
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(compositionRows), SHEET_COMPOSITION)

  const extended = labelData.extendedComposition
  if (extended) {
    const extendedRows: (string | number)[][] = [['区块标题', '行标签', '序号', '比例', '材质']]
    extended.lines.forEach((line) => {
      line.items.forEach((item, index) => {
        extendedRows.push([
          extended.sectionTitle ?? '',
          line.label,
          index + 1,
          item.percentage,
          item.name,
        ])
      })
    })
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(extendedRows), SHEET_EXTENDED)

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['序号', '脚注'],
        ...extended.footnotes.map((note, index) => [index + 1, note]),
      ]),
      SHEET_FOOTNOTES,
    )
  }

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['序号', '图标'],
      ...labelData.careSymbols.map((symbol, index) => [index + 1, symbol]),
    ]),
    SHEET_CARE,
  )

  if (labelData.downJacket) {
    const down = labelData.downJacket
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['类型', '序号', '内容'],
        ...down.facingLines.map((line, index) => ['facing', index + 1, line]),
        ['lining', 1, down.liningLine],
        ...down.stuffingLines.map((line, index) => ['stuffing', index + 1, line]),
      ]),
      SHEET_DOWN,
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['尺码', '克重'],
        ...down.fillGrid.columns.map((col) => [col.size, col.weight]),
      ]),
      SHEET_FILL,
    )
  }

  XLSX.writeFile(workbook, filename ?? `洗唛项目_${formatFileDate(snapshot.savedAt)}.xlsx`)
}

function readLabelFields(rows: string[][]): Partial<LabelData> {
  const map = rowsToMap(rows)
  return {
    dryCleanNote: map.dryCleanNote ?? '',
    careAdvice: map.careAdvice ?? '',
    madeIn: map.madeIn ?? '',
    productCode1: map.productCode1 ?? '',
    productCode2: map.productCode2 ?? '',
  }
}

function readComposition(rows: string[][]): LabelData['composition'] {
  const composition = normalizeComposition(undefined)
  for (let i = 1; i < rows.length; i++) {
    const part = rows[i][0] as CompositionPart
    if (!composition[part]) continue
    composition[part].push({
      id: crypto.randomUUID(),
      percentage: rows[i][2] ?? '',
      name: rows[i][3] ?? '',
    })
  }
  return composition
}

function readExtended(rows: string[][], footnoteRows: string[][]): LabelData['extendedComposition'] {
  if (rows.length <= 1) return undefined

  const lineMap = new Map<string, { sectionTitle?: string; label: string; items: LabelData['composition']['fabric'] }>()

  for (let i = 1; i < rows.length; i++) {
    const sectionTitle = rows[i][0]?.trim() || undefined
    const label = rows[i][1]?.trim()
    if (!label) continue
    const key = `${sectionTitle ?? ''}::${label}`
    if (!lineMap.has(key)) {
      lineMap.set(key, { sectionTitle, label, items: [] })
    }
    lineMap.get(key)!.items.push({
      id: crypto.randomUUID(),
      percentage: rows[i][3] ?? '',
      name: rows[i][4] ?? '',
    })
  }

  const lines = [...lineMap.values()].map((line, index) => ({
    id: `ext-${index}`,
    label: line.label,
    items: line.items,
  }))

  const footnotes = footnoteRows.slice(1).map((row) => row[1]?.trim()).filter(Boolean)
  const sectionTitle = [...lineMap.values()][0]?.sectionTitle

  if (lines.length === 0 && footnotes.length === 0) return undefined

  return { sectionTitle, lines, footnotes }
}

export function importProjectFromExcel(
  buffer: ArrayBuffer,
  dictionary: ProjectSnapshot['dictionary'],
): ProjectSnapshot {
  const workbook = XLSX.read(buffer, { type: 'array' })

  const metaRows = sheetToRows(workbook.Sheets[SHEET_META])
  const meta = rowsToMap(metaRows)
  const version = Number(meta.version)
  if (version !== PROJECT_FILE_VERSION) {
    throw new Error(`不支持的项目版本：${meta.version}`)
  }

  const fields = readLabelFields(sheetToRows(workbook.Sheets[SHEET_FIELDS]))
  const composition = readComposition(sheetToRows(workbook.Sheets[SHEET_COMPOSITION]))
  const extendedComposition = readExtended(
    sheetToRows(workbook.Sheets[SHEET_EXTENDED]),
    sheetToRows(workbook.Sheets[SHEET_FOOTNOTES]),
  )

  const careRows = sheetToRows(workbook.Sheets[SHEET_CARE])
  const careSymbols = careRows.slice(1).map((row) => row[1]).filter(Boolean) as CareSymbolKey[]

  const labelData: LabelData = {
    composition,
    dryCleanNote: fields.dryCleanNote ?? '',
    careAdvice: fields.careAdvice ?? '',
    madeIn: fields.madeIn ?? '',
    productCode1: fields.productCode1 ?? '',
    productCode2: fields.productCode2 ?? '',
    careSymbols,
    extendedComposition,
  }

  const selectedLanguages = (meta.selectedLanguages ?? '')
    .split(',')
    .map((lang) => lang.trim())
    .filter(Boolean)

  return {
    version: PROJECT_FILE_VERSION,
    savedAt: meta.savedAt || new Date().toISOString(),
    templateId: meta.templateId as TemplateId | undefined,
    labelData,
    selectedLanguages: selectedLanguages.length > 0 ? selectedLanguages : dictionary.languages,
    dictionary,
  }
}

export async function importProjectFile(
  file: File,
  dictionary: ProjectSnapshot['dictionary'],
): Promise<ProjectSnapshot> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buffer = await file.arrayBuffer()
    return importProjectFromExcel(buffer, dictionary)
  }

  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('项目文件不是有效的 Excel 或 JSON')
  }
  return parseProjectSnapshot(parsed)
}
