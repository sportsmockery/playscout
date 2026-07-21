import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * RLS is necessary but not sufficient — it has broken before (see migrations
 * 011, 012, 016_storage_team_scoping). Every API route that takes a
 * teamId/videoId/playbookId from the request must perform this explicit
 * app-layer membership check before acting on it, not just rely on RLS to
 * quietly deny the write. This queries the same underlying tables
 * (teams joined to organization_members) that the RLS policies do, but as an
 * independent, in-code check rather than a policy the DB alone enforces.
 */
export const WRITE_ROLES = ['owner', 'admin', 'coach', 'analyst'] as const

type RequireTeamMemberResult =
  | { error: NextResponse; user?: undefined; role?: undefined }
  | { error?: undefined; user: { id: string }; role: string }

export async function requireTeamMember(
  teamId: string,
  opts?: { writeRoles?: readonly string[] }
): Promise<RequireTeamMemberResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  // teams and organization_members both reference organizations but have no
  // direct FK to each other, so PostgREST can't embed this in one query.
  // Mirrors the exact access model the can_access_team() RLS function
  // enforces (migrations 016/018), not a looser "any org member" check:
  // org owner/admin, team creator, an explicit team_assignments grant, or
  // org-wide all_teams access all count; plain org membership with none of
  // those does not.
  const { data: team } = await supabase.from('teams').select('organization_id, created_by').eq('id', teamId).maybeSingle()
  if (!team) {
    return { error: NextResponse.json({ error: 'Team not found.' }, { status: 404 }) }
  }

  const [{ data: membership }, { data: assignment }] = await Promise.all([
    supabase
      .from('organization_members')
      .select('role, all_teams')
      .eq('organization_id', team.organization_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('team_assignments').select('id').eq('team_id', teamId).eq('user_id', user.id).maybeSingle(),
  ])

  const role = membership?.role
  const isOrgAdmin = role === 'owner' || role === 'admin'
  const canAccess = isOrgAdmin || team.created_by === user.id || !!assignment || membership?.all_teams === true

  if (!canAccess) {
    return { error: NextResponse.json({ error: 'You do not have access to this team.' }, { status: 403 }) }
  }
  if (!role) {
    // Access came from created_by with no (or a since-removed) org
    // membership row — no role to check writeRoles against.
    return { error: NextResponse.json({ error: 'You do not have access to this team.' }, { status: 403 }) }
  }

  if (opts?.writeRoles && !opts.writeRoles.includes(role)) {
    return { error: NextResponse.json({ error: 'Write access to this team is required.' }, { status: 403 }) }
  }

  return { user: { id: user.id }, role }
}

/**
 * Same check, but resolves the teamId from an existing row (video, playbook,
 * analysis, play) rather than trusting a teamId supplied directly in the
 * request body/params. `table` and `id` locate the row; `teamIdColumn`
 * defaults to `team_id`.
 */
export async function requireTeamMemberForRow(
  table: string,
  id: string,
  opts?: { writeRoles?: readonly string[]; teamIdColumn?: string }
): Promise<RequireTeamMemberResult> {
  const supabase = await createClient()
  const teamIdColumn = opts?.teamIdColumn ?? 'team_id'
  const { data: row } = await supabase.from(table).select(teamIdColumn).eq('id', id).maybeSingle()
  const teamId = (row as Record<string, unknown> | null)?.[teamIdColumn] as string | undefined
  if (!teamId) {
    return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) }
  }
  return requireTeamMember(teamId, opts)
}
