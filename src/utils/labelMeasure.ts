export const LABEL_WIDTH_MM = 25

/** 屏幕像素转 mm（96dpi） */
export function pxToMm(px: number): number {
  return (px / 96) * 25.4
}

export function formatLabelSizeMm(widthMm: number, heightMm: number): string {
  return `${widthMm.toFixed(1)}×${heightMm.toFixed(1)}mm`
}

export interface PreviewLabelHeights {
  sourceMm: number
  translatedMm: number
  pairedMm: number
}
