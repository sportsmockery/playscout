/**
 * Reads a Hudl browser session a coach has pasted in, and normalises it to the
 * Playwright `storageState` shape the worker already knows how to restore.
 *
 * Why this exists: PlayScout signs in to Hudl by driving a headless browser,
 * which needs a Hudl password. An account that signs in with Google has no
 * password to give, and Google blocks automated browsers outright — attempting
 * that sign-in would put the coach's GOOGLE account at risk, not just fail. So
 * for those accounts the coach hands over the session their own browser already
 * holds, and the worker restores it instead of logging in.
 *
 * `hudl_credentials.sealed_session` and `openHudlSession`'s restore path were
 * already here for session CACHING; this only adds a second way to fill them.
 *
 * Handling rules, because what gets pasted here IS a live credential:
 *
 *   - No cookie value is ever put in a returned message, a thrown error, or a
 *     log line. Every `reason` below is hand-written and mentions only counts
 *     and domains.
 *   - Cookies outside hudl.com are DROPPED rather than stored. A coach who
 *     exports "all cookies" would otherwise hand us their whole browser, and
 *     the worker would present a bank cookie to whatever host Hudl redirects
 *     a media download to.
 *
 * Pure and dependency-free, so the browser can validate a paste before it is
 * sent, the API route can refuse a bad one, and both are the same code.
 */

/** The Playwright cookie shape. `expires` is seconds since epoch, -1 = session. */
export interface StorageStateCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
}

export type HudlSessionPaste =
  | {
      ok: true
      /** JSON, ready for `browser.newContext({ storageState })`. */
      storageState: string
      /** How many hudl.com cookies survived — shown to the coach as a sanity check. */
      cookieCount: number
      /** How many non-Hudl cookies were dropped, so the UI can say they were. */
      droppedCount: number
      /** Earliest real expiry among them, for display. Null when all are session cookies. */
      expiresAt: Date | null
    }
  | { ok: false; reason: string }

/**
 * A paste bigger than this is not a cookie export, it is a whole profile dump
 * or a mistake, and sealing megabytes into a row helps nobody.
 */
const MAX_PASTE_BYTES = 256 * 1024
const MAX_COOKIES = 200

function isHudlDomain(domain: string): boolean {
  const host = domain.replace(/^\./, '').toLowerCase()
  return host === 'hudl.com' || host.endsWith('.hudl.com')
}

/**
 * Chrome's cookie-editor extensions and Playwright disagree on nearly every
 * field name. This maps the union of what they emit; anything unrecognised
 * falls back to the safest value rather than being rejected, because a cookie
 * dropped over a `sameSite` spelling is a session that silently half-works.
 */
function normalizeSameSite(raw: unknown): 'Strict' | 'Lax' | 'None' {
  const value = String(raw ?? '').toLowerCase()
  if (value === 'strict') return 'Strict'
  if (value === 'none' || value === 'no_restriction') return 'None'
  // 'lax', 'unspecified', undefined, and anything else. Lax is the browser
  // default, so it is also the correct guess when the export does not say.
  return 'Lax'
}

function normalizeExpires(raw: Record<string, unknown>): number {
  // Playwright: `expires`. Chrome extensions: `expirationDate`. Both seconds.
  const candidate = raw.expires ?? raw.expirationDate
  const seconds = typeof candidate === 'number' ? candidate : Number(candidate)
  if (!Number.isFinite(seconds) || seconds <= 0) return -1 // session cookie
  return Math.floor(seconds)
}

/** Pulls the cookie array out of whichever of the three shapes was pasted. */
function cookieArrayFrom(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') {
    const cookies = (parsed as { cookies?: unknown }).cookies
    if (Array.isArray(cookies)) return cookies
  }
  return null
}

export function normalizeHudlSessionPaste(raw: string): HudlSessionPaste {
  const text = raw.trim()
  if (!text) return { ok: false, reason: 'Paste the session export from your browser.' }

  // TextEncoder rather than Buffer: this module is imported by the settings
  // client component so a bad paste is caught before it is sent, and Buffer is
  // not a browser global.
  if (new TextEncoder().encode(text).length > MAX_PASTE_BYTES) {
    return {
      ok: false,
      reason:
        'That paste is too large to be a cookie export. Export the cookies for hudl.com only, not every site.',
    }
  }

  // A `document.cookie` string can never carry the session: Hudl's auth cookies
  // are HttpOnly, so that copy is guaranteed to be missing exactly the ones
  // that matter. Caught by name here, because accepting it produces a
  // connection that saves cleanly and then fails every import.
  if (!text.startsWith('{') && !text.startsWith('[')) {
    return {
      ok: false,
      reason:
        'That looks like a copied cookie string rather than an export. PlayScout needs the JSON export from a cookie-editor extension — a copied string leaves out the sign-in cookies, which are hidden from the page.',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'That is not valid JSON. Use the extension’s "Export" button and paste the whole thing.' }
  }

  const rawCookies = cookieArrayFrom(parsed)
  if (!rawCookies) {
    return {
      ok: false,
      reason:
        'PlayScout could not find any cookies in that export. It should be a JSON list of cookies, or an object with a "cookies" list.',
    }
  }
  if (!rawCookies.length) {
    return { ok: false, reason: 'That export contains no cookies at all.' }
  }
  if (rawCookies.length > MAX_COOKIES) {
    return {
      ok: false,
      reason: `That export contains ${rawCookies.length} cookies. Export the cookies for hudl.com only.`,
    }
  }

  const cookies: StorageStateCookie[] = []
  let dropped = 0

  for (const entry of rawCookies) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>

    const name = typeof row.name === 'string' ? row.name : ''
    const value = typeof row.value === 'string' ? row.value : ''
    const domain = typeof row.domain === 'string' ? row.domain : ''
    if (!name || !value || !domain) continue

    if (!isHudlDomain(domain)) {
      dropped++
      continue
    }

    cookies.push({
      name,
      value,
      domain,
      path: typeof row.path === 'string' && row.path ? row.path : '/',
      expires: normalizeExpires(row),
      httpOnly: row.httpOnly === true,
      // Hudl is https-only, and a cookie restored without `secure` would not be
      // sent back to it. Defaulting to true rather than to the export's value
      // costs nothing here and fixes exports that omit the field.
      secure: row.secure === undefined ? true : row.secure === true,
      sameSite: normalizeSameSite(row.sameSite),
    })
  }

  if (!cookies.length) {
    return {
      ok: false,
      reason:
        'None of those cookies are from hudl.com. Open Hudl in your browser, then export the cookies from that tab.',
    }
  }

  // Every Hudl cookie already dead means the export came from a signed-out
  // browser (or a very old clipboard). Storing it would produce an import that
  // fails at sign-in with nothing useful to say.
  const now = Date.now() / 1000
  const live = cookies.filter((c) => c.expires === -1 || c.expires > now)
  if (!live.length) {
    return {
      ok: false,
      reason:
        'Every cookie in that export has already expired. Sign in to Hudl again in your browser, then export a fresh one.',
    }
  }

  const futureExpiries = live.map((c) => c.expires).filter((e) => e > now)

  return {
    ok: true,
    // `origins` is required by the storageState shape; localStorage is not
    // something we ask a coach to export, and Hudl's session lives in cookies.
    storageState: JSON.stringify({ cookies: live, origins: [] }),
    cookieCount: live.length,
    droppedCount: dropped,
    expiresAt: futureExpiries.length ? new Date(Math.min(...futureExpiries) * 1000) : null,
  }
}
