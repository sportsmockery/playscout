import 'server-only'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createCookieClient } from '@/lib/supabase/server'

/**
 * Request-scoped Supabase client factory.
 *
 * The web app authenticates via cookies (lib/supabase/server.ts). The native
 * mobile app has no cookies — it holds a Supabase session and sends the access
 * token as `Authorization: Bearer <token>`. This factory returns the right
 * client for either case:
 *
 *  - Bearer token present  → a @supabase/supabase-js client configured with the
 *    token in its global Authorization header. Every request it makes carries
 *    the user's JWT, so RLS is enforced EXACTLY as for the cookie client, and
 *    `supabase.auth.getUser()` verifies the token server-side against Supabase
 *    (we never decode/trust the JWT payload ourselves).
 *  - No bearer token       → the existing cookie-based SSR client (unchanged
 *    web behavior).
 *
 * It uses only the public anon key + the user's own token — never the
 * service-role key. This is the single seam that makes every guard and query
 * mobile-compatible without opening a second, weaker auth path.
 */
export function bearerTokenFromRequest(req: Request): string | null {
  const header = req.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

export function requestHasBearerToken(req: Request): boolean {
  return bearerTokenFromRequest(req) !== null
}

export async function createClientForRequest(req: Request): Promise<SupabaseClient> {
  const token = bearerTokenFromRequest(req)
  if (token) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    )
  }
  // Cast: the SSR server client and the supabase-js client are both
  // SupabaseClient instances with the same surface used by callers.
  return (await createCookieClient()) as unknown as SupabaseClient
}
