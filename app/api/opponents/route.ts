import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'teamId is required.' }, { status: 400 })

  const access = await requireTeamMember(teamId)
  if (access.error) return access.error

  const supabase = await createClient()
  const { data } = await supabase
    .from('opponents')
    .select('*')
    .eq('team_id', teamId)
    .order('next_game_date', { ascending: true, nullsFirst: false })

  return NextResponse.json({ opponents: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { teamId, name, ageGroup, nextGameDate, notes, jerseyColor } = body as {
    teamId?: string; name?: string; ageGroup?: string; nextGameDate?: string; notes?: string
    jerseyColor?: string
  }
  if (!teamId || !name) {
    return NextResponse.json({ error: 'teamId and name are required.' }, { status: 400 })
  }

  const access = await requireTeamMember(teamId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('opponents')
    .insert({
      team_id: teamId,
      name,
      age_group: ageGroup || null,
      next_game_date: nextGameDate || null,
      notes: notes || null,
      jersey_color: jerseyColor?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  return NextResponse.json({ opponent: data })
}

/**
 * Updates one opponent. Today only the jersey colour, because that is the field
 * a coach corrects while looking at the film — it decides which side SCOUTIQ
 * grades, and it used to live in page state that a reload threw away.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { teamId, opponentId, jerseyColor } = body as {
    teamId?: string; opponentId?: string; jerseyColor?: string
  }
  if (!teamId || !opponentId) {
    return NextResponse.json({ error: 'teamId and opponentId are required.' }, { status: 400 })
  }

  const access = await requireTeamMember(teamId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('opponents')
    .update({ jersey_color: jerseyColor?.trim() || null })
    // Scoped by team as well as id: an opponent id alone would let a member of
    // one team edit another team's scouting subject.
    .eq('id', opponentId)
    .eq('team_id', teamId)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  if (!data) return NextResponse.json({ error: 'Opponent not found for this team.' }, { status: 404 })
  return NextResponse.json({ opponent: data })
}
