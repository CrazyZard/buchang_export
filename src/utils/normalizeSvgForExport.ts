const CLASS_RULE_RE = /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g

const INLINABLE_PROPS = new Set([
  'fill',
  'stroke',
  'stroke-width',
  'stroke-miterlimit',
  'stroke-linecap',
  'stroke-linejoin',
  'fill-rule',
  'fill-opacity',
  'stroke-opacity',
])

function parseClassRules(css: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>()
  for (const match of css.matchAll(CLASS_RULE_RE)) {
    const className = match[1]
    const decls: Record<string, string> = { ...rules.get(className) }
    for (const part of match[2].split(';')) {
      const colon = part.indexOf(':')
      if (colon <= 0) continue
      const key = part.slice(0, colon).trim()
      const value = part.slice(colon + 1).trim()
      if (key && value) decls[key] = value
    }
    rules.set(className, decls)
  }
  return rules
}

/**
 * dom-to-svg 会忽略 SVG 内嵌 <style>，svg2pdf 也不解析 class 样式。
 * 将嵌入 CSS 写回 fill/stroke 等属性，避免导出后 Logo/图标变白或消失。
 */
export function normalizeSvgForExport(markup: string): string {
  if (!/<style[\s>]/i.test(markup)) return markup

  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.tagName.toLowerCase() !== 'svg') return markup

  const rules = new Map<string, Record<string, string>>()
  svg.querySelectorAll('style').forEach((styleEl) => {
    for (const [className, decls] of parseClassRules(styleEl.textContent ?? '')) {
      rules.set(className, { ...rules.get(className), ...decls })
    }
    styleEl.remove()
  })

  svg.querySelectorAll('defs').forEach((defs) => {
    if (defs.children.length === 0) defs.remove()
  })

  svg.querySelectorAll('[class]').forEach((el) => {
    for (const className of (el.getAttribute('class') ?? '').split(/\s+/)) {
      const decls = rules.get(className)
      if (!decls) continue
      for (const [prop, value] of Object.entries(decls)) {
        if (!INLINABLE_PROPS.has(prop)) continue
        const attr = prop
        if (!el.getAttribute(attr)) {
          el.setAttribute(attr, value)
        }
      }
    }
  })

  return new XMLSerializer().serializeToString(svg)
}
