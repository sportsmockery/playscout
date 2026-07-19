import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const REJECTED = '/login?error=Could%20not%20sign%20in%20with%20Google'
const UNVERIFIED = '/login?error=Your%20Google%20email%20is%20not%20verified.%20Please%20verify%20it%20with%20Google%20and%20try%20again.'

/**
 * A single leading slash, not followed by another slash or backslash. This
 * blocks "//evil.com" and "/\evil.com" style protocol-relative payloads.
 * (Redirecting via `${origin}${safeNext}` — a fixed trusted origin string
 * with this appended — is not actually exploitable even without this check,
 * verified directly against WHATWG URL parsing; the regex is defense in
 * depth against a future refactor that stops using that safe pattern.)
 */
function isSafeNextPath(next: string): boolean {
  return /^\/(?!\/|\\)/.test(next)
}

/** OAuth (e.g. Google) redirect target. Exchanges the code for a session and
 * sends the user on to `next` (defaults to the dashboard). */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const safeNext = isSafeNextPath(next) ? next : '/dashboard'

  if (!code) return NextResponse.redirect(`${origin}${REJECTED}`)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return NextResponse.redirect(`${origin}${REJECTED}`)

  // Supabase's exchangeCodeForSession already establishes the session as a
  // side effect of the call above — the SDK doesn't offer a way to verify
  // first and create second. If the identity turns out unverified, undo it
  // immediately rather than letting an unverified account through.
  const googleIdentity = data.user.identities?.find((i) => i.provider === 'google')
  const emailVerified =
    !!data.user.email_confirmed_at &&
    googleIdentity?.identity_data?.email_verified !== false

  if (!emailVerified) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}${UNVERIFIED}`)
  }

  return NextResponse.redirect(`${origin}${safeNext}`)
}
