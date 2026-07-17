import 'server-only'
import { createClient } from '@/lib/supabase/server'

export const ADMIN_ROLES = ['owner', 'admin'] as const
/** Roles an admin may assign to others. `owner` is reserved for the creator. */
export const ASSIGNABLE_ROLES = ['admin', 'coach', 'analyst', 'viewer'] as const

export type AppRole = 'owner' | 'admin' | 'coach' | 'analyst' | 'viewer'

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  coach: 'Coach',
  analyst: 'Analyst',
  viewer: 'Viewer',
}

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  owner: 'Full control. Created the organization.',
  admin: 'Can add, remove, and manage users.',
  coach: 'Can create teams, upload film, and run analysis.',
  analyst: 'Can run analysis and view intelligence.',
  viewer: 'Read-only access to teams and reports.',
}

export function isAdminRole(role?: string | null): boolean {
  return role === 'owner' || role === 'admin'
}

export interface Membership {
  id: string
  organization_id: string
  user_id: string
  role: AppRole
  organizations?: { id: string; name: string } | null
}

/**
 * The current authenticated user plus their organization membership (role).
 * `user` is null when nobody is signed in; `membership` is null when the user
 * hasn't created/joined an org yet.
 */
export async function getCurrentMembership(): Promise<{
  user: { id: string; email?: string } | null
  membership: Membership | null
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, membership: null }

  const { data } = await supabase
    .from('organization_members')
    .select('id, organization_id, user_id, role, organizations(id, name)')
    .eq('user_id', user.id)
    .maybeSingle()

  return {
    user: { id: user.id, email: user.email ?? undefined },
    membership: (data as unknown as Membership) ?? null,
  }
}
