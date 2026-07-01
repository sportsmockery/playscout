import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { uploadId, storagePath, teamId, title } = await req.json()
    const supabase = await createClient()

    const { data: video, error } = await supabase
      .from('videos')
      .insert({
        team_id: teamId,
        title: title ?? 'Untitled Film',
        source_type: 'upload',
        storage_path: storagePath,
        status: 'uploaded',
      })
      .select()
      .single()

    if (error) throw error

    await supabase
      .from('video_uploads')
      .update({ upload_status: 'uploaded', storage_path: storagePath })
      .eq('id', uploadId)

    await supabase.from('video_processing_jobs').insert({
      video_id: video.id,
      team_id: teamId,
      job_type: 'full_pipeline',
      status: 'queued',
      priority: 5,
    })

    return NextResponse.json({ videoId: video.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to complete upload'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
