/**
 * Pulls one Hudl clip down to disk.
 *
 * Hudl serves cut-ups behind the same session that renders the page, so the
 * download carries the browser's cookies. ffmpeg does the fetching for both
 * shapes we might be handed — a progressive mp4 and an HLS manifest — because
 * HLS is a manifest plus a few dozen segments, and reassembling that by hand
 * would be a worse version of what ffmpeg already does.
 *
 * The caller pulls clips SERIALLY with a delay between them. Fifty parallel
 * requests against a coach's own account is both rude and a good way to get
 * that account flagged, which would cost them Hudl rather than cost us a
 * feature.
 */
import { promises as fs } from 'node:fs'
import { runFfmpeg } from './ffmpeg'
import { isPrivateHost } from '../../lib/video/remote-source'

export interface DownloadedClip {
  path: string
  bytes: number
}

/**
 * Strips the query string out of every URL in a blob of text.
 *
 * ffmpeg quotes the URL it was given in its errors, and Hudl's media URLs are
 * signed — the query string IS the credential. This runs over anything from
 * ffmpeg before it reaches a log line.
 */
export function redactUrls(text: string): string {
  return text.replace(/(https?:\/\/[^\s?'"]+)\?[^\s'"]*/gi, '$1?<redacted>')
}

/**
 * A clip that could not be pulled.
 *
 * `message` is the diagnostic the worker logs, with URLs redacted;
 * `coachMessage` is the sentence that reaches a screen and a database row.
 */
export class HudlClipError extends Error {
  readonly coachMessage: string
  constructor(coachMessage: string, detail?: string) {
    super(detail ? `hudl clip download failed: ${redactUrls(detail)}` : 'hudl clip download failed')
    this.name = 'HudlClipError'
    this.coachMessage = coachMessage
  }
}

export interface BrowserCookie {
  name: string
  value: string
  domain: string
  path: string
  secure?: boolean
}

function domainMatches(cookieDomain: string, hostname: string): boolean {
  const domain = cookieDomain.replace(/^\./, '').toLowerCase()
  const host = hostname.toLowerCase()
  return host === domain || host.endsWith(`.${domain}`)
}

/**
 * The `Cookie:` header a request to `url` should carry, from the browser
 * context's cookie jar.
 *
 * Filtering by domain and path rather than sending the whole jar matters: the
 * media host is not always the app host, and shipping every cookie we hold to
 * whatever CDN Hudl points at hands that CDN the session.
 */
export function cookieHeaderFor(cookies: BrowserCookie[], url: string): string {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return ''
  }
  const secureOk = target.protocol === 'https:'

  const parts = cookies
    .filter((c) => domainMatches(c.domain, target.hostname))
    .filter((c) => target.pathname.startsWith(c.path || '/'))
    .filter((c) => !c.secure || secureOk)
    .map((c) => `${c.name}=${c.value}`)

  return parts.join('; ')
}

/** Rejects a media URL we should not be fetching before ffmpeg is handed it. */
export function assertFetchableMediaUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new HudlClipError('Hudl gave PlayScout a clip address it could not read.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new HudlClipError('Hudl gave PlayScout a clip address PlayScout will not fetch.')
  }
  // The URL comes out of Hudl's own payload, so this is a cheap belt rather
  // than a live threat — but a payload is still data, and data that decides
  // what we connect to gets checked.
  if (isPrivateHost(url.hostname)) {
    throw new HudlClipError('Hudl gave PlayScout a clip address PlayScout will not fetch.')
  }
  return url
}

const CLIP_TIMEOUT_MS = Number(process.env.HUDL_CLIP_TIMEOUT_MS ?? 5 * 60 * 1000)
/** A cut-up clip is 5-20 seconds. Anything near this is not one clip. */
const MAX_CLIP_BYTES = Number(process.env.HUDL_MAX_CLIP_BYTES ?? 512 * 1024 * 1024)

/**
 * Downloads one clip to `outPath` as mp4.
 *
 * Streams are copied, never re-encoded: these are already h264/aac, and a
 * re-encode would cost minutes per clip and lose detail the rubrics grade.
 */
export async function downloadHudlClip(
  mediaUrl: string,
  cookieHeader: string,
  outPath: string,
  userAgent: string
): Promise<DownloadedClip> {
  assertFetchableMediaUrl(mediaUrl)

  const args = [
    '-y',
    '-loglevel',
    'error',
    // ffmpeg wants headers as one CRLF-delimited blob. An empty cookie header
    // is omitted rather than sent blank.
    ...(cookieHeader ? ['-headers', `Cookie: ${cookieHeader}\r\n`] : []),
    '-user_agent',
    userAgent,
    '-i',
    mediaUrl,
    '-c',
    'copy',
    // HLS arrives as MPEG-TS; this is what makes the result seekable, which
    // the play-offset path in get-clip.ts depends on.
    '-bsf:a',
    'aac_adtstoasc',
    '-movflags',
    '+faststart',
    outPath,
  ]

  const { code, stderr } = await runFfmpeg(args, CLIP_TIMEOUT_MS).catch(() => ({
    code: 1,
    stderr: 'timeout',
  }))

  if (code !== 0) {
    await fs.unlink(outPath).catch(() => {})
    // ffmpeg's stderr is the only thing that says WHY, so it is kept as the
    // logged detail — with URLs redacted, because Hudl's media URLs are signed
    // and the query string is the credential.
    throw new HudlClipError(
      'PlayScout could not download one of the clips from Hudl. It may have expired — try the import again.',
      stderr.trim().slice(0, 500)
    )
  }

  const stat = await fs.stat(outPath).catch(() => null)
  if (!stat || stat.size === 0) {
    await fs.unlink(outPath).catch(() => {})
    throw new HudlClipError('Hudl returned an empty clip.')
  }
  if (stat.size > MAX_CLIP_BYTES) {
    await fs.unlink(outPath).catch(() => {})
    throw new HudlClipError('That clip is far larger than a cut-up should be, so it was skipped.')
  }

  return { path: outPath, bytes: stat.size }
}

/** Redacts a media URL for logs — the query string is where the token lives. */
export function mediaUrlForLog(raw: string): string {
  try {
    const url = new URL(raw)
    return `${url.origin}${url.pathname}`
  } catch {
    return '(unparseable url)'
  }
}
