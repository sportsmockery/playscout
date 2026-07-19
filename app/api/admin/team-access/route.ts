import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

/**
 * Set a user's team access within the caller's organization.
 * Body: { userId, allTeams?: boolean, teamIds?: string[] }.
 *  - allTeams=true  → grant every team in the org (present & future); clears
 *    any specific assignments (they'd be redundant).
 *  - allTeams=false → access is exactly the given teamIds (org teams only).
 * The member must belong to the caller's org.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const admin = createAdminClient()

  const body = await req.json().catch(() => ({}))
  const userId = String(body.userId ?? '')
  const allTeams = body.allTeams === true
  const teamIds: string[] = Array.isArray(body.teamIds) ? body.teamIds.map(String) : []
  if (!userId) return NextResponse.json({ error: 'userId is required.' }, { status: 400 })

  // The target must be a member of this org.
  const { data: member } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', auth.organizationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'User is not in your organization.' }, { status: 404 })

  // Only teams in this org are assignable — reject the whole request if any
  // requested team isn't one of them, rather than silently dropping it.
  const { data: orgTeams } = await admin
    .from('teams')
    .select('id')
    .eq('organization_id', auth.organizationId)
  const orgTeamIds = new Set((orgTeams ?? []).map((t) => t.id))
  const foreign = teamIds.filter((id) => !orgTeamIds.has(id))
  if (foreign.length) {
    return NextResponse.json(
      { error: 'One or more teams do not belong to your organization.' },
      { status: 403 }
    )
  }
  const valid = teamIds

  // Toggle the org-wide flag.
  const { error: flagErr } = await admin
    .from('organization_members')
    .update({ all_teams: allTeams })
    .eq('organization_id', auth.organizationId)
    .eq('user_id', userId)
  if (flagErr) return NextResponse.json({ error: flagErr.message }, { status: 500 })

  // Reset specific assignments, then set the new set (empty when allTeams).
  if (orgTeamIds.size) {
    await admin.from('team_assignments').delete().eq('user_id', userId).in('team_id', [...orgTeamIds])
  }
  if (!allTeams && valid.length) {
    const rows = valid.map((team_id) => ({ team_id, user_id: userId, assigned_by: auth.user.id }))
    const { error } = await admin.from('team_assignments').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, allTeams, teamIds: allTeams ? [] : valid })
}
