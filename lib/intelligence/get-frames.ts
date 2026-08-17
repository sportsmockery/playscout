import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Downloads a processed video's evidence frames as base64 JPEGs.
 *
 * Takes its Supabase client as a parameter rather than building one: this
 * module is imported by both Next.js route handlers (cookie client) and the
 * standalone Railway analysis worker (service-role client), and the worker
 * has no request context to build one from. Same rationale as the note at
 * the top of lib/ai/record-usage.ts.
 */
export async function getVideoFramesBase64(
  videoId: string,
  supabase: SupabaseClient
): Promise<string[]> {
  const { data: frameRows } = await supabase
    .from('video_frames')
    .select('storage_path, frame_index')
    .eq('video_id', videoId)
    .order('frame_index', { ascending: true })

  if (!frameRows?.length) return []

  const frames = await Promise.all(
    frameRows.map(async (row) => {
      const { data, error } = await supabase.storage.from('frames').download(row.storage_path)
      if (error || !data) return null
      const buffer = Buffer.from(await data.arrayBuffer())
      return buffer.toString('base64')
    })
  )

  return frames.filter((f): f is string => f !== null)
}
