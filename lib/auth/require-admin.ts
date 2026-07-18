import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdminRole } from '@/lib/auth/roles'

/**
 * Gate for /api/admin/* routes. Returns `{ error }` (a ready-to-send response)
 * when the caller isn't a signed-in org owner/admin; otherwise returns the
 * caller and their organization + role. This is the security boundary — every
 * admin mutation must call it before touching the service-role client.
 */
export async function requireAdmin(): Promise<
  | { error: NextResponse; user?: undefined; organizationId?: undefined; role?: undefined }
  | { error?: undefined; user: { id: string }; organizationId: string; role: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership || !isAdminRole(membership.role)) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  return { user: { id: user.id }, organizationId: membership.organization_id as string, role: membership.role as string }
}
