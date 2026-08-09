import { NextResponse } from 'next/server'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'
import { requireTeamMember } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

/**
 * GET /api/mobile/roster?teamId=
 * Read-only roster for the More → Roster screen.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase } = auth.ok

  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  if (!teamId) return mobileError('teamId is required.', 400)

  const access = await requireTeamMember(teamId, { supabase })
  if (access.error) return access.error

  const { data, error } = await supabase
    .from('players')
    .select(
      'id, first_name, last_name, jersey_number, primary_position, secondary_position, side_of_ball, grade_level, status',
    )
    .eq('team_id', teamId)
    .order('jersey_number', { ascending: true, nullsFirst: false })

  if (error) return mobileError('Could not load roster.', 500)
  return NextResponse.json({ players: data ?? [], role: access.role })
}
