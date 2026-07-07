import { createClient } from '@/lib/supabase/server'

export async function getVideoFramesBase64(videoId: string): Promise<string[]> {
  const supabase = await createClient()

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
