import * as XLSX from 'xlsx'
import type { BatchLabelItem, CareSymbolKey, LabelData } from '../types'
import { ALL_CARE_SYMBOL_KEYS } from './careSymbols'
import { createEmptyComposition } from './labelDefaults'
import { applyCompositionPaste } from './parseCompositionPaste'

const SHEET_BATCH = '批量洗唛'

type BatchFieldKey =
  | 'index'
  | 'title'
  | 'compositionPaste'
  | 'dryCleanNote'
  | 'careAdvice'
  | 'madeIn'
  | 'productCode1'
  | 'productCode2'
  | 'careSymbols'

const HEADER_ALIASES: Record<string, BatchFieldKey> = {
  序号: 'index',
  编号: 'index',
  index: 'index',
  no: 'index',
  备注: 'title',
  名称: 'title',
  title: 'title',
  name: 'title',
  成分: 'compositionPaste',
  成分粘贴: 'compositionPaste',
  成分文本: 'compositionPaste',
  composition: 'compositionPaste',
  compositionpaste: 'compositionPaste',
  干洗说明: 'dryCleanNote',
  drycleannote: 'dryCleanNote',
  洗涤建议: 'careAdvice',
  careadvice: 'careAdvice',
  产地: 'madeIn',
  madein: 'madeIn',
  款号: 'productCode1',
  productcode1: 'productCode1',
  工厂代码: 'productCode2',
  productcode2: 'productCode2',
  洗护图标: 'careSymbols',
  caresymbols: 'careSymbols',
}

const EXAMPLE_COMPOSITION = `主面料：
大身面层：62.0%聚酯纤维38.0%棉
大身底层：94.2%聚酯纤维5.8%氨纶
腰拼接面料：100%棉
（配料除外）`

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function sheetToRows(sheet: XLSX.WorkSheet | undefined): string[][] {
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }).map((row) => row.map((cell) => String(cell ?? '').trim()))
}

function resolveSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet | undefined {
  if (workbook.Sheets[SHEET_BATCH]) return workbook.Sheets[SHEET_BATCH]
  const name = workbook.SheetNames[0]
  return name ? workbook.Sheets[name] : undefined
}

function mapHeaderRow(row: string[]): Map<number, BatchFieldKey> {
  const mapping = new Map<number, BatchFieldKey>()
  row.forEach((cell, index) => {
    const key = HEADER_ALIASES[normalizeHeader(cell)]
    if (key) mapping.set(index, key)
  })
  return mapping
}

function cloneLabelDataBase(base: LabelData): LabelData {
  return {
    ...base,
    composition: createEmptyComposition(),
    extendedComposition: undefined,
    careSymbols: [...base.careSymbols],
  }
}

function parseCareSymbols(raw: string): CareSymbolKey[] | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const keys = trimmed
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean) as CareSymbolKey[]
  const valid = keys.filter((key) => ALL_CARE_SYMBOL_KEYS.includes(key))
  return valid.length > 0 ? valid : undefined
}

function rowHasContent(values: string[]) {
  return values.some((value) => value.trim())
}

function buildLabelDataFromRow(
  values: string[],
  mapping: Map<number, BatchFieldKey>,
  base: LabelData,
): { labelData: LabelData; title?: string; indexText?: string } | null {
  if (!rowHasContent(values)) return null

  let labelData = cloneLabelDataBase(base)
  let title: string | undefined
  let indexText: string | undefined
  let compositionPaste = ''

  mapping.forEach((field, colIndex) => {
    const value = values[colIndex]?.trim() ?? ''
    if (!value) return

    switch (field) {
      case 'index':
        indexText = value
        break
      case 'title':
        title = value
        break
      case 'compositionPaste':
        compositionPaste = value
        break
      case 'dryCleanNote':
        labelData.dryCleanNote = value
        break
      case 'careAdvice':
        labelData.careAdvice = value
        break
      case 'madeIn':
        labelData.madeIn = value
        break
      case 'productCode1':
        labelData.productCode1 = value
        break
      case 'productCode2':
        labelData.productCode2 = value
        break
      case 'careSymbols': {
        const symbols = parseCareSymbols(value)
        if (symbols) labelData.careSymbols = symbols
        break
      }
    }
  })

  if (compositionPaste.trim()) {
    labelData = applyCompositionPaste(labelData, compositionPaste)
  }

  const hasComposition =
    Object.values(labelData.composition).some((items) => items.length > 0) ||
    (labelData.extendedComposition?.lines.length ?? 0) > 0

  const hasMeta =
    hasComposition ||
    !!labelData.productCode1.trim() ||
    !!labelData.productCode2.trim() ||
    !!title ||
    !!indexText

  if (!hasMeta) return null

  if (!title) {
    title =
      labelData.productCode1.trim() ||
      indexText ||
      undefined
  }

  return { labelData, title, indexText }
}

export function parseBatchExcel(buffer: ArrayBuffer, base: LabelData): BatchLabelItem[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = resolveSheet(workbook)
  if (!sheet) throw new Error('Excel 中没有可读取的工作表')

  const rows = sheetToRows(sheet)
  if (rows.length < 2) throw new Error('批量 Excel 至少需要表头行和一行数据')

  const mapping = mapHeaderRow(rows[0])
  if (mapping.size === 0) {
    throw new Error('未识别表头，请使用「下载批量模板」或包含「成分」列的表头')
  }

  const hasCompositionCol = [...mapping.values()].includes('compositionPaste')
  if (!hasCompositionCol) {
    throw new Error('批量 Excel 需包含「成分」或「成分粘贴」列')
  }

  const items: BatchLabelItem[] = []
  let autoIndex = 0

  for (let i = 1; i < rows.length; i++) {
    const parsed = buildLabelDataFromRow(rows[i], mapping, base)
    if (!parsed) continue

    autoIndex += 1
    const index = Number(parsed.indexText) || autoIndex
    items.push({
      id: `batch-${index}-${crypto.randomUUID().slice(0, 8)}`,
      index,
      title: parsed.title,
      labelData: parsed.labelData,
    })
  }

  if (items.length === 0) {
    throw new Error('未解析到有效数据行，请检查「成分」列是否填写')
  }

  return items
}

export async function parseBatchExcelFile(file: File, base: LabelData): Promise<BatchLabelItem[]> {
  const buffer = await file.arrayBuffer()
  return parseBatchExcel(buffer, base)
}

export function exportBatchExcelTemplate(filename = '洗唛批量导入模板.xlsx'): void {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['序号', '备注', '成分', '干洗说明', '洗涤建议', '产地', '款号', '工厂代码', '洗护图标'],
      [
        1,
        '示例款',
        EXAMPLE_COMPOSITION,
        '不可干洗',
        '本商品建议单独洗涤，如有轻微褪色属正常现象，为保持衣服色泽，衣服不宜久浸。',
        '中国制造',
        '202426103123',
        '1227',
        'handWash,doNotBleach,dripFlatDrying,doNotIron',
      ],
    ]),
    SHEET_BATCH,
  )
  XLSX.writeFile(workbook, filename)
}
