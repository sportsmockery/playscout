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
import { promises as fs, createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
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
 * Is this a manifest that needs reassembling, or a file we can just fetch?
 *
 * Everything Hudl has actually served is a progressive `.mp4`. HLS is kept
 * supported because a playlist could offer one, and only there is ffmpeg
 * genuinely needed.
 */
export function isHlsUrl(raw: string): boolean {
  try {
    return /\.m3u8$/i.test(new URL(raw).pathname)
  } catch {
    return false
  }
}

const MAX_REDIRECTS = 5

/**
 * Streams a progressive file straight to disk.
 *
 * This used to go through ffmpeg, which **segfaulted on every HTTPS input** —
 * exit 139, no output, and no stderr, which is why 106 clips failed with a
 * message that said nothing. Reproduced directly: the same binary remuxes the
 * same file perfectly once it is on local disk, and lists https/tls in
 * `-protocols`. Its network layer is simply broken in this build.
 *
 * Fetching an mp4 was never ffmpeg's job anyway. No subprocess, no remux, no
 * TLS inside a static binary.
 *
 * Redirects are followed by hand so the private-host guard runs on every hop:
 * a URL that passes the check is still free to redirect into private space.
 */
async function streamClipToFile(
  mediaUrl: string,
  cookieHeader: string,
  outPath: string,
  userAgent: string
): Promise<void> {
  let url = assertFetchableMediaUrl(mediaUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CLIP_TIMEOUT_MS)

  try {
    let res: Response | null = null
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': userAgent,
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
        },
      })
      if (res.status < 300 || res.status >= 400) break
      const location = res.headers.get('location')
      if (!location) break
      url = assertFetchableMediaUrl(new URL(location, url).toString())
      res = null
    }

    if (!res) throw new HudlClipError('That clip redirected too many times.', 'redirect loop')
    if (!res.ok || !res.body) {
      throw new HudlClipError(
        'PlayScout could not download one of the clips from Hudl. It may have expired — try the import again.',
        `HTTP ${res.status}`
      )
    }

    // Capped while streaming rather than from content-length, which a server
    // is free to understate or omit.
    let bytes = 0
    const capped = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controllerT) {
        bytes += chunk.byteLength
        if (bytes > MAX_CLIP_BYTES) {
          throw new HudlClipError(
            'That clip is far larger than a cut-up should be, so it was skipped.',
            `exceeded ${MAX_CLIP_BYTES} bytes`
          )
        }
        controllerT.enqueue(chunk)
      },
    })

    await pipeline(
      Readable.fromWeb(res.body.pipeThrough(capped) as unknown as WebReadableStream<Uint8Array>),
      createWriteStream(outPath)
    )
  } finally {
    clearTimeout(timeout)
  }
}

/** Reassembles an HLS manifest into a seekable mp4. Only used for `.m3u8`. */
async function remuxHlsToFile(
  mediaUrl: string,
  cookieHeader: string,
  outPath: string,
  userAgent: string
): Promise<void> {
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
    // HLS arrives as MPEG-TS with ADTS audio; this converts it to the ASC form
    // mp4 wants. It is wrong for a progressive mp4, which is one reason that
    // path no longer goes through here at all.
    '-bsf:a',
    'aac_adtstoasc',
    '-movflags',
    '+faststart',
    outPath,
  ]

  const { code, stderr, signal } = await runFfmpeg(args, CLIP_TIMEOUT_MS).catch(() => ({
    code: 1,
    stderr: 'ffmpeg did not finish within the timeout',
    signal: null as NodeJS.Signals | null,
  }))

  if (code !== 0) {
    await fs.unlink(outPath).catch(() => {})
    // A crash gives a null code and an EMPTY stderr, which previously produced
    // a message identical to "no detail at all" — the single thing that made
    // this hardest to diagnose. Say it outright.
    const detail = signal
      ? `ffmpeg was killed by ${signal} (crashed) with no output`
      : stderr.trim() || `ffmpeg exited ${code} with no output`
    throw new HudlClipError(
      'PlayScout could not download one of the clips from Hudl. It may have expired — try the import again.',
      detail.slice(0, 500)
    )
  }
}

/**
 * Downloads one clip to `outPath` as mp4.
 *
 * Progressive files are fetched directly; only HLS goes through ffmpeg. Either
 * way the streams are copied, never re-encoded — these are already h264/aac,
 * and a re-encode would cost minutes per clip and lose detail the rubrics
 * grade.
 */
export async function downloadHudlClip(
  mediaUrl: string,
  cookieHeader: string,
  outPath: string,
  userAgent: string
): Promise<DownloadedClip> {
  try {
    if (isHlsUrl(mediaUrl)) {
      await remuxHlsToFile(mediaUrl, cookieHeader, outPath, userAgent)
    } else {
      await streamClipToFile(mediaUrl, cookieHeader, outPath, userAgent)
    }
  } catch (err) {
    await fs.unlink(outPath).catch(() => {})
    if (err instanceof HudlClipError) throw err
    throw new HudlClipError(
      'PlayScout could not download one of the clips from Hudl. It may have expired — try the import again.',
      err instanceof Error ? err.message : String(err)
    )
  }

  const stat = await fs.stat(outPath).catch(() => null)
  if (!stat || stat.size === 0) {
    await fs.unlink(outPath).catch(() => {})
    throw new HudlClipError('Hudl returned an empty clip.', 'zero bytes on disk')
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
