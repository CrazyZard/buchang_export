/**
 * 阿拉伯整形：把逻辑序基础字母按上下文映射到 Unicode 呈现形（Presentation Forms-B），
 * 使其在「逐字形矢量转曲」时呈现正确连写形态（ARIAL.TTF 含这些字形）。
 *
 * 形态选择规则（标准阿拉伯整形）：
 * - 字母分「双连接」(可初/中) 与「只右连接」(只末/独立，如 ا د ذ ر ز و)。
 * - 当前字母是否取 medial/final，取决于前一字母能否向后连(connectsAfter)；
 *   是否取 initial/medial，取决于后一字母能否向前连(connectsBefore)。
 * - lam + alef → lam-alef 连字（FEF5..FEFC）。
 */

interface Form {
  isolated: number
  final: number
  initial?: number
  medial?: number
}

// base codepoint -> presentation forms
const FORMS: Record<number, Form> = {
  0x0621: { isolated: 0xfe80, final: 0xfe80 }, // hamza (无连接)
  0x0622: { isolated: 0xfe81, final: 0xfe82 }, // alef madda
  0x0623: { isolated: 0xfe83, final: 0xfe84 }, // alef hamza above
  0x0624: { isolated: 0xfe85, final: 0xfe86 }, // waw hamza
  0x0625: { isolated: 0xfe87, final: 0xfe88 }, // alef hamza below
  0x0626: { isolated: 0xfe89, final: 0xfe8a, initial: 0xfe8b, medial: 0xfe8c }, // yeh hamza
  0x0627: { isolated: 0xfe8d, final: 0xfe8e }, // alef
  0x0628: { isolated: 0xfe8f, final: 0xfe90, initial: 0xfe91, medial: 0xfe92 }, // beh
  0x0629: { isolated: 0xfe93, final: 0xfe94 }, // teh marbuta
  0x062a: { isolated: 0xfe95, final: 0xfe96, initial: 0xfe97, medial: 0xfe98 }, // teh
  0x062b: { isolated: 0xfe99, final: 0xfe9a, initial: 0xfe9b, medial: 0xfe9c }, // theh
  0x062c: { isolated: 0xfe9d, final: 0xfe9e, initial: 0xfe9f, medial: 0xfea0 }, // jeem
  0x062d: { isolated: 0xfea1, final: 0xfea2, initial: 0xfea3, medial: 0xfea4 }, // hah
  0x062e: { isolated: 0xfea5, final: 0xfea6, initial: 0xfea7, medial: 0xfea8 }, // khah
  0x062f: { isolated: 0xfea9, final: 0xfeaa }, // dal
  0x0630: { isolated: 0xfeab, final: 0xfeac }, // thal
  0x0631: { isolated: 0xfead, final: 0xfeae }, // reh
  0x0632: { isolated: 0xfeaf, final: 0xfeb0 }, // zain
  0x0633: { isolated: 0xfeb1, final: 0xfeb2, initial: 0xfeb3, medial: 0xfeb4 }, // seen
  0x0634: { isolated: 0xfeb5, final: 0xfeb6, initial: 0xfeb7, medial: 0xfeb8 }, // sheen
  0x0635: { isolated: 0xfeb9, final: 0xfeba, initial: 0xfebb, medial: 0xfebc }, // sad
  0x0636: { isolated: 0xfebd, final: 0xfebe, initial: 0xfebf, medial: 0xfec0 }, // dad
  0x0637: { isolated: 0xfec1, final: 0xfec2, initial: 0xfec3, medial: 0xfec4 }, // tah
  0x0638: { isolated: 0xfec5, final: 0xfec6, initial: 0xfec7, medial: 0xfec8 }, // zah
  0x0639: { isolated: 0xfec9, final: 0xfeca, initial: 0xfecb, medial: 0xfecc }, // ain
  0x063a: { isolated: 0xfecd, final: 0xfece, initial: 0xfecf, medial: 0xfed0 }, // ghain
  0x0641: { isolated: 0xfed1, final: 0xfed2, initial: 0xfed3, medial: 0xfed4 }, // feh
  0x0642: { isolated: 0xfed5, final: 0xfed6, initial: 0xfed7, medial: 0xfed8 }, // qaf
  0x0643: { isolated: 0xfed9, final: 0xfeda, initial: 0xfedb, medial: 0xfedc }, // kaf
  0x0644: { isolated: 0xfedd, final: 0xfede, initial: 0xfedf, medial: 0xfee0 }, // lam
  0x0645: { isolated: 0xfee1, final: 0xfee2, initial: 0xfee3, medial: 0xfee4 }, // meem
  0x0646: { isolated: 0xfee5, final: 0xfee6, initial: 0xfee7, medial: 0xfee8 }, // noon
  0x0647: { isolated: 0xfee9, final: 0xfeea, initial: 0xfeeb, medial: 0xfeec }, // heh
  0x0648: { isolated: 0xfeed, final: 0xfeee }, // waw
  0x0649: { isolated: 0xfeef, final: 0xfef0 }, // alef maksura
  0x064a: { isolated: 0xfef1, final: 0xfef2, initial: 0xfef3, medial: 0xfef4 }, // yeh
}

// lam + alef 连字：alef base -> [isolated, final]
const LAM_ALEF: Record<number, [number, number]> = {
  0x0622: [0xfef5, 0xfef6], // lam + alef madda
  0x0623: [0xfef7, 0xfef8], // lam + alef hamza above
  0x0625: [0xfef9, 0xfefa], // lam + alef hamza below
  0x0627: [0xfefb, 0xfefc], // lam + alef
}

function isArabicLetter(cp: number): boolean {
  return cp in FORMS
}

/** 该字母能否向后连接（即有 initial/medial 形态） */
function connectsAfter(cp: number): boolean {
  const f = FORMS[cp]
  return Boolean(f && f.initial !== undefined)
}

/** 阿拉伯字母默认都能向前连接（有 final 形态） */
function connectsBefore(cp: number): boolean {
  return cp in FORMS
}

/**
 * 把逻辑序文本中的阿拉伯字母换成呈现形。非阿拉伯字符原样保留。
 * 返回仍是「逻辑顺序」，仅字形变化（bidi 重排在后续步骤做）。
 */
export function reshapeArabic(text: string): string {
  const cps = [...text].map((ch) => ch.codePointAt(0) ?? 0)
  const out: string[] = []

  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i]

    if (!isArabicLetter(cp)) {
      out.push(String.fromCodePoint(cp))
      continue
    }

    const prev = i > 0 ? cps[i - 1] : 0
    const next = i + 1 < cps.length ? cps[i + 1] : 0

    // lam + alef 连字
    if (cp === 0x0644 && LAM_ALEF[next]) {
      const joinedToPrev = isArabicLetter(prev) && connectsAfter(prev)
      const [isol, fin] = LAM_ALEF[next]
      out.push(String.fromCodePoint(joinedToPrev ? fin : isol))
      i++ // 跳过 alef
      continue
    }

    const joinPrev = isArabicLetter(prev) && connectsAfter(prev) && connectsBefore(cp)
    const joinNext = isArabicLetter(next) && connectsAfter(cp) && connectsBefore(next)

    const form = FORMS[cp]
    let chosen: number
    if (joinPrev && joinNext && form.medial !== undefined) chosen = form.medial
    else if (joinPrev && joinNext && form.initial !== undefined) chosen = form.initial
    else if (joinNext && form.initial !== undefined) chosen = form.initial
    else if (joinPrev) chosen = form.final
    else chosen = form.isolated

    out.push(String.fromCodePoint(chosen))
  }

  return out.join('')
}

/** 文本是否含阿拉伯字符（基础区或呈现形） */
export function hasArabic(text: string): boolean {
  return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/.test(text)
}
