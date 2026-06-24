import { splitTextByFontRole } from './textScriptDetect'
import type { FontRole } from './svgTextToPathsUtils'
import {
  groupTspansByLine,
  INTRA_TEXT_LINE_Y_TOLERANCE,
  parseFontSize,
  parseLineHeight,
  parseCoord,
  readTextAnchorY as readSvgTextAnchorY,
  resolveFontForRole,
  measureAdvance,
} from './svgTextToPathsUtils'

const LIVE_DOMINANT_BASELINE = 'text-after-edge'
/** 25mm 洗唛宽约 94px（dom-to-svg 坐标），data-ex-right 缺失时用于自动折行 */
export const LIVE_LABEL_TEXT_WIDTH_PX = 94

/** .wash-label 右边距 1mm（padding: 0 1mm 1.2mm），避免阿语导出贴边 */
export const LIVE_LABEL_RIGHT_PADDING_PX = LIVE_LABEL_TEXT_WIDTH_PX / 25

/** 款号/工厂代码：在洗唛宽度内水平居中 */
export function resolveCenteredLineStartX(
  leftX: number,
  rightX: number,
  lineWidth: number,
): number {
  const left = Number.isFinite(leftX) ? leftX : 0
  let right = Number.isFinite(rightX) && rightX > left ? rightX : left + LIVE_LABEL_TEXT_WIDTH_PX
  const boxWidth = right - left
  if (lineWidth >= boxWidth || lineWidth <= 0) return left
  return left + (boxWidth - lineWidth) / 2
}

export function applyLiveDominantBaseline(textEl: SVGTextElement): void {
  textEl.setAttribute('dominant-baseline', LIVE_DOMINANT_BASELINE)
}

function readTextElementY(textEl: SVGTextElement): number {
  const tspan = textEl.querySelector('tspan')
  if (tspan?.hasAttribute('y')) return parseCoord(tspan.getAttribute('y'))
  return parseCoord(textEl.getAttribute('y'))
}

/** dom-to-svg 多 tspan / 多 text 折行：还原带 \\n 的全文与各行 y（text-after-edge） */
export function extractLiveTextLines(textEl: SVGTextElement): {
  content: string
  lineYs: number[]
} {
  const stored = textEl.getAttribute('data-ex-line-ys')
  if (stored) {
    const lineYs = stored.split(',').map((v) => parseCoord(v)).filter((y) => Number.isFinite(y))
    const content = textEl.textContent ?? ''
    if (lineYs.length > 0) {
      return { content, lineYs }
    }
  }

  const lineGroups = groupTspansByLine(textEl)
  if (lineGroups.length > 1) {
    return {
      content: lineGroups.map((line) => line.tspans.map((t) => t.textContent ?? '').join('')).join('\n'),
      lineYs: lineGroups.map((line) => line.y),
    }
  }

  const raw = textEl.textContent ?? ''
  const explicit = raw.split(/\r?\n/)
  const y = readTextElementY(textEl)
  if (explicit.length > 1) {
    return { content: raw, lineYs: explicit.map((_, index) => y + index * defaultLineStep(textEl)) }
  }

  return { content: raw, lineYs: [y] }
}

function defaultLineStep(textEl: SVGTextElement): number {
  const fontSize = parseFontSize(textEl.getAttribute('font-size'))
  return parseLineHeight(textEl.getAttribute('line-height'), fontSize)
}

export function normalizeLiveTextContent(textEl: SVGTextElement): void {
  const { content, lineYs } = extractLiveTextLines(textEl)
  if (!content) return

  const startX = parseCoord(textEl.getAttribute('data-ex-left'), parseCoord(textEl.getAttribute('x')))
  const y = lineYs[0] ?? readSvgTextAnchorY(textEl)

  while (textEl.firstChild) {
    textEl.removeChild(textEl.firstChild)
  }
  textEl.textContent = content
  textEl.setAttribute('x', String(startX))
  textEl.setAttribute('y', String(y))
  if (lineYs.length > 1) {
    textEl.setAttribute('data-ex-line-ys', lineYs.map(String).join(','))
  }
  applyLiveDominantBaseline(textEl)
}

export function readLiveLineYs(textEl: SVGTextElement, lineCount: number): number[] {
  const stored = textEl.getAttribute('data-ex-line-ys')
  if (stored) {
    const ys = stored.split(',').map((v) => parseCoord(v)).filter((y) => Number.isFinite(y))
    if (ys.length >= lineCount) return ys.slice(0, lineCount)
    if (ys.length > 0) {
      const step =
        ys.length > 1
          ? ys[1] - ys[0]
          : defaultLineStep(textEl)
      const start = ys[0]
      return Array.from({ length: lineCount }, (_, i) => start + i * step)
    }
  }

  const y = readTextElementY(textEl)
  const step = defaultLineStep(textEl)
  return Array.from({ length: lineCount }, (_, i) => y + i * step)
}

export async function measureMixedWidth(
  text: string,
  fontSize: number,
  defaultRole: FontRole,
): Promise<number> {
  const runs = splitTextByFontRole(text, defaultRole)
  let total = 0
  for (const run of runs) {
    const font = await resolveFontForRole(run.role)
    if (!font) continue
    total += measureAdvance(font, run.content, fontSize)
  }
  if (total > 0) return total
  const charWidth = fontSize * (defaultRole === 'latin' ? 0.55 : 1)
  return text.length * charWidth
}

/** 成分区/洗涤建议自动折行宽度：固定 25mm，勿用溢出内容的实测右缘 */
export function resolveLiveWrapMaxWidth(
  leftX: number,
  rightX: number,
  options?: { isPlainComposition?: boolean; isCareAdvice?: boolean },
): number {
  if (options?.isPlainComposition || options?.isCareAdvice) {
    return LIVE_LABEL_TEXT_WIDTH_PX
  }
  const captured = rightX > leftX ? rightX - leftX : 0
  if (captured <= 0) return LIVE_LABEL_TEXT_WIDTH_PX
  return Math.min(captured, LIVE_LABEL_TEXT_WIDTH_PX)
}

/** 按洗唛可用宽度折行（洗涤建议 / 成分脚注等长段落） */
function chunkTextForWrap(text: string): string[] {
  const chunks: string[] = []
  let buf = ''
  for (const ch of text) {
    buf += ch
    if (/[\s，、；;：:。.!?！？/]/.test(ch)) {
      chunks.push(buf)
      buf = ''
    }
  }
  if (buf) chunks.push(buf)
  return chunks.length ? chunks : [text]
}

export async function wrapLiveTextToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  defaultRole: FontRole,
): Promise<string[]> {
  const trimmed = text.replace(/[ \t]+/g, ' ').trim()
  if (!trimmed) return []
  if (maxWidth <= 0) return [trimmed]

  const width = await measureMixedWidth(trimmed, fontSize, defaultRole)
  if (width <= maxWidth) return [trimmed]

  const lines: string[] = []
  let current = ''

  for (const chunk of chunkTextForWrap(trimmed)) {
    let remaining = chunk
    while (remaining) {
      const trial = current + remaining
      const trialWidth = await measureMixedWidth(trial, fontSize, defaultRole)
      if (trialWidth <= maxWidth) {
        current = trial
        break
      }

      if (current) {
        lines.push(current)
        current = ''
        continue
      }

      let part = ''
      for (const ch of remaining) {
        const next = part + ch
        const nextWidth = await measureMixedWidth(next, fontSize, defaultRole)
        if (nextWidth > maxWidth && part) {
          lines.push(part)
          part = ch
        } else {
          part = next
        }
      }
      current = part
      break
    }
  }

  if (current) lines.push(current)
  return lines.length ? lines : [trimmed]
}

export async function expandLiveDisplayLines(
  rawLines: string[],
  maxWidth: number,
  fontSize: number,
  defaultRole: FontRole,
): Promise<string[]> {
  const expanded: string[] = []
  for (const line of rawLines) {
    const wrapped = await wrapLiveTextToWidth(line, maxWidth, fontSize, defaultRole)
    expanded.push(...wrapped)
  }
  return expanded.filter((line) => line.length > 0)
}

/** 合并前从多个 text 采集行 y，容差内去重 */
export function mergeLineYs(existing: number[], nextY: number): number[] {
  if (!existing.length) return [nextY]
  const last = existing[existing.length - 1]
  if (Math.abs(last - nextY) <= INTRA_TEXT_LINE_Y_TOLERANCE) return existing
  return [...existing, nextY]
}
