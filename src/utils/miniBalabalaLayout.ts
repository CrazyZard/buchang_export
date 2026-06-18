/** 迷你巴拉：将洗涤建议按中文逗号拆成多行居中显示 */
export function splitCareAdviceLines(text: string): string[] {
  return text
    .replace(/。$/u, '')
    .split(/[，,]/u)
    .map((line) => line.trim())
    .filter(Boolean)
}
