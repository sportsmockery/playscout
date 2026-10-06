/**
 * "34-39, 41, 43–47" → [34, 35, 36, 37, 38, 39, 41, 43, 44, 45, 46, 47].
 *
 * How a coach says which clips were their offense: in runs, by drive. Accepts
 * commas, spaces or semicolons between parts and a hyphen or dash inside a
 * range; a backwards range is read forwards. Returns null when any part is not
 * a clip number or a range, so a typo is reported rather than half-applied.
 */
export function parseClipRanges(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  const out = new Set<number>()
  for (const part of parts) {
    const m = part.match(/^#?(\d{1,4})(?:\s*[-–—]\s*#?(\d{1,4}))?$/)
    if (!m) return null
    const a = parseInt(m[1], 10)
    const b = m[2] ? parseInt(m[2], 10) : a
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    if (hi - lo > 500) return null
    for (let n = lo; n <= hi; n++) out.add(n)
  }
  return [...out].sort((x, y) => x - y)
}
