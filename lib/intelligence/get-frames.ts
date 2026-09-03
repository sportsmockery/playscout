import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A single evidence frame, carrying the two things the model needs in order to
 * cite it truthfully: which frame it is, and when in the clip it was taken.
 *
 * Frames used to reach the model as a bare `string[]` of base64 JPEGs. Nothing
 * told the model which image was which, yet every module schema requires
 * `evidence_frames: INTEGER[]` — so a cited index was a guess dressed as a
 * citation. `index` is the frame's real identity (`video_frames.frame_index`),
 * not its position in whatever array survived the download.
 */
export interface EvidenceFrame {
  /** `video_frames.frame_index` — stable, and never renumbered by a failed download. */
  index: number
  /** Seconds into the video. Null for browser-extracted quick-clip frames, which carry no timing. */
  timestampSeconds: number | null
  /** Raw base64 JPEG, no data-URL prefix. */
  base64: string
}

/**
 * More than this share of frames failing to download means the film in front
 * of the model is not the film the coach uploaded. Better to fail the job than
 * to grade a quarter of a play and present it as a read of the whole rep.
 */
const MAX_MISSING_FRAME_RATIO = 0.25

/**
 * Downloads a processed video's evidence frames.
 *
 * Takes its Supabase client as a parameter rather than building one: this
 * module is imported by both Next.js route handlers (cookie client) and the
 * standalone Railway analysis worker (service-role client), and the worker
 * has no request context to build one from. Same rationale as the note at
 * the top of lib/ai/record-usage.ts.
 *
 * A frame that fails to download is dropped, but the surviving frames keep
 * their original `frame_index`. The previous implementation compacted the
 * array, which silently renumbered every later frame — so one failed download
 * shifted every citation after it onto the wrong moment, with nothing in the
 * output to show it had happened.
 */
export async function getVideoFrames(
  videoId: string,
  supabase: SupabaseClient
): Promise<EvidenceFrame[]> {
  const { data: frameRows } = await supabase
    .from('video_frames')
    .select('storage_path, frame_index, timestamp_seconds')
    .eq('video_id', videoId)
    .order('frame_index', { ascending: true })

  if (!frameRows?.length) return []

  const downloaded = await Promise.all(
    frameRows.map(async (row): Promise<EvidenceFrame | null> => {
      const { data, error } = await supabase.storage.from('frames').download(row.storage_path)
      if (error || !data) return null
      const buffer = Buffer.from(await data.arrayBuffer())
      return {
        index: Number(row.frame_index),
        timestampSeconds: row.timestamp_seconds != null ? Number(row.timestamp_seconds) : null,
        base64: buffer.toString('base64'),
      }
    })
  )

  const frames = downloaded.filter((f): f is EvidenceFrame => f !== null)
  const missing = frameRows.length - frames.length

  if (missing > 0 && missing / frameRows.length > MAX_MISSING_FRAME_RATIO) {
    throw new Error(
      `Only ${frames.length} of ${frameRows.length} frames could be read for this film. ` +
        `Analyzing a fraction of the play would misrepresent it — retry the upload from the film library.`
    )
  }

  return frames
}

/**
 * Wraps caller-supplied base64 frames (the browser quick-clip path, which
 * extracts in-page and has no `video_frames` rows) in the same envelope.
 * Indexes are positional and timestamps unknown — which is the honest
 * representation, and is why the frame labels sent to the model omit a time
 * for these rather than inventing one.
 */
export function framesFromBase64(frames: string[]): EvidenceFrame[] {
  return frames.map((frame, index) => ({
    index,
    timestampSeconds: null,
    // Browser extraction produces `data:image/jpeg;base64,...` data URLs.
    base64: frame.includes(',') ? frame.slice(frame.indexOf(',') + 1) : frame,
  }))
}
