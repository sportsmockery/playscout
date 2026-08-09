import { NextResponse } from 'next/server'
import { authenticateMobile } from '@/lib/mobile/auth'

export const runtime = 'nodejs'

/**
 * GET /api/mobile/bootstrap
 *
 * Cold-start payload for the app: the signed-in user, their org membership and
 * role, and every team they can access (RLS-filtered — never leaks teams they
 * can't see). The client uses this to pick an active team and render chrome
 * before any team-scoped fetch.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase, userId, email } = auth.ok

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role, all_teams, organizations(name)')
    .eq('user_id', userId)
    .maybeSingle()

  // teams SELECT is governed by can_access_team() RLS, so this returns exactly
  // the teams this user may open.
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group, level, season, league, game_type, created_at')
    .order('created_at', { ascending: false })

  const role = (membership?.role as string | undefined) ?? null
  const org = membership?.organizations as { name?: string } | null | undefined

  return NextResponse.json({
    user: { id: userId, email: email ?? null },
    membership: membership
      ? {
          organization_id: membership.organization_id,
          organization_name: org?.name ?? null,
          role,
          all_teams: membership.all_teams ?? false,
        }
      : null,
    // Role is organization-scoped today, so it applies to each accessible team.
    teams: (teams ?? []).map((t) => ({ ...t, role })),
    activeTeamId: teams?.[0]?.id ?? null,
  })
}
