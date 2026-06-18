import type { CompositionPart, LabelData } from '../types'
import { COMPOSITION_PART_LABELS } from '../types'
import balaLogoSvg from '../assets/balaLogo'
import balabalaDictUrl from '../assets/balabala.xlsx?url'
import {
  createBalabalaLabelData,
  createBalaDownLabelData,
  createMiniBalabalaLabelData,
} from '../utils/labelDefaults'

export type TemplateId = 'balabala' | 'mini-balabala' | 'bala-prem' | 'bala-down'

export type CompositionMode = 'standard' | 'down-jacket'

export type CareLayoutMode = 'standard' | 'mini-centered'

/** 翻译区阿语成分块是否显示上下黑色实线 */
export type ArabicBlockBorder = 'solid' | 'none'

export interface WashLabelTemplateLayout {
  /** 折边线上方空白高度 */
  headSeamMm: number
  /** 洗唛预览是否显示品牌 Logo */
  showBrandLogo: boolean
  /** 洗唛内容区最大高度（mm） */
  labelHeightMm?: number
  /** 中文洗涤区排版 */
  careLayout?: CareLayoutMode
  /** 翻译出稿：阿语成分块上下边框 */
  arabicBlockBorder?: ArabicBlockBorder
  /** 翻译成分排版：auto 按成分条数自动选择；inline-wrap 同部位拼接；默认每材质一行 */
  translatedCompositionLayout?: 'per-material-line' | 'inline-wrap' | 'auto'
  /** 拼接模式下单行字符预算，超出则在材质单元之间换行 */
  translatedCompositionLineChars?: number
}

export interface WashLabelTemplate {
  id: TemplateId
  title: string
  description: string
  dictionaryUrl: string
  dictionaryName: string
  /** 品牌 Logo（内联 SVG，矢量） */
  logoSvg: string
  logoAlt: string
  layout: WashLabelTemplateLayout
  compositionMode: CompositionMode
  /** 标准成分模式下展示/编辑的部位顺序 */
  compositionParts: CompositionPart[]
  /** 无成分数据时不展示（预览与编辑区隐藏，可手动添加） */
  optionalCompositionParts?: CompositionPart[]
  /** 必填成分部位，编辑区始终展示且至少保留一行 */
  requiredCompositionParts?: CompositionPart[]
  createDefaultLabelData: () => LabelData
}

export function resolveCompositionParts(
  template: WashLabelTemplate,
): { key: CompositionPart; label: string }[] {
  return template.compositionParts.map((key) => ({
    key,
    label: COMPOSITION_PART_LABELS[key],
  }))
}

export const WASH_LABEL_TEMPLATES: WashLabelTemplate[] = [
  {
    id: 'balabala',
    title: '巴拉',
    description: '巴拉 · 25×54mm',
    dictionaryUrl: balabalaDictUrl,
    dictionaryName: 'balabala.xlsx',
    logoSvg: balaLogoSvg,
    logoAlt: 'balabala',
    layout: {
      headSeamMm: 8,
      showBrandLogo: true,
      labelHeightMm: 54,
      arabicBlockBorder: 'solid',
      translatedCompositionLayout: 'auto',
      translatedCompositionLineChars: 24,
    },
    compositionMode: 'standard',
    compositionParts: ['fabric', 'ribbing', 'lining', 'filling'],
    optionalCompositionParts: ['fabric', 'ribbing', 'lining', 'filling'],
    createDefaultLabelData: createBalabalaLabelData,
  },
  {
    id: 'mini-balabala',
    title: '迷你巴拉',
    description: '迷你巴拉 · 25×56mm',
    dictionaryUrl: balabalaDictUrl,
    dictionaryName: 'balabala.xlsx',
    logoSvg: balaLogoSvg,
    logoAlt: '迷你巴拉',
    layout: {
      headSeamMm: 10,
      showBrandLogo: false,
      labelHeightMm: 56,
      careLayout: 'mini-centered',
      arabicBlockBorder: 'none',
    },
    compositionMode: 'standard',
    compositionParts: ['fabric', 'lining'],
    createDefaultLabelData: createMiniBalabalaLabelData,
  },
  {
    id: 'bala-prem',
    title: 'bala-prem',
    description: 'bala-prem 洗唛',
    dictionaryUrl: balabalaDictUrl,
    dictionaryName: 'balabala.xlsx',
    logoSvg: balaLogoSvg,
    logoAlt: 'bala-prem',
    layout: {
      headSeamMm: 8,
      showBrandLogo: true,
      arabicBlockBorder: 'solid',
    },
    compositionMode: 'standard',
    compositionParts: ['fabric', 'ribbing'],
    createDefaultLabelData: createBalabalaLabelData,
  },
  {
    id: 'bala-down',
    title: 'bala-羽绒',
    description: '巴拉羽绒 · 25×70mm',
    dictionaryUrl: balabalaDictUrl,
    dictionaryName: 'balabala.xlsx',
    logoSvg: balaLogoSvg,
    logoAlt: 'balabala',
    layout: { headSeamMm: 10, showBrandLogo: true, labelHeightMm: 70, arabicBlockBorder: 'solid' },
    compositionMode: 'down-jacket',
    compositionParts: ['fabric', 'ribbing'],
    createDefaultLabelData: createBalaDownLabelData,
  },
]

export function getTemplate(id: TemplateId): WashLabelTemplate {
  const template = WASH_LABEL_TEMPLATES.find((item) => item.id === id)
  if (!template) {
    throw new Error(`Unknown template: ${id}`)
  }
  return template
}
