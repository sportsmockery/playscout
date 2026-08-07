import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'

/**
 * Manual play-boundary creation — lets a coach add a play the worker's
 * scene-cut segmentation missed (or the only way to define plays at all for
 * continuous, unedited game footage, which has no detectable scene cuts).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { videoId, teamId, startTimeSeconds, endTimeSeconds } = body as {
    videoId?: string; teamId?: string; startTimeSeconds?: number; endTimeSeconds?: number
  }

  if (!videoId || !teamId || typeof startTimeSeconds !== 'number' || typeof endTimeSeconds !== 'number') {
    return NextResponse.json({ error: 'videoId, teamId, startTimeSeconds, and endTimeSeconds are required.' }, { status: 400 })
  }
  if (endTimeSeconds <= startTimeSeconds) {
    return NextResponse.json({ error: 'endTimeSeconds must be after startTimeSeconds.' }, { status: 400 })
  }

  const access = await requireTeamMember(teamId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()

  const { data: video, error: videoErr } = await supabase
    .from('videos')
    .select('id, team_id')
    .eq('id', videoId)
    .single()
  if (videoErr || !video || video.team_id !== teamId) {
    return NextResponse.json({ error: 'Video not found for this team.' }, { status: 404 })
  }

  const { count } = await supabase
    .from('play_sequences')
    .select('id', { count: 'exact', head: true })
    .eq('video_id', videoId)

  const { data: created, error } = await supabase
    .from('play_sequences')
    .insert({
      video_id: videoId,
      team_id: teamId,
      sequence_number: (count ?? 0) + 1,
      start_time_seconds: startTimeSeconds,
      end_time_seconds: endTimeSeconds,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  return NextResponse.json({ playSequence: created })
}
