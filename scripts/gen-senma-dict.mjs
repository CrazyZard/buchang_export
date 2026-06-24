/**
 * 生成 senma.xlsx 字典文件
 * 运行: node scripts/gen-senma-dict.mjs
 */
import * as XLSX from 'xlsx'
import { writeFileSync } from 'fs'

const header = ['中文', '英语', '印尼语', '俄语']

const rows = [
  header,
  // 成分
  ['成分', 'Composition', 'Komposisi', 'Состав'],
  ['面料', 'Fabric', 'Kain', 'Материал'],
  ['罗纹', 'Ribbing', 'Rib', 'Резинка'],
  ['里料', 'Lining', 'Lapisan', 'Подкладка'],
  ['填充物', 'Filling', 'Isian', 'Наполнитель'],
  // 洗涤说明
  ['洗涤说明', 'Washing instructions', 'Petunjuk pencucian', 'Инструкция по стирке'],
  ['不可干洗', 'Do not dry clean', 'Jangan dicuci kering', 'Не подвергать химчистке'],
  // 产地
  ['中国制造', 'Made in China', 'Buatan China', 'Сделано в Китае'],
  // 常用材料
  ['聚酯纤维', 'Polyester', 'Poliester', 'Полиэстер'],
  ['腈纶', 'Acrylic', 'Akrili', 'Акрил'],
  ['锦纶', 'Nylon', 'Nilon', 'Нейлон'],
  ['绵羊毛', 'Sheep wool', 'Wol domba', 'Овечья шерсть'],
  ['棉', 'Cotton', 'Katun', 'Хлопок'],
  ['氨纶', 'Spandex', 'Spandex', 'Спандекс'],
  ['粘纤', 'Viscose', 'Viscose', 'Вискоза'],
  ['亚麻', 'Linen', 'Linen', 'Лён'],
  // 百分比
  ['100%', '100%', '100%', '100%'],
  // 护理建议
  ['本商品建议单独洗涤，如有轻微褪色属正常现象，为保持衣服色泽，衣服不宜久浸。',
   'It is recommended to wash this item separately. Slight fading is normal. Do not soak for long to preserve color.',
   'Disarankan untuk mencuci item ini secara terpisah. Sedikit luntur adalah normal. Jangan direndam lama untuk menjaga warna.',
   'Рекомендуется стирать изделие отдельно. Небольшое выцветание — нормально. Не замачивать надолго для сохранения цвета.'],
]

const ws = XLSX.utils.aoa_to_sheet(rows)

// 设置列宽
ws['!cols'] = [
  { wch: 40 },  // 中文
  { wch: 50 },  // 英语
  { wch: 50 },  // 印尼语
  { wch: 55 },  // 俄语
]

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
writeFileSync('src/assets/senma.xlsx', buf)
console.log('✅ src/assets/senma.xlsx created')
