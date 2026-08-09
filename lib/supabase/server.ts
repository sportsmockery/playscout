import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

/**
 * Request-scoped Supabase client for server components and route handlers.
 *
 * The web app authenticates by cookie. The native mobile app has no cookies —
 * it holds a Supabase session on-device and sends the access token as
 * `Authorization: Bearer <token>`. When that header is present we attach the
 * token to the client's global headers, which makes `auth.getUser()` verify the
 * token against Supabase (auth-js resolves the user from the Authorization
 * header when a custom one is set) and makes every PostgREST call carry the
 * user's JWT — so RLS is enforced exactly as for the cookie client. We never
 * decode or trust the JWT payload ourselves; verification always goes through
 * `auth.getUser()`.
 *
 * When no bearer token is present, behavior is byte-for-byte the original
 * cookie flow — existing web callers are unaffected. Only the anon key plus the
 * user's own token are ever used here; the service-role key is never involved.
 */
export async function createClient() {
  const cookieStore = await cookies()

  let bearer: string | undefined
  try {
    const headerStore = await headers()
    const authHeader = headerStore.get('authorization')
    if (authHeader) {
      bearer = /^Bearer\s+(.+)$/i.exec(authHeader.trim())?.[1]?.trim() || undefined
    }
  } catch {
    // headers() is unavailable in some contexts (e.g. certain caches); fall
    // back to cookie-only auth silently.
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(bearer
        ? { global: { headers: { Authorization: `Bearer ${bearer}` } } }
        : {}),
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
