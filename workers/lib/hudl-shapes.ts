/**
 * Value-free outlines of the JSON a Hudl page loaded, for diagnostics.
 *
 * Where Hudl keeps a clip's breakdown and comments is undocumented, and the
 * first run that missed them could only say which URLs were fetched — not what
 * any of them contained. A key skeleton answers that without storing anything
 * a session could be rebuilt from: keys and types only, never a value. Keys
 * that are themselves ids (a map keyed by clip id) collapse to `<id>`.
 *
 * Pure: the caller decides what to outline and where it goes.
 */

const MAX_DEPTH = 7
const MAX_KEYS_PER_OBJECT = 40
const MAX_SHAPE_CHARS = 2_000

const ID_LIKE_KEY = /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{24,})$/i

function outline(value: unknown, depth: number): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (depth >= MAX_DEPTH) return `[…×${value.length}]`
    // The first element stands for the list — playlists are homogeneous, and
    // the count is what says it is the playlist.
    return `[${outline(value[0], depth + 1)}×${value.length}]`
  }
  switch (typeof value) {
    case 'string':
      return 'str'
    case 'number':
      return 'num'
    case 'boolean':
      return 'bool'
    case 'object': {
      if (depth >= MAX_DEPTH) return '{…}'
      const entries = Object.entries(value as Record<string, unknown>)
      const idKeys = entries.filter(([k]) => ID_LIKE_KEY.test(k))
      const named = entries.filter(([k]) => !ID_LIKE_KEY.test(k)).slice(0, MAX_KEYS_PER_OBJECT)
      const parts = named.map(([k, v]) => `${k}:${outline(v, depth + 1)}`)
      if (idKeys.length) parts.push(`<id>×${idKeys.length}:${outline(idKeys[0][1], depth + 1)}`)
      if (entries.length > named.length + idKeys.length) parts.push('…')
      return `{${parts.join(',')}}`
    }
    default:
      return typeof value
  }
}

/** A key skeleton of `value`, truncated to a size a job row can carry. */
export function describeShape(value: unknown, maxChars = MAX_SHAPE_CHARS): string {
  const shape = outline(value, 0)
  return shape.length > maxChars ? `${shape.slice(0, maxChars)}…` : shape
}
