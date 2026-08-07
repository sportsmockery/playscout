import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMemberForRow } from '@/lib/auth/require-team-member'

/**
 * Lightweight polling endpoint for the film card's "Processing" badge — a
 * coach-friendly current_step/progress readout so a multi-minute full-game
 * upload doesn't sit at a static "Processing" spinner with no feedback.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params
  const access = await requireTeamMemberForRow('videos', videoId)
  if (access.error) return access.error

  const supabase = await createClient()
  const [{ data: video }, { data: job }] = await Promise.all([
    supabase.from('videos').select('status, error_message').eq('id', videoId).maybeSingle(),
    supabase
      .from('video_processing_jobs')
      .select('status, progress, current_step')
      .eq('video_id', videoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!video) {
    return NextResponse.json({ error: 'Video not found.' }, { status: 404 })
  }

  return NextResponse.json({
    videoStatus: video.status,
    errorMessage: video.error_message,
    jobStatus: job?.status ?? null,
    progress: job?.progress ?? null,
    currentStep: job?.current_step ?? null,
  })
}
