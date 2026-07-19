import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Resets the existing processing job back to `queued` so the worker picks it
 * back up on its next poll — never inserts a second job or a second video
 * row, so this never produces a duplicate upload.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: video, error: videoErr } = await supabase
    .from('videos')
    .select('id, status')
    .eq('id', videoId)
    .single()
  if (videoErr || !video) {
    return NextResponse.json({ error: 'Video not found.' }, { status: 404 })
  }
  if (video.status !== 'failed') {
    return NextResponse.json({ error: 'Only a failed video can be retried.' }, { status: 400 })
  }

  const { data: job, error: jobErr } = await supabase
    .from('video_processing_jobs')
    .select('id')
    .eq('video_id', videoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (jobErr || !job) {
    return NextResponse.json({ error: 'No processing job found for this video.' }, { status: 404 })
  }

  // videos' UPDATE policy is the actual write-role gate (video_processing_jobs'
  // is org-membership-only). Verify this one first — RLS silently returns zero
  // affected rows on denial rather than erroring, so a `.select()` + length
  // check is required to actually detect it, not just the absence of an error.
  const { data: videoUpdated, error: videoUpdateErr } = await supabase
    .from('videos')
    .update({ status: 'uploaded', error_message: null })
    .eq('id', videoId)
    .select('id')
  if (videoUpdateErr) {
    return NextResponse.json({ error: videoUpdateErr.message }, { status: 403 })
  }
  if (!videoUpdated?.length) {
    return NextResponse.json({ error: 'You do not have permission to retry this video.' }, { status: 403 })
  }

  const { error: jobUpdateErr } = await supabase
    .from('video_processing_jobs')
    .update({
      status: 'queued',
      attempts: 0,
      error_message: null,
      locked_by: null,
      locked_at: null,
      started_at: null,
      completed_at: null,
      progress: 0,
      current_step: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
  if (jobUpdateErr) {
    return NextResponse.json({ error: jobUpdateErr.message }, { status: 403 })
  }

  return NextResponse.json({ ok: true })
}
