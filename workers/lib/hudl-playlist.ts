/**
 * Finds the clips behind a Hudl playlist URL.
 *
 * This is the part of the integration that cannot be verified from a
 * development machine without a Hudl account: their playlist payload shape is
 * private and undocumented, and anything written here claiming to know their
 * endpoints would be a guess. So the module is built for the first real run to
 * be cheap rather than for the first run to work:
 *
 *   - `extractClipsFromPayload` is a shape-tolerant reader over whatever JSON
 *     the page fetched, not a parser for one known schema. It is pure, and it
 *     is where the tests live.
 *   - It returns nothing rather than something wrong when it does not
 *     recognise a payload. A half-read playlist produces clips with the wrong
 *     breakdown attached, which is worse than a failed import.
 *   - On failure the caller records the request URLs the page made, with
 *     every query VALUE stripped, so the next attempt starts from evidence.
 *     Hudl's URLs carry session tokens in their query strings; the parameter
 *     names are what identify the endpoint, and the values are the secret.
 */
import type { Page, Response } from 'playwright'
import {
  COMMENT_FIELD_KEYS,
  collectCommentsByClip,
  mergeComments,
  readClipComments,
  type HudlClipComment,
} from './hudl-comments'

export interface HudlClipCandidate {
  /** Hudl's own clip id — the stable key for de-duplicating across runs. */
  clipId: string
  /** Position within the playlist, which is how clips pair with breakdown rows. */
  order: number
  /** Breakdown columns as Hudl labels them, for `mapHudlRow`. */
  columns: Record<string, string>
  /** Playable URLs, most preferred first (mp4 before HLS). */
  mediaUrls: string[]
  /** The staff's comments and notes on this clip, when Hudl served any. */
  comments: HudlClipComment[]
}

// Keys at a clip's root that are structure, not breakdown data.
const NON_BREAKDOWN_KEYS = new Set([
  'id',
  'clipid',
  'clipnumber',
  'angles',
  'clipangles',
  'media',
  'medias',
  'thumbnail',
  'thumbnails',
  'duration',
  'createdat',
  'updatedat',
  'teamid',
  'playlistid',
  'videoid',
  'url',
  'uri',
  'src',
])

const ID_KEYS = ['clipid', 'clipId', 'id']
const MEDIA_EXTENSIONS = /\.(m3u8|mp4|mov|m4v)(\?|$)/i

function norm(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scalarToString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return null
}

/** Every media-looking URL anywhere inside a clip object, mp4 preferred. */
function collectMediaUrls(node: unknown, found: string[] = [], depth = 0): string[] {
  if (depth > 8) return found
  if (typeof node === 'string') {
    if (/^https?:\/\//i.test(node) && MEDIA_EXTENSIONS.test(node) && !found.includes(node)) {
      found.push(node)
    }
    return found
  }
  if (Array.isArray(node)) {
    for (const item of node) collectMediaUrls(item, found, depth + 1)
    return found
  }
  if (isRecord(node)) {
    for (const value of Object.values(node)) collectMediaUrls(value, found, depth + 1)
  }
  return found
}

function preferProgressive(urls: string[]): string[] {
  // A plain mp4 downloads with one request; HLS needs ffmpeg to reassemble it.
  // Both work, but when Hudl offers both there is no reason to take the harder
  // one.
  return [...urls].sort((a, b) => {
    const score = (u: string) => (/\.mp4(\?|$)/i.test(u) ? 0 : 1)
    return score(a) - score(b)
  })
}

function clipId(clip: Record<string, unknown>): string | null {
  for (const key of ID_KEYS) {
    const direct = clip[key] ?? clip[Object.keys(clip).find((k) => norm(k) === norm(key)) ?? '']
    const value = scalarToString(direct)
    if (value && value.trim()) return value.trim()
  }
  return null
}

/**
 * Breakdown columns off a clip, across the shapes Hudl has plausibly used:
 * a list of `{name, value}` pairs, a flat object of labels to values, or a
 * list of raw values that lines up with a column list found elsewhere in the
 * payload.
 */
function readColumns(clip: Record<string, unknown>, columnNames: string[]): Record<string, string> {
  const columns: Record<string, string> = {}

  const addPair = (name: unknown, value: unknown) => {
    const label = scalarToString(name)?.trim()
    const text = scalarToString(value)?.trim()
    if (label && text) columns[label] = text
  }

  for (const [key, value] of Object.entries(clip)) {
    const k = norm(key)
    // Comments and notes are read by `readClipComments`. As columns, a list of
    // `{ title, text }` comments would pass for breakdown pairs.
    if (COMMENT_FIELD_KEYS.has(k)) continue

    if (Array.isArray(value)) {
      const objectPairs = value.filter(isRecord)
      if (objectPairs.length === value.length && objectPairs.length > 0) {
        for (const pair of objectPairs) {
          const nameKey = Object.keys(pair).find((p) =>
            ['name', 'key', 'column', 'label', 'field', 'title'].includes(norm(p))
          )
          const valueKey = Object.keys(pair).find((p) => ['value', 'val', 'text'].includes(norm(p)))
          if (nameKey && valueKey) addPair(pair[nameKey], pair[valueKey])
        }
        continue
      }

      // A bare list of values only means something paired with column names.
      const scalars = value.map(scalarToString)
      if (columnNames.length && scalars.length === columnNames.length) {
        scalars.forEach((text, i) => addPair(columnNames[i], text))
      }
      continue
    }

    if (isRecord(value) && ['breakdowndata', 'breakdown', 'data', 'fields'].includes(k)) {
      for (const [label, cell] of Object.entries(value)) addPair(label, cell)
      continue
    }

    if (!NON_BREAKDOWN_KEYS.has(k)) addPair(key, value)
  }

  return columns
}

/** A column list living beside the clips, e.g. `{ columns: ['Down', 'Dist'] }`. */
function findColumnNames(node: unknown, depth = 0): string[] {
  if (depth > 6) return []
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findColumnNames(item, depth + 1)
      if (found.length) return found
    }
    return []
  }
  if (!isRecord(node)) return []

  for (const [key, value] of Object.entries(node)) {
    const k = norm(key)
    if (!['columns', 'breakdowncolumns', 'fields', 'headers', 'columnnames'].includes(k)) continue
    if (!Array.isArray(value) || value.length === 0) continue

    if (value.every((v) => typeof v === 'string')) return value as string[]
    if (value.every(isRecord)) {
      const names = (value as Record<string, unknown>[]).map((entry) => {
        const nameKey = Object.keys(entry).find((p) => ['name', 'label', 'title'].includes(norm(p)))
        return nameKey ? scalarToString(entry[nameKey]) : null
      })
      if (names.every((n): n is string => Boolean(n))) return names
    }
  }

  for (const value of Object.values(node)) {
    const found = findColumnNames(value, depth + 1)
    if (found.length) return found
  }
  return []
}

/** Does this array look like the playlist rather than some other list? */
function clipLikeArray(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const records = value.filter(isRecord)
  if (records.length !== value.length) return null

  // A clip has an id AND something playable. Requiring both is what keeps this
  // from latching onto a list of teams, tags or comments.
  const clipLike = records.filter((r) => clipId(r) && collectMediaUrls(r).length > 0)
  return clipLike.length === records.length ? records : null
}

function findClipArrays(node: unknown, out: Record<string, unknown>[][] = [], depth = 0) {
  if (depth > 8) return out
  const asClips = clipLikeArray(node)
  if (asClips) {
    out.push(asClips)
    return out
  }
  if (Array.isArray(node)) {
    for (const item of node) findClipArrays(item, out, depth + 1)
    return out
  }
  if (isRecord(node)) {
    for (const value of Object.values(node)) findClipArrays(value, out, depth + 1)
  }
  return out
}

/**
 * Reads clips out of whatever JSON the Hudl page fetched.
 *
 * Returns `[]` when nothing in the payload looks like a playlist. That is the
 * intended answer for an unrecognised shape: the caller fails the job with
 * diagnostics rather than importing clips whose breakdown data was guessed.
 */
export function extractClipsFromPayload(payload: unknown): HudlClipCandidate[] {
  const arrays = findClipArrays(payload)
  if (!arrays.length) return []

  // The longest one is the playlist; shorter clip-like arrays nested elsewhere
  // are things like "related clips".
  const clips = arrays.reduce((best, candidate) =>
    candidate.length > best.length ? candidate : best
  )
  const columnNames = findColumnNames(payload)

  const seen = new Set<string>()
  const out: HudlClipCandidate[] = []

  for (const clip of clips) {
    const id = clipId(clip)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({
      clipId: id,
      order: out.length,
      columns: readColumns(clip, columnNames),
      mediaUrls: preferProgressive(collectMediaUrls(clip)),
      comments: readClipComments(clip),
    })
  }

  return out
}

/**
 * A request URL safe to store as a diagnostic: host and path kept, every query
 * VALUE dropped, parameter names kept.
 *
 * The names are what identify an endpoint on the next attempt; the values are
 * where Hudl puts session tokens, so they must never reach a database row.
 */
export function redactUrlForDiagnostics(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return '(unparseable url)'
  }
  const names = [...new Set([...url.searchParams.keys()])]
  const query = names.length ? `?${names.join('&')}` : ''
  return `${url.origin}${url.pathname}${query}`
}

/** Picks the payload that yielded the most clips across everything captured. */
export function bestClipSet(payloads: unknown[]): HudlClipCandidate[] {
  let best: HudlClipCandidate[] = []
  for (const payload of payloads) {
    const clips = extractClipsFromPayload(payload)
    if (clips.length > best.length) best = clips
  }
  return best
}

/**
 * Adds comments that arrived in OTHER payloads than the playlist — a separate
 * comments call naming its clip. Only clips in `clips` can receive one.
 */
export function attachCommentsFromPayloads(
  clips: HudlClipCandidate[],
  payloads: unknown[]
): HudlClipCandidate[] {
  const beside = collectCommentsByClip(payloads, new Set(clips.map((c) => c.clipId)))
  if (!beside.size) return clips
  return clips.map((clip) => ({ ...clip, comments: mergeComments(clip.comments, beside.get(clip.clipId)) }))
}

// ---------------------------------------------------------------------------
// Driving the page
// ---------------------------------------------------------------------------

/**
 * Enumeration failed. `diagnostics` holds the redacted request URLs the page
 * made, which is the whole point: the payload shape is undocumented, so the
 * first real run is a discovery run and it should not have to be repeated
 * blind.
 */
export class HudlPlaylistError extends Error {
  readonly coachMessage: string
  readonly diagnostics: string[]

  constructor(coachMessage: string, diagnostics: string[]) {
    super('hudl playlist enumeration failed')
    this.name = 'HudlPlaylistError'
    this.coachMessage = coachMessage
    this.diagnostics = diagnostics
  }
}

/** Bodies above this are not the playlist; they are video or a bundle. */
const MAX_JSON_BYTES = 8 * 1024 * 1024
const SETTLE_MS = Number(process.env.HUDL_SETTLE_MS ?? 4_000)
/** Most cut-up playlists are 40-120 clips, and Hudl pages them in lazily. */
const MAX_SCROLL_PASSES = Number(process.env.HUDL_SCROLL_PASSES ?? 12)

function isHudlHost(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).hostname.toLowerCase().endsWith('hudl.com')
  } catch {
    return false
  }
}

/**
 * Opens the analyze URL as the coach and reads out the clips.
 *
 * Every JSON response the page fetches is parsed in memory and discarded; only
 * the redacted URLs survive, and only on failure. Response bodies and headers
 * are never stored anywhere — both carry session tokens.
 */
export interface EnumerateOptions {
  /**
   * For a library link: the game to pick from the page's list. The library
   * address is the same whichever game is open, so this is what decides it.
   */
  libraryGame?: string
  /** Called with the clip total the library page states ("Clips 1-100 of 131"). */
  onStatedTotal?: (total: number) => void
}

export async function enumerateHudlPlaylist(
  page: Page,
  canonicalUrl: string,
  /**
   * Filled with the redacted request URLs the page made, for a caller that
   * wants them on success too (where Hudl keeps comments is undocumented).
   */
  seenUrls: Set<string> = new Set(),
  options: EnumerateOptions = {}
): Promise<HudlClipCandidate[]> {
  const payloads: unknown[] = []
  const pending: Promise<void>[] = []

  const onResponse = (response: Response) => {
    const url = response.url()
    if (!isHudlHost(url)) return
    seenUrls.add(redactUrlForDiagnostics(url))

    const contentType = response.headers()['content-type'] ?? ''
    if (!contentType.includes('json')) return

    pending.push(
      (async () => {
        try {
          const body = await response.body()
          if (body.byteLength > MAX_JSON_BYTES) return
          payloads.push(JSON.parse(body.toString('utf8')))
        } catch {
          // A body that has gone away or is not JSON after all. Not worth
          // failing over — the clips come from whichever payload does parse.
        }
      })()
    )
  }

  page.on('response', onResponse)

  try {
    await page.goto(canonicalUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})

    if (options.libraryGame) {
      // Whatever loaded so far is the game Hudl opened to, which may be any
      // game in the library. Drop it so only the picked game's clips count.
      await Promise.allSettled(pending.splice(0))
      payloads.length = 0
      await selectLibraryGame(page, options.libraryGame)
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(SETTLE_MS)
    }

    // Hudl loads a long cut-up in pages as you scroll. Scroll until the clip
    // count stops growing rather than a fixed number of times, so a 40-clip
    // playlist does not wait for a 120-clip playlist's worth of passes.
    let best = 0
    for (let pass = 0; pass < MAX_SCROLL_PASSES; pass++) {
      await Promise.allSettled(pending.splice(0))
      const found = bestClipSet(payloads).length
      if (pass > 0 && found === best) break
      best = found

      await page.mouse.wheel(0, 4_000)
      await page.waitForTimeout(SETTLE_MS)
    }

    await Promise.allSettled(pending.splice(0))
    const clips = attachCommentsFromPayloads(bestClipSet(payloads), payloads)

    if (options.onStatedTotal) {
      const text = await page.locator('body').innerText().catch(() => '')
      const total = statedClipTotal(text)
      if (total !== null) options.onStatedTotal(total)
    }

    if (!clips.length) {
      throw new HudlPlaylistError(
        'PlayScout signed in to Hudl but could not read the clips on that page. ' +
          'Check the link opens a playlist or game with clips, then try again.',
        [...seenUrls].sort()
      )
    }

    return clips
  } finally {
    page.off('response', onResponse)
  }
}

// ---------------------------------------------------------------------------
// Library links
// ---------------------------------------------------------------------------

export type LibraryPick =
  | { kind: 'game'; index: number }
  | { kind: 'expand'; index: number }
  | { kind: 'ambiguous'; texts: string[] }
  | { kind: 'none' }

const VS = /\bvs\b|\bvs\.|\bv\.?\s/i

/**
 * Chooses the library entry for `gameName` from the visible list texts.
 *
 * A game's film is listed as "<Opponent> vs… - <angle>"; the opponent's own
 * heading is the bare name. One film entry naming the game is picked. Several
 * is refused rather than guessed between — importing the wrong game files a
 * whole night of film under the wrong opponent. No film entry but a heading
 * means the heading is collapsed and needs opening first.
 */
export function pickLibraryGame(texts: string[], gameName: string): LibraryPick {
  const want = gameName.trim().toLowerCase()
  if (!want) return { kind: 'none' }
  const matches = texts
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => text.toLowerCase().includes(want))

  const films = matches.filter(({ text }) => VS.test(text))
  if (films.length === 1) return { kind: 'game', index: films[0].index }
  if (films.length > 1) {
    // The same entry is often matched twice (a row and the label inside it).
    const distinct = [...new Set(films.map((f) => f.text))]
    if (distinct.length === 1) return { kind: 'game', index: films[films.length - 1].index }
    return { kind: 'ambiguous', texts: distinct }
  }

  const heading = matches.find(({ text }) => !VS.test(text))
  return heading ? { kind: 'expand', index: heading.index } : { kind: 'none' }
}

/** "Clips 1-100 of 131" → 131. */
export function statedClipTotal(text: string): number | null {
  const match = /clips\s+\d+\s*[-–]\s*\d+\s+of\s+(\d+)/i.exec(text)
  return match ? Number(match[1]) : null
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Clicks the game's film entry in the library page's list. */
async function selectLibraryGame(page: Page, gameName: string): Promise<void> {
  const pattern = new RegExp(escapeRegExp(gameName.trim()), 'i')

  const readList = async () => {
    const found = page.getByText(pattern)
    const count = Math.min(await found.count(), 60)
    const items: { text: string; index: number }[] = []
    for (let i = 0; i < count; i++) {
      const el = found.nth(i)
      if (!(await el.isVisible().catch(() => false))) continue
      const text = (await el.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
      if (text) items.push({ text, index: i })
    }
    return { found, items }
  }

  let { found, items } = await readList()
  let pick = pickLibraryGame(items.map((i) => i.text), gameName)

  if (pick.kind === 'expand') {
    const heading = found.nth(items[pick.index].index)
    const headingBox = await heading.boundingBox().catch(() => null)
    await heading.click()
    await page.waitForTimeout(1_500)
    ;({ found, items } = await readList())
    pick = pickLibraryGame(items.map((i) => i.text), gameName)

    // The game's "Game Footage" folder can be collapsed too: open the first
    // one listed below the heading.
    if (pick.kind !== 'game' && headingBox) {
      const folders = page.getByText(/^\s*game footage/i)
      const n = Math.min(await folders.count(), 40)
      for (let i = 0; i < n; i++) {
        const box = await folders.nth(i).boundingBox().catch(() => null)
        if (box && box.y > headingBox.y) {
          await folders.nth(i).click()
          await page.waitForTimeout(1_500)
          break
        }
      }
      ;({ found, items } = await readList())
      pick = pickLibraryGame(items.map((i) => i.text), gameName)
    }
  }

  if (pick.kind === 'ambiguous') {
    throw new HudlPlaylistError(
      `More than one film in that Hudl library matches "${gameName}". Use a more specific game name, exactly as Hudl lists it.`,
      pick.texts.map((t) => `library entry: ${t}`)
    )
  }
  if (pick.kind !== 'game') {
    throw new HudlPlaylistError(
      `PlayScout opened the Hudl library but could not find a game named "${gameName}" in its list. Use the name exactly as Hudl shows it.`,
      items.map((i) => `library entry: ${i.text}`).slice(0, 20)
    )
  }

  await found.nth(items[pick.index].index).click()
}
