/**
 * Streams a coach-supplied film link to disk, for videos added via
 * "Add film from a link" (videos.source_type = 'external_url').
 *
 * Runs in the Railway worker, never in a Vercel function — same rule as every
 * other large-video path. The URL is user-supplied, so the guards matter as
 * much as the download:
 *
 * - validateRemoteVideoUrl() rejects the obvious cases up front
 * - DNS is resolved and EVERY returned address is checked, so a public
 *   hostname that resolves to 169.254.169.254 or 10.x can't slip through
 * - redirects are followed manually and each hop goes through both checks
 *   again, because a validated URL is free to redirect anywhere
 * - the response is size-capped while streaming, not just by Content-Length,
 *   which a server is free to lie about or omit
 */
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import dns from 'node:dns/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import {
  validateRemoteVideoUrl,
  isPrivateHost,
  isAcceptableVideoContentType,
  guessVideoExtension,
} from '../../lib/video/remote-source'

/** Matches the 12GB ceiling on direct uploads (UploadDockProvider). */
export const MAX_REMOTE_BYTES = Number(process.env.MAX_REMOTE_VIDEO_BYTES ?? 12 * 1024 * 1024 * 1024)
const MAX_REDIRECTS = 5
const REQUEST_TIMEOUT_MS = Number(process.env.REMOTE_VIDEO_TIMEOUT_MS ?? 10 * 60 * 1000)

export interface RemoteVideoResult {
  bytes: number
  contentType: string | null
  extension: string
}

/**
 * A fetch failure a coach can act on — a bad link, an expired signature, a
 * share page instead of a file. The worker surfaces the message on the video
 * row rather than a stack trace.
 */
export class RemoteVideoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RemoteVideoError'
  }
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (isPrivateHost(hostname)) {
    throw new RemoteVideoError('That link points at a private or internal address, which PlayScout will not fetch.')
  }
  // A hostname that passes the literal check can still resolve into private
  // space — resolve it and check what we'd actually connect to.
  let addresses: { address: string }[]
  try {
    addresses = await dns.lookup(hostname, { all: true })
  } catch {
    throw new RemoteVideoError(`Could not resolve ${hostname}. Check the link and try again.`)
  }
  if (!addresses.length || addresses.some((a) => isPrivateHost(a.address))) {
    throw new RemoteVideoError('That link resolves to a private or internal address, which PlayScout will not fetch.')
  }
}

/**
 * Follows redirects by hand so each hop is re-validated. Returns the final
 * response, still unread, for streaming.
 */
async function fetchWithGuards(startUrl: string, signal: AbortSignal): Promise<{ res: Response; finalUrl: string }> {
  let current = startUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = validateRemoteVideoUrl(current)
    if (!check.ok) throw new RemoteVideoError(check.reason)
    await assertPublicHost(new URL(check.url).hostname)

    const res = await fetch(check.url, {
      redirect: 'manual',
      signal,
      headers: { accept: 'video/*,application/octet-stream;q=0.9,*/*;q=0.8' },
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      await res.body?.cancel().catch(() => {})
      if (!location) throw new RemoteVideoError(`The link redirected with no destination (HTTP ${res.status}).`)
      current = new URL(location, check.url).toString()
      continue
    }

    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel().catch(() => {})
      throw new RemoteVideoError(
        'That link needs a sign-in or its signature has expired. Use a public or freshly signed link.'
      )
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      throw new RemoteVideoError(`The link returned HTTP ${res.status}.`)
    }

    return { res, finalUrl: check.url }
  }

  throw new RemoteVideoError('The link redirected too many times.')
}

/**
 * Downloads `sourceUrl` to `destPath`. Throws RemoteVideoError with
 * coach-readable copy on any rejection; the partial file is cleaned up.
 */
export async function downloadRemoteVideo(sourceUrl: string, destPath: string): Promise<RemoteVideoResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const { res, finalUrl } = await fetchWithGuards(sourceUrl, controller.signal)

    const contentType = res.headers.get('content-type')
    const typeCheck = isAcceptableVideoContentType(contentType)
    if (!typeCheck.ok) {
      await res.body?.cancel().catch(() => {})
      throw new RemoteVideoError(typeCheck.reason)
    }

    const declared = Number(res.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > MAX_REMOTE_BYTES) {
      await res.body?.cancel().catch(() => {})
      throw new RemoteVideoError(
        `That file is ${Math.round(declared / (1024 * 1024 * 1024))}GB — larger than the ${Math.round(MAX_REMOTE_BYTES / (1024 * 1024 * 1024))}GB limit.`
      )
    }
    if (!res.body) throw new RemoteVideoError('The link returned an empty response.')

    let bytes = 0
    const counted = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        bytes += chunk.byteLength
        // Content-Length can be absent or wrong; this is the real ceiling.
        if (bytes > MAX_REMOTE_BYTES) {
          ctrl.error(
            new RemoteVideoError(
              `That file is larger than the ${Math.round(MAX_REMOTE_BYTES / (1024 * 1024 * 1024))}GB limit.`
            )
          )
          return
        }
        ctrl.enqueue(chunk)
      },
    })

    await pipeline(
      Readable.fromWeb(res.body.pipeThrough(counted) as unknown as WebReadableStream<Uint8Array>),
      createWriteStream(destPath)
    )

    if (bytes === 0) throw new RemoteVideoError('The link returned an empty file.')

    return { bytes, contentType, extension: guessVideoExtension(finalUrl, contentType) }
  } catch (err) {
    await unlink(destPath).catch(() => {})
    if (err instanceof RemoteVideoError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new RemoteVideoError('Fetching the film timed out. Check that the link serves the file directly.')
    }
    throw new RemoteVideoError(
      `Could not fetch the film from that link: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    clearTimeout(timeout)
  }
}
