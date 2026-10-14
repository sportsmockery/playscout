/**
 * Reads the coaching staff's comments and notes off Hudl clips.
 *
 * Same constraint as `hudl-playlist.ts`: Hudl's payload shapes are private and
 * undocumented, so this is a shape-tolerant reader, not a parser for one
 * schema. Two places a comment can plausibly live are both read:
 *
 *   - ON the clip, under a key like `comments` / `notes` (a string, a list of
 *     strings, or a list of comment objects).
 *   - BESIDE the clips, in another payload, as comment objects that name the
 *     clip they belong to (`clipId`).
 *
 * A comment that cannot be tied to a clip id the playlist actually contains is
 * dropped. A note filed under the wrong play is worse than a missing one — a
 * coach reads it as a fact about that snap.
 *
 * Pure: no network, no Supabase. Only text, author name, time posted and the
 * video time are kept. Nothing else from the object is stored, since these
 * payloads also carry ids and URLs that are none of our business.
 */

export interface HudlClipComment {
  kind: 'comment' | 'note'
  text: string
  author?: string
  /** When it was posted, as Hudl gave it (ISO string when Hudl uses one). */
  postedAt?: string
  /** Where in the clip it points, in seconds, when Hudl anchors it to a moment. */
  clipSeconds?: number
}

const COMMENT_KEYS = new Set(['comments', 'comment', 'clipcomments', 'annotations', 'discussion'])
const NOTE_KEYS = new Set(['notes', 'note', 'clipnotes', 'coachnotes', 'coachesnotes'])
/** Every root key this module owns — the breakdown reader skips them. */
export const COMMENT_FIELD_KEYS = new Set([...COMMENT_KEYS, ...NOTE_KEYS])

const TEXT_KEYS = ['text', 'body', 'comment', 'message', 'content', 'note', 'value', 'plaintext']
const AUTHOR_KEYS = ['author', 'user', 'createdby', 'postedby', 'owner', 'commenter', 'authorname', 'username']
const NAME_KEYS = ['displayname', 'fullname', 'name']
const POSTED_KEYS = ['createdat', 'created', 'createddate', 'postedat', 'date', 'datecreated', 'createdon']
const SECONDS_KEYS = ['time', 'videotime', 'timeinseconds', 'seconds', 'offset', 'position', 'starttime']
const MS_KEYS = ['timems', 'offsetms', 'positionms', 'videotimems', 'timeinms', 'milliseconds']
const CLIP_REF_KEYS = ['clipid', 'clip', 'clipguid', 'momentid']
const ID_KEYS = ['clipid', 'id']
const REPLY_KEYS = ['replies', 'children', 'responses']

const MAX_TEXT = 4_000
const MAX_PER_CLIP = 200
const MAX_DEPTH = 8

function norm(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function field(record: Record<string, unknown>, keys: string[]): unknown {
  for (const want of keys) {
    const key = Object.keys(record).find((k) => norm(k) === want)
    if (key !== undefined && record[key] !== null && record[key] !== undefined) return record[key]
  }
  return undefined
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+\n/g, '\n').trim()
  if (!text) return null
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text
}

function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (isRecord(value)) return idOf(field(value, ['id']))
  return null
}

function authorOf(record: Record<string, unknown>): string | undefined {
  const raw = field(record, AUTHOR_KEYS)
  if (typeof raw === 'string') return cleanText(raw) ?? undefined
  if (!isRecord(raw)) return undefined
  const named = cleanText(field(raw, NAME_KEYS))
  if (named) return named
  const first = cleanText(field(raw, ['firstname']))
  const last = cleanText(field(raw, ['lastname']))
  return [first, last].filter(Boolean).join(' ') || undefined
}

function postedAtOf(record: Record<string, unknown>): string | undefined {
  const raw = field(record, POSTED_KEYS)
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

function clipSecondsOf(record: Record<string, unknown>): number | undefined {
  const ms = field(record, MS_KEYS)
  if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) return Math.round(ms) / 1000
  const seconds = field(record, SECONDS_KEYS)
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) return seconds
  return undefined
}

/** One comment object, plus any replies nested under it. */
function fromRecord(record: Record<string, unknown>, kind: HudlClipComment['kind']): HudlClipComment[] {
  const out: HudlClipComment[] = []
  const text = cleanText(field(record, TEXT_KEYS))
  if (text) {
    const comment: HudlClipComment = { kind, text }
    const author = authorOf(record)
    const postedAt = postedAtOf(record)
    const clipSeconds = clipSecondsOf(record)
    if (author) comment.author = author
    if (postedAt) comment.postedAt = postedAt
    if (clipSeconds !== undefined) comment.clipSeconds = clipSeconds
    out.push(comment)
  }
  const replies = field(record, REPLY_KEYS)
  if (Array.isArray(replies)) {
    for (const reply of replies) if (isRecord(reply)) out.push(...fromRecord(reply, kind))
  }
  return out
}

function fromValue(value: unknown, kind: HudlClipComment['kind'], depth = 0): HudlClipComment[] {
  if (depth > 2) return []
  const text = cleanText(value)
  if (text) return [{ kind, text }]
  if (Array.isArray(value)) return value.flatMap((item) => fromValue(item, kind, depth + 1))
  if (!isRecord(value)) return []
  // A comment object, or a wrapper like `{ items: [...], total: 3 }`.
  const own = fromRecord(value, kind)
  if (own.length) return own
  return Object.values(value)
    .filter(Array.isArray)
    .flatMap((list) => fromValue(list, kind, depth + 1))
}

/** Comments and notes stored ON a clip object. */
export function readClipComments(clip: Record<string, unknown>): HudlClipComment[] {
  const out: HudlClipComment[] = []
  for (const [key, value] of Object.entries(clip)) {
    const k = norm(key)
    if (COMMENT_KEYS.has(k)) out.push(...fromValue(value, 'comment'))
    else if (NOTE_KEYS.has(k)) out.push(...fromValue(value, 'note'))
  }
  return dedupe(out)
}

function dedupe(comments: HudlClipComment[]): HudlClipComment[] {
  const seen = new Set<string>()
  const out: HudlClipComment[] = []
  for (const c of comments) {
    const key = `${c.kind}|${c.text}|${c.author ?? ''}|${c.postedAt ?? ''}|${c.clipSeconds ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
    if (out.length >= MAX_PER_CLIP) break
  }
  return out
}

/**
 * Every comment anywhere in the captured payloads that names one of `clipIds`,
 * keyed by clip id.
 *
 * Two shapes count: a comment object carrying `clipId` (the clip is named by
 * reference), and an object whose own id is a playlist clip id and which
 * carries comment/note fields (the same clip, served again by a detail call).
 * The second requires the comment fields, so a stray object that merely
 * shares an id never contributes anything.
 */
export function collectCommentsByClip(
  payloads: unknown[],
  clipIds: Set<string>
): Map<string, HudlClipComment[]> {
  const found = new Map<string, HudlClipComment[]>()
  const add = (clipId: string, comments: HudlClipComment[]) => {
    if (!comments.length) return
    found.set(clipId, [...(found.get(clipId) ?? []), ...comments])
  }

  const walk = (node: unknown, depth: number) => {
    if (depth > MAX_DEPTH) return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    if (!isRecord(node)) return

    const hasCommentFields = Object.keys(node).some((k) => COMMENT_FIELD_KEYS.has(norm(k)))

    if (hasCommentFields) {
      // The clip itself (served again by a detail call), carrying its comments.
      const clipId = idOf(field(node, ID_KEYS))
      if (clipId && clipIds.has(clipId)) add(clipId, readClipComments(node))
    } else {
      // A single comment naming the clip it is on.
      const ref = idOf(field(node, CLIP_REF_KEYS))
      if (ref && clipIds.has(ref)) add(ref, fromRecord(node, 'comment'))
    }

    for (const value of Object.values(node)) walk(value, depth + 1)
  }

  for (const payload of payloads) walk(payload, 0)
  for (const [clipId, comments] of found) found.set(clipId, dedupe(comments))
  return found
}

/** Merges comments found beside the clips into the ones found on them. */
export function mergeComments(
  own: HudlClipComment[],
  beside: HudlClipComment[] | undefined
): HudlClipComment[] {
  return beside?.length ? dedupe([...own, ...beside]) : own
}
