import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

/**
 * POST /api/videos/scout-exclude — take clips out of scouting, or put them
 * back (excluded: false). Bulk, because the usual case is "everything before
 * the opening kickoff": the backups' scrimmage at the head of a game cut-up.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { teamId, videoIds, excluded } = body as {
    teamId?: string
    videoIds?: string[]
    excluded?: boolean
  }

  if (!teamId || !Array.isArray(videoIds) || videoIds.length === 0 || typeof excluded !== 'boolean') {
    return NextResponse.json({ error: 'teamId, videoIds and excluded are required.' }, { status: 400 })
  }

  const access = await requireTeamMember(teamId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()
  // .eq('team_id') as well as .in('id') — the ids come from the client.
  const { data, error } = await supabase
    .from('videos')
    .update({ scout_excluded: excluded })
    .eq('team_id', teamId)
    .in('id', videoIds)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // RLS refuses a write by returning zero rows, not an error.
  if (!data?.length) {
    return NextResponse.json({ error: 'No clips were updated — check you can edit this team.' }, { status: 403 })
  }
  return NextResponse.json({ updated: data.length })
}
