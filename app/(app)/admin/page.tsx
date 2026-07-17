import { redirect } from 'next/navigation'
import { getCurrentMembership } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminUsersClient, { type Member } from './AdminUsersClient'

export const metadata = { title: 'Admin — Users & Roles' }
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const { user, membership } = await getCurrentMembership()
  if (!user) redirect('/login')
  if (!membership) redirect('/dashboard')

  let members: Member[] = []
  let loadError: string | null = null

  try {
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('organization_members')
      .select('id, user_id, role, created_at')
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: true })
    if (error) throw error

    members = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data } = await admin.auth.admin.getUserById(r.user_id)
        return {
          userId: r.user_id,
          role: r.role,
          email: data?.user?.email ?? '(unknown)',
          lastSignInAt: data?.user?.last_sign_in_at ?? null,
          isSelf: r.user_id === user.id,
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
        currentUserId={user.id}
        currentUserRole={membership.role}
        loadError={loadError}
      />
    </div>
  )
}
