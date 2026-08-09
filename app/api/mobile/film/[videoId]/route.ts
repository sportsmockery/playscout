import { NextResponse } from 'next/server'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'
import { requireTeamMemberForRow } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

/**
 * GET /api/mobile/film/[videoId]
 *
 * Film detail aggregate: the video, its processing job state, confirmed plays,
 * and existing analyses. Access is resolved from the video's own team_id, so a
 * client can't spoof it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase } = auth.ok
  const { videoId } = await params

  const access = await requireTeamMemberForRow('videos', videoId, { supabase })
  if (access.error) return access.error

  const [video, job, plays, analyses] = await Promise.all([
    supabase
      .from('videos')
      .select(
        'id, team_id, title, status, processing_status, film_type, opponent_id, thumbnail_path, storage_path, duration_seconds, error_message, created_at',
      )
      .eq('id', videoId)
      .maybeSingle(),
    supabase
      .from('video_processing_jobs')
      .select('status, progress, current_step, error_message')
      .eq('video_id', videoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('play_sequences')
      .select('id, sequence_number, start_time_seconds, end_time_seconds, down, distance, yard_line, result, coach_label, confidence')
      .eq('video_id', videoId)
      .order('sequence_number', { ascending: true }),
    supabase
      .from('position_analysis_results')
      .select('id, module_key, overall_score, summary, player_id, play_sequence_id, created_at')
      .eq('video_id', videoId)
      .order('created_at', { ascending: false }),
  ])

  if (!video.data) return mobileError('Video not found.', 404)

  return NextResponse.json({
    video: video.data,
    role: access.role,
    job: job.data ?? null,
    plays: plays.data ?? [],
    analyses: analyses.data ?? [],
  })
}
