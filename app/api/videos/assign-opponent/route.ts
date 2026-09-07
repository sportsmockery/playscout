import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

/**
 * POST /api/videos/assign-opponent — tag a selection of clips as film OF a
 * particular opponent, or back to the coach's own film (`opponentId: null`).
 *
 * SCOUTIQ only sees film with an `opponent_id` (`getVideosByOpponent`), and
 * until now nothing could set that after the fact: film imported or uploaded
 * without choosing an opponent was invisible to the scouting module forever.
 * Mirrors /api/videos/move, which has the same shape for folders.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { teamId, videoIds, opponentId } = body as {
    teamId?: string
    videoIds?: string[]
    opponentId?: string | null
  }

  if (!teamId || !Array.isArray(videoIds) || videoIds.length === 0) {
    return NextResponse.json({ error: 'teamId and videoIds are required.' }, { status: 400 })
  }

  const access = await requireTeamMember(teamId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()

  if (opponentId) {
    const { data: opponent } = await supabase
      .from('opponents')
      .select('id, team_id')
      .eq('id', opponentId)
      .maybeSingle()
    if (!opponent || opponent.team_id !== teamId) {
      return NextResponse.json({ error: 'Opponent not found for this team.' }, { status: 404 })
    }
  }

  // `film_type` moves with the tag: the two are one fact, and letting them
  // disagree is how a clip ends up scouted as an opponent while every team
  // module still counts it as our own.
  const { data, error } = await supabase
    .from('videos')
    .update({ opponent_id: opponentId ?? null, film_type: opponentId ? 'opponent' : 'self' })
    // .eq('team_id') as well as .in('id') — the ids come from the client, and
    // this must not become a way to re-tag another team's film.
    .eq('team_id', teamId)
    .in('id', videoIds)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ assigned: data?.length ?? 0 })
}
