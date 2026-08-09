import { NextResponse } from 'next/server'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'
import { requireTeamMember } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

/**
 * GET /api/mobile/opponents?teamId=
 *
 * Opponents with the aggregates the Opponents screen needs: opponent-film
 * count and whether a scout report already exists. Read-only.
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

  const { data: opponents, error } = await supabase
    .from('opponents')
    .select('id, name, age_group, next_game_date, notes, created_at')
    .eq('team_id', teamId)
    .order('next_game_date', { ascending: true, nullsFirst: false })

  if (error) return mobileError('Could not load opponents.', 500)

  const ids = (opponents ?? []).map((o) => o.id)
  const [films, reports] = await Promise.all([
    ids.length
      ? supabase.from('videos').select('opponent_id').eq('team_id', teamId).eq('film_type', 'opponent').in('opponent_id', ids)
      : Promise.resolve({ data: [] as { opponent_id: string | null }[] }),
    ids.length
      ? supabase
          .from('scout_reports')
          .select('opponent_id, created_at')
          .in('opponent_id', ids)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { opponent_id: string; created_at: string }[] }),
  ])

  const filmCount = new Map<string, number>()
  for (const f of films.data ?? []) if (f.opponent_id) filmCount.set(f.opponent_id, (filmCount.get(f.opponent_id) ?? 0) + 1)
  const lastReport = new Map<string, string>()
  for (const r of reports.data ?? []) if (!lastReport.has(r.opponent_id)) lastReport.set(r.opponent_id, r.created_at)

  return NextResponse.json({
    opponents: (opponents ?? []).map((o) => ({
      ...o,
      film_count: filmCount.get(o.id) ?? 0,
      last_report_at: lastReport.get(o.id) ?? null,
    })),
    role: access.role,
  })
}
