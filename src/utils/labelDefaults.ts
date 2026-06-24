import type { CompositionSection, DownFillColumn, DownFillGrid, LabelData } from '../types'

export function createMaterial(id: string, percentage: string, name: string) {
  return { id, percentage, name }
}

export function createEmptyComposition(): CompositionSection {
  return {
    fabric: [],
    ribbing: [],
    lining: [],
    filling: [],
  }
}

export function normalizeComposition(
  composition: Partial<CompositionSection> | undefined,
): CompositionSection {
  const base = createEmptyComposition()
  if (!composition) return base
  return {
    fabric: composition.fabric ?? base.fabric,
    ribbing: composition.ribbing ?? base.ribbing,
    lining: composition.lining ?? base.lining,
    filling: composition.filling ?? base.filling,
  }
}
function createDownFillColumn(size: string, weight: string): DownFillColumn {
  return { id: `col-${size}`, size, weight }
}

export function createDefaultDownFillGrid(): DownFillGrid {
  return {
    title: '充绒量 (单位：克)',
    columns: [
      createDownFillColumn('110', '80'),
      createDownFillColumn('120', '91'),
      createDownFillColumn('130', '103'),
      createDownFillColumn('140', '115'),
      createDownFillColumn('150', '130'),
      createDownFillColumn('160', '147'),
      createDownFillColumn('165', '157'),
      createDownFillColumn('170', '168'),
      createDownFillColumn('175', '180'),
    ],
  }
}

/** 森马羽绒默认充绒量表格（7列，尺码含多行） */
export function createSenmaDownFillGrid(): DownFillGrid {
  return {
    title: '',
    columns: [
      createDownFillColumn(
        'CN:XS\n150/76A\nEUR:XXS\nUS:XXS',
        '99.7',
      ),
      createDownFillColumn(
        'CN:S\n155/80A\nEUR:XS\nUS:XS',
        '105',
      ),
      createDownFillColumn(
        'CN:M\n160/84A\nEUR:S\nUS:S',
        '110',
      ),
      createDownFillColumn(
        'CN:L\n165/88A\nEUR:M\nUS:M',
        '118',
      ),
      createDownFillColumn(
        'CN:XL\n170/92A\nEUR:L\nUS:L',
        '126',
      ),
      createDownFillColumn(
        'CN:XXL\n175/96A\nEUR:XL\nUS:XL',
        '135',
      ),
      createDownFillColumn(
        'CN:XXXL\n180/100A\nEUR:XXL\nUS:XXL',
        '145',
      ),
    ],
  }
}

/** 巴拉模板默认数据（25×54mm 标准样稿） */
export function createBalabalaLabelData(): LabelData {
  return {
    composition: {
      fabric: [],
      ribbing: [],
      lining: [],
      filling: [],
    },
    dryCleanNote: '不可干洗',
    careAdvice:
      '本商品建议单独洗涤，如有轻微褪色属正常现象，为保持衣服色泽，衣服不宜久浸。',
    madeIn: '中国制造',
    productCode1: '202426103123',
    productCode2: '1227',
    careSymbols: ['handWash', 'doNotBleach', 'dripFlatDrying', 'doNotIron'],
  }
}

/** 迷你巴拉模板默认数据（25×56mm，参考出稿样） */
export function createMiniBalabalaLabelData(): LabelData {
  return {
    composition: {
      fabric: [createMaterial('f1', '100%', '聚酯纤维')],
      ribbing: [],
      lining: [createMaterial('l1', '100%', '聚酯纤维')],
      filling: [],
    },
    dryCleanNote: '不可干洗',
    careAdvice:
      '本商品建议单独洗涤，如有轻微褪色属正常现象，为保持衣服色泽衣服不宜久浸。',
    madeIn: '中国制造',
    productCode1: '231426101206',
    productCode2: '1121',
    careSymbols: ['handWash', 'doNotBleach', 'lineDryShade', 'ironLowTemp'],
  }
}

/** bala-羽绒模板默认数据（25×70mm） */
export function createBalaDownLabelData(): LabelData {
  return {
    composition: {
      fabric: [],
      ribbing: [],
      lining: [],
      filling: [],
    },
    downJacket: {
      facingLines: ['面层100%聚酯纤维', '底层100%聚酯纤维', '(非纤维物质除外)'],
      liningLine: '100%聚酯纤维',
      stuffingLines: ['大身/袖子  灰鸭绒', '绒子含量  80%', '其余部位  100%聚酯纤维'],
      fillGrid: createDefaultDownFillGrid(),
    },
    dryCleanNote: '不可干洗',
    careAdvice:
      '本商品建议单独洗涤，如有轻微褪色属正常现象，为保持衣服色泽，衣服不宜久浸。',
    madeIn: '中国制造',
    productCode1: '202426107118',
    productCode2: '7698',
    careSymbols: ['handWash', 'doNotBleach', 'lineDryShade', 'doNotIron'],
  }
}

/** 森马常规模板默认数据（25×90mm） */
export function createSenmaRegularLabelData(): LabelData {
  return {
    composition: {
      fabric: [],
      ribbing: [],
      lining: [],
      filling: [],
    },
    dryCleanNote: '',
    careAdvice:
      '本商品建议单独洗涤，如有轻微褪色属正常现象，为保持衣服色泽，衣服不宜久浸。',
    madeIn: '中国制造',
    productCode1: '',
    productCode2: '',
    careSymbols: ['handWash', 'doNotBleach', 'lineDryingInShade', 'doNotIron', 'doNotDryClean'],
  }
}

/** 森马羽绒模板默认数据（32×120mm） */
export function createSenmaDownLabelData(): LabelData {
  return {
    composition: {
      fabric: [],
      ribbing: [],
      lining: [],
      filling: [],
    },
    downJacket: {
      facingLines: ['', '', ''],
      liningLine: '',
      stuffingLines: ['', '', ''],
      fillGrid: { title: '充绒量：(单位：克)', columns: [] },
    },
    dryCleanNote: '',
    careAdvice:
      '本商品建议单独洗涤，如有轻微褪色属正常现象，为保持衣服色泽，衣服不宜久浸。',
    madeIn: '中国制造',
    productCode1: '',
    productCode2: '',
    careSymbols: ['handWash', 'doNotBleach', 'lineDryingInShade', 'doNotIron', 'doNotDryClean'],
  }
}

/** 青蛙模板默认数据（25×54mm） */
export function createFrogLabelData(): LabelData {
  return {
    composition: {
      fabric: [],
      ribbing: [],
      lining: [],
      filling: [],
    },
    dryCleanNote: '不可干洗',
    careAdvice:
      '不可干洗，反底轻柔手洗，本商品建议深色易褪色的请单独洗涤，如有轻微褪色属正常现象，为保持产品色泽，产品不宜久浸，少量起球属正常现象请小心维护。',
    madeIn: '中国制造',
    productCode1: '102605',
    productCode2: 'FFP33E4065',
    careSymbols: ['handWash', 'doNotBleach', 'dripFlatDrying', 'doNotIron', 'doNotDryClean'],
  }
}

/** 青蛙羽绒模板默认数据（32×120mm） */
export function createFrogDownLabelData(): LabelData {
  return {
    composition: {
      fabric: [],
      ribbing: [],
      lining: [],
      filling: [],
    },
    downJacket: {
      facingLines: ['', '', ''],
      liningLine: '',
      stuffingLines: ['', ''],
      fillGrid: { title: '充绒量：(单位：克)', columns: [] },
    },
    dryCleanNote: '不可干洗',
    careAdvice:
      '不可干洗，反底轻柔手洗，本商品建议深色易褪色的请单独洗涤，如有轻微褪色属正常现象，为保持产品色泽，产品不宜久浸，少量起球属正常现象请小心维护。',
    madeIn: '中国制造',
    productCode1: '102556',
    productCode2: 'FFP44F6181',
    careSymbols: ['handWash', 'doNotBleach', 'dripFlatDrying', 'doNotIron', 'doNotDryClean'],
  }
}

export const frogCareAdviceTitleEn = 'Washing maintenance instructions'

/** 青蛙模板：英文翻译预览正文 */
export const frogCareAdviceBodyEn =
  'Do not dry clean, Wash inside out gently by hand. Dark color easily faded, please wash separately, Slight color fading is normal, To keep product color, do not soak for a long time. Slight pilling is normal, please take care.'

export const defaultLabelData: LabelData = createBalabalaLabelData()

export const defaultSelectedLanguages = ['英文', '俄文', '阿语译文']

export const frogDefaultLanguages = ['英文']
