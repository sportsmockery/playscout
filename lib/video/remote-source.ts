/**
 * Validation for "add film from a link".
 *
 * A coach pastes a URL and a background worker fetches it. That makes the URL
 * an attacker-controlled fetch target, so everything here is about deciding —
 * before any request is made — whether a link is one we're willing to pull:
 *
 * - only http/https, no embedded credentials
 * - never a private/loopback/link-local address (cloud metadata endpoints
 *   being the classic SSRF prize)
 * - never a streaming-platform watch page: those aren't file links, and
 *   scraping them is against those platforms' terms. Coaches get a message
 *   telling them what to paste instead, not a generic failure.
 *
 * Pure and dependency-free so both the API route (fast rejection with a real
 * explanation) and the worker (re-validated per redirect hop) can use it.
 */

/** A rejection always carries coach-readable copy explaining what to do instead. */
export type Check = { ok: true } | { ok: false; reason: string }
export type RemoteSourceCheck = { ok: true; url: string } | { ok: false; reason: string }

/**
 * Watch pages, not film files. Listed with a specific message because
 * "invalid URL" would read as a bug when a coach pastes the link they were
 * literally watching the game on.
 */
const PLATFORM_HOSTS: Record<string, string> = {
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'youtube-nocookie.com': 'YouTube',
  'vimeo.com': 'Vimeo',
  'twitch.tv': 'Twitch',
  'facebook.com': 'Facebook',
  'fb.watch': 'Facebook',
  'instagram.com': 'Instagram',
  'tiktok.com': 'TikTok',
  'x.com': 'X',
  'twitter.com': 'X',
}

/** Hosts that serve film but only behind a session — a share link is a page. */
const ACCOUNT_ONLY_HOSTS: Record<string, string> = {
  'hudl.com': 'Hudl',
  'maxpreps.com': 'MaxPreps',
}

const LOCAL_SUFFIXES = ['.local', '.internal', '.localdomain', '.home.arpa']

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'mpg', 'mpeg', 'wmv', 'flv']

function baseDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split('.')
  return parts.length <= 2 ? parts.join('.') : parts.slice(-2).join('.')
}

/**
 * True for addresses that must never be fetched on a user's behalf: loopback,
 * link-local (including the 169.254.169.254 metadata endpoint), and the
 * RFC1918 / unique-local private ranges. Takes a hostname OR a resolved IP,
 * so the worker can re-check what DNS actually returned.
 */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')

  if (h === 'localhost' || h === 'localhost.localdomain') return true
  if (LOCAL_SUFFIXES.some((suffix) => h.endsWith(suffix))) return true

  // IPv6 (and IPv4-mapped IPv6 like ::ffff:10.0.0.1)
  if (h.includes(':')) {
    if (h === '::' || h === '::1') return true
    if (/^f[cd][0-9a-f]{2}:/.test(h)) return true // fc00::/7 unique-local
    if (/^fe[89ab][0-9a-f]:/.test(h)) return true // fe80::/10 link-local
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateHost(mapped[1])
    return false
  }

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!v4) return false
  const [a, b] = v4.slice(1).map(Number)
  if ([a, b].some((n) => Number.isNaN(n) || n > 255)) return true // malformed → refuse
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  if (a >= 224) return true // multicast / reserved
  return false
}

export function validateRemoteVideoUrl(raw: string): RemoteSourceCheck {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { ok: false, reason: 'Paste a link to the film file.' }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, reason: "That doesn't look like a valid URL." }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'Only http and https links can be fetched.' }
  }
  if (url.username || url.password) {
    return {
      ok: false,
      reason: 'Remove the username and password from the link — use a signed or public link instead.',
    }
  }

  const host = url.hostname.toLowerCase()
  if (isPrivateHost(host)) {
    return { ok: false, reason: 'That link points at a private or internal address, which PlayScout will not fetch.' }
  }

  const platform = PLATFORM_HOSTS[baseDomain(host)]
  if (platform) {
    return {
      ok: false,
      reason: `PlayScout can't pull film from ${platform} — that's a watch page, not a film file, and downloading it isn't allowed under ${platform}'s terms. If it's your own ${platform} upload, download the file from your ${platform} account and paste a link to that file (or upload it directly).`,
    }
  }

  const accountOnly = ACCOUNT_ONLY_HOSTS[baseDomain(host)]
  if (accountOnly) {
    return {
      ok: false,
      reason: `${accountOnly} links need a signed-in session, so PlayScout can't fetch them. Export the clip from ${accountOnly} and paste a link to the exported file, or upload it directly.`,
    }
  }

  return { ok: true, url: url.toString() }
}

/**
 * Best-effort file extension for the object we store frames against. Content
 * type wins when the URL is a signed link with no filename in the path.
 */
export function guessVideoExtension(rawUrl: string, contentType?: string | null): string {
  try {
    const path = new URL(rawUrl).pathname
    const ext = path.split('.').pop()?.toLowerCase()
    if (ext && VIDEO_EXTENSIONS.includes(ext)) return ext
  } catch {
    // fall through to content type
  }
  const subtype = contentType?.split(';')[0]?.trim().split('/')[1]?.toLowerCase()
  if (subtype === 'quicktime') return 'mov'
  if (subtype && VIDEO_EXTENSIONS.includes(subtype)) return subtype
  return 'mp4'
}

/** A readable default title from the link, so the coach isn't forced to type one. */
export function titleFromUrl(rawUrl: string): string {
  try {
    const path = new URL(rawUrl).pathname
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '')
    const stripped = last.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
    if (stripped) return stripped.slice(0, 120)
  } catch {
    // fall through
  }
  return 'Film from link'
}

/**
 * A response we're willing to treat as film. Servers are inconsistent about
 * content types on signed URLs, so octet-stream and missing types pass; an
 * HTML page (the usual "that was a share page, not a file" case) does not.
 */
export function isAcceptableVideoContentType(contentType?: string | null): Check {
  if (!contentType) return { ok: true }
  const type = contentType.split(';')[0]?.trim().toLowerCase()
  if (!type) return { ok: true }
  if (type.startsWith('video/')) return { ok: true }
  if (type === 'application/octet-stream' || type === 'binary/octet-stream') return { ok: true }
  if (type.startsWith('text/html') || type === 'application/xhtml+xml') {
    return {
      ok: false,
      reason: 'That link returns a web page, not a video file. Paste the direct link to the film file itself.',
    }
  }
  return { ok: false, reason: `That link returns ${type}, which isn't a video file.` }
}
