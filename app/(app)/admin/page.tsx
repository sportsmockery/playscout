import { redirect } from 'next/navigation'
import { getCurrentMembership } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminUsersClient, { type Member, type TeamOption } from './AdminUsersClient'

export const metadata = { title: 'Admin — Users & Roles' }
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const { user, membership } = await getCurrentMembership()
  if (!user) redirect('/login')
  if (!membership) redirect('/dashboard')

  let members: Member[] = []
  let teams: TeamOption[] = []
  let loadError: string | null = null

  try {
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('organization_members')
      .select('id, user_id, role, created_at, all_teams')
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: true })
    if (error) throw error

    const { data: teamRows } = await admin
      .from('teams')
      .select('id, name')
      .eq('organization_id', membership.organization_id)
      .order('name', { ascending: true })
    teams = teamRows ?? []

    const teamIdSet = teams.map((t) => t.id)
    const { data: assigns } = await admin
      .from('team_assignments')
      .select('team_id, user_id')
      .in('team_id', teamIdSet.length ? teamIdSet : ['00000000-0000-0000-0000-000000000000'])
    const byUser = new Map<string, string[]>()
    for (const a of assigns ?? []) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a.team_id])

    members = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data } = await admin.auth.admin.getUserById(r.user_id)
        return {
          userId: r.user_id,
          role: r.role,
          email: data?.user?.email ?? '(unknown)',
          lastSignInAt: data?.user?.last_sign_in_at ?? null,
          isSelf: r.user_id === user.id,
          allTeams: !!r.all_teams,
          teamIds: byUser.get(r.user_id) ?? [],
        }
      })
    )
  } catch (e) {
    loadError =
      e instanceof Error && /SERVICE_ROLE/.test(e.message)
        ? 'User management needs SUPABASE_SERVICE_ROLE_KEY configured on the server.'
        : 'Could not load users.'
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Users &amp; Roles</h1>
        <p className="mt-1 text-sm text-[var(--brand-muted)]">
          {membership.organizations?.name ?? 'Your organization'} · manage who can access PlayScout and what they can do.
        </p>
      </div>
      <AdminUsersClient
        initialMembers={members}
        teams={teams}
        currentUserRole={membership.role}
        loadError={loadError}
      />
    </div>
  )
}
