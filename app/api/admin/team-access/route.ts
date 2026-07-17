import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

/**
 * Replace a user's team assignments within the caller's organization.
 * Body: { userId: string, teamIds: string[] }. Only teams that belong to the
 * admin's org are honored. The member must be part of the org.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const admin = createAdminClient()

  const body = await req.json().catch(() => ({}))
  const userId = String(body.userId ?? '')
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

  // Only teams in this org are assignable.
  const { data: orgTeams } = await admin
    .from('teams')
    .select('id')
    .eq('organization_id', auth.organizationId)
  const orgTeamIds = new Set((orgTeams ?? []).map((t) => t.id))
  const valid = teamIds.filter((id) => orgTeamIds.has(id))

  // Replace: delete this user's assignments for org teams, then insert the new set.
  if (orgTeamIds.size) {
    await admin
      .from('team_assignments')
      .delete()
      .eq('user_id', userId)
      .in('team_id', [...orgTeamIds])
  }
  if (valid.length) {
    const rows = valid.map((team_id) => ({ team_id, user_id: userId, assigned_by: auth.user.id }))
    const { error } = await admin.from('team_assignments').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, teamIds: valid })
}
