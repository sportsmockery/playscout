import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses RLS and can use the Auth Admin API
 * (create/list users). NEVER import this into client components or expose the
 * key. Only use inside server routes/components AFTER verifying the caller is
 * an org admin (see lib/auth/roles.ts).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Admin operations require NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.'
    )
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
