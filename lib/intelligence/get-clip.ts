import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadClipToGemini, type ClipSource } from '@/lib/ai/providers/google'

/**
 * Resolves a video (and optionally one play within it) to something Gemini can
 * read as video rather than as a handful of stills.
 *
 * Two things make this cheap enough to run across a whole game:
 *
 * - A film too large to inline is uploaded to the Files API **once** and the
 *   handle cached on the video row. A 60-play breakdown of one game film is
 *   one upload, not sixty.
 * - A single play is read out of a longer film with start/end offsets, so
 *   there is no re-encode and no second copy. This also fixes a real defect in
 *   the frame path: `getVideoFrames` has no play filter, so analyzing play 12
 *   of a merged playlist showed the model all 100 plays.
 */

/** Above this, upload to the Files API instead of putting bytes in the request. */
const INLINE_MAX_BYTES = 20 * 1024 * 1024

/** Don't reuse a handle about to expire mid-batch. */
const FILE_EXPIRY_MARGIN_MS = 10 * 60 * 1000

const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mpg: 'video/mpeg',
  mpeg: 'video/mpeg',
}

export function mimeTypeForPath(storagePath: string): string {
  const ext = storagePath.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[ext] ?? 'video/mp4'
}

export interface ResolvedClip {
  source: ClipSource
  /** Set only when a single play was requested — the slice Gemini should read. */
  startOffsetSeconds?: number
  endOffsetSeconds?: number
  /** Of the slice if one was requested, else of the whole film. Null when unknown. */
  durationSeconds: number | null
}

interface VideoRow {
  storage_path: string | null
  duration_seconds: number | null
  gemini_file_uri: string | null
  gemini_file_expires_at: string | null
}

function handleIsUsable(row: VideoRow): boolean {
  if (!row.gemini_file_uri) return false
  if (!row.gemini_file_expires_at) return true
  return new Date(row.gemini_file_expires_at).getTime() - Date.now() > FILE_EXPIRY_MARGIN_MS
}

/**
 * Returns null when this film cannot be read as video — most often film added
 * from an external link, which has no `storage_path` because the coach's host
 * stays the source of truth. Callers fall back to frames rather than failing:
 * a slightly worse read beats no read.
 */
export async function getAnalysisClip(
  videoId: string,
  supabase: SupabaseClient,
  opts: { playSequenceId?: string } = {}
): Promise<ResolvedClip | null> {
  const { data } = await supabase
    .from('videos')
    .select('storage_path, duration_seconds, gemini_file_uri, gemini_file_expires_at')
    .eq('id', videoId)
    .maybeSingle()

  const video = data as VideoRow | null
  if (!video?.storage_path) return null

  const slice = opts.playSequenceId
    ? await getPlayOffsets(opts.playSequenceId, videoId, supabase)
    : null

  const durationSeconds = slice
    ? slice.endOffsetSeconds - slice.startOffsetSeconds
    : video.duration_seconds != null
      ? Number(video.duration_seconds)
      : null

  const mimeType = mimeTypeForPath(video.storage_path)

  // The whole point of caching the handle: every play after the first skips
  // the download entirely.
  if (handleIsUsable(video)) {
    return {
      source: { kind: 'file', fileUri: video.gemini_file_uri!, mimeType },
      ...(slice ?? {}),
      durationSeconds,
    }
  }

  const { data: blob, error } = await supabase.storage.from('videos').download(video.storage_path)
  if (error || !blob) return null

  const bytes = Buffer.from(await blob.arrayBuffer())

  if (bytes.byteLength <= INLINE_MAX_BYTES) {
    return { source: { kind: 'inline', bytes, mimeType }, ...(slice ?? {}), durationSeconds }
  }

  const uploaded = await uploadClipToGemini(bytes, mimeType, videoId)

  // Best-effort: a failed cache write costs a re-upload on the next play, not
  // a failed analysis.
  await supabase
    .from('videos')
    .update({ gemini_file_uri: uploaded.fileUri, gemini_file_expires_at: uploaded.expiresAt })
    .eq('id', videoId)

  return {
    source: { kind: 'file', fileUri: uploaded.fileUri, mimeType },
    ...(slice ?? {}),
    durationSeconds,
  }
}

async function getPlayOffsets(
  playSequenceId: string,
  videoId: string,
  supabase: SupabaseClient
): Promise<{ startOffsetSeconds: number; endOffsetSeconds: number } | null> {
  const { data } = await supabase
    .from('play_sequences')
    .select('start_time_seconds, end_time_seconds, video_id')
    .eq('id', playSequenceId)
    .maybeSingle()

  // A play belonging to another video would silently analyze the wrong film.
  if (!data || data.video_id !== videoId) return null
  if (data.start_time_seconds == null || data.end_time_seconds == null) return null

  const startOffsetSeconds = Number(data.start_time_seconds)
  const endOffsetSeconds = Number(data.end_time_seconds)
  if (!(endOffsetSeconds > startOffsetSeconds)) return null

  return { startOffsetSeconds, endOffsetSeconds }
}
