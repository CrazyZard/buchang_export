/**
 * 巴拉洗涤建议：完全按左侧输入原样显示，不自动插换行/补句号。
 * 仅当用户自己输入了换行符时，保留换行（配合 pre-line 展示）。
 */
export function formatBalabalaCareAdviceDisplay(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (trimmed.includes('\n')) return trimmed

  return null
}
