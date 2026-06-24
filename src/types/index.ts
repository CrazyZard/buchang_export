export interface MaterialItem {
  id: string
  percentage: string
  name: string
}

export interface ExtendedCompositionLine {
  id: string
  label: string
  /** 所属部位；缺省为主面料扩展行 */
  part?: CompositionPart
  items: MaterialItem[]
}

/** 主面料等多行描述性成分（粘贴导入） */
export interface ExtendedComposition {
  sectionTitle?: string
  lines: ExtendedCompositionLine[]
  footnotes: string[]
}

export interface CompositionSection {
  fabric: MaterialItem[]
  ribbing: MaterialItem[]
  lining: MaterialItem[]
  filling: MaterialItem[]
}

export interface LabelData {
  composition: CompositionSection
  /** 主面料等扩展成分行（粘贴导入） */
  extendedComposition?: ExtendedComposition
  dryCleanNote: string
  careAdvice: string
  madeIn: string
  productCode1: string
  productCode2: string
  careSymbols: CareSymbolKey[]
  /** 羽绒模板专用数据（充绒量表格等） */
  downJacket?: DownJacketComposition
}

/** 批量 Excel 解析后的一条洗唛 */
export interface BatchLabelItem {
  id: string
  index: number
  title?: string
  labelData: LabelData
}

export interface DownFillColumn {
  id: string
  size: string
  weight: string
}

export interface DownFillGrid {
  title: string
  columns: DownFillColumn[]
}

export interface DownJacketComposition {
  facingLines: string[]
  liningLine: string
  stuffingLines: string[]
  fillGrid: DownFillGrid
}

export type CareSymbolKey =
  | 'handWash'
  | 'doNotBleach'
  | 'lineDryShade'
  | 'lineDryingInShade'
  | 'dripFlatDrying'
  | 'ironLowTemp'
  | 'doNotIron'
  | 'doNotDryClean'

export type CompositionPart = keyof CompositionSection

export const COMPOSITION_PART_LABELS: Record<CompositionPart, string> = {
  fabric: '面料',
  ribbing: '罗纹',
  lining: '里料',
  filling: '填充物',
}

export interface Dictionary {
  languages: string[]
  entries: Record<string, Record<string, string>>
}

/** 迷你巴拉等默认编辑/预览部位（不含罗纹） */
export const COMPOSITION_PARTS: { key: CompositionPart; label: string }[] = [
  { key: 'fabric', label: COMPOSITION_PART_LABELS.fabric },
  { key: 'lining', label: COMPOSITION_PART_LABELS.lining },
]

export const FIXED_LABELS = {
  composition: '成分',
  washingInstructions: '洗涤说明',
} as const

export const DOWN_JACKET_LABELS = {
  facing: '面料/挂面',
  lining: '里料',
  stuffing: '填充物',
  fillGridTitle: '充绒量 (单位：克)',
} as const
