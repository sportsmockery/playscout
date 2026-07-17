import { redirect } from 'next/navigation'
import { getCurrentMembership, isAdminRole } from '@/lib/auth/roles'

/**
 * Gate: only org owners/admins may see anything under /admin. Regular users
 * (coach/analyst/viewer) are redirected to the dashboard. This is defense in
 * depth — the /api/admin routes independently verify the caller's role.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, membership } = await getCurrentMembership()
  if (!user) redirect('/login')
  if (!isAdminRole(membership?.role)) redirect('/dashboard')
  return <>{children}</>
}
