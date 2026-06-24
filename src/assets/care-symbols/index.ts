import type { CareSymbolKey, LabelData } from '../../types'
import { normalizeCareSymbolSvg } from '../../utils/normalizeCareSymbolSvg'
import doNotBleachSvg from './do-not-bleach.svg?raw'
import doNotDryCleanSvg from './do-not-dry-clean.svg?raw'
import doNotCleanLabelSvg from './do-not-clean.svg?raw'
import doNotIronSvg from './do-not-iron.svg?raw'
import dripFlatDryingSvg from './drip-flat-drying.svg?raw'
import handWashSvg from './hand-wash.svg?raw'
import ironLowTempSvg from './iron-low-temp.svg?raw'
import lineDryShadeSvg from './line-dry-shade.svg?raw'
import lineDryingInShadeSvg from './line-drying-in-the-shade.svg?raw'
import washingInstructionsLabelSvg from './washing-instructions.svg?raw'

export interface CareSymbolAutoMatch {
  field: keyof Pick<LabelData, 'dryCleanNote' | 'careAdvice'>
  includes: string
}

/** 洗护图标注册项（顺序即洗唛/选择器展示顺序） */
export interface CareSymbolDefinition {
  key: CareSymbolKey
  /** 文件名（不含扩展名），与 manifest.name 一致 */
  name: string
  label: string
  svg: string
  autoMatch?: CareSymbolAutoMatch
}

export interface CareSymbolAsset {
  label: string
  svg: string
  autoMatch?: CareSymbolAutoMatch
}

export const CARE_SYMBOL_DEFINITIONS: CareSymbolDefinition[] = [
  { key: 'handWash', name: 'hand-wash', label: '手洗', svg: normalizeCareSymbolSvg(handWashSvg) },
  { key: 'doNotBleach', name: 'do-not-bleach', label: '不可漂白', svg: normalizeCareSymbolSvg(doNotBleachSvg) },
  { key: 'lineDryShade', name: 'line-dry-shade', label: '阴凉处平摊晾干', svg: normalizeCareSymbolSvg(lineDryShadeSvg) },
  { key: 'lineDryingInShade', name: 'line-drying-in-the-shade', label: '阴凉处悬挂晾干', svg: normalizeCareSymbolSvg(lineDryingInShadeSvg) },
  { key: 'dripFlatDrying', name: 'drip-flat-drying', label: '平摊晾干', svg: normalizeCareSymbolSvg(dripFlatDryingSvg) },
  { key: 'ironLowTemp', name: 'iron-low-temp', label: '低温熨烫', svg: normalizeCareSymbolSvg(ironLowTempSvg) },
  { key: 'doNotIron', name: 'do-not-iron', label: '不可熨烫', svg: normalizeCareSymbolSvg(doNotIronSvg) },
  {
    key: 'doNotDryClean',
    name: 'do-not-dry-clean',
    label: '不可干洗',
    svg: normalizeCareSymbolSvg(doNotDryCleanSvg),
  },
]

export const CARE_SYMBOL_ASSETS: Record<CareSymbolKey, CareSymbolAsset> =
  Object.fromEntries(
    CARE_SYMBOL_DEFINITIONS.map(({ key, label, svg, autoMatch }) => [
      key,
      { label, svg, autoMatch },
    ]),
  ) as Record<CareSymbolKey, CareSymbolAsset>

/** 文件名 → key，供 manifest / 脚本对照 */
export const CARE_SYMBOL_NAME_TO_KEY: Record<string, CareSymbolKey> = Object.fromEntries(
  CARE_SYMBOL_DEFINITIONS.map(({ name, key }) => [name, key]),
)

/** 翻译稿固定英文图稿（替代字典文字） */
export const TRANSLATED_LABEL_GRAPHICS = {
  washingInstructions: washingInstructionsLabelSvg,
  doNotClean: doNotCleanLabelSvg,
} as const
