import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // RLS on video_frames scopes this to the requester's own team already —
  // this just turns storage_path into a short-lived signed URL the <img>
  // tag can actually load (the frames bucket is private).
  const { data: frames, error } = await supabase
    .from('video_frames')
    .select('frame_index, storage_path')
    .eq('video_id', videoId)
    .order('frame_index', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!frames?.length) {
    return NextResponse.json({ frames: [] })
  }

  const signed = await Promise.all(
    frames.map(async (f) => {
      const { data } = await supabase.storage
        .from('frames')
        .createSignedUrl(f.storage_path, 3600)
      return { frame_index: f.frame_index, url: data?.signedUrl ?? null }
    })
  )

  return NextResponse.json({ frames: signed.filter((f) => f.url) })
}
