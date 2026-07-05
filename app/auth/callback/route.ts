import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Handles the link Supabase emails on sign-up / magic-link / password-recovery.
// Supabase redirects here with either a PKCE `code` or a `token_hash` + `type`,
// which must be exchanged for a session before the user is actually logged in.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  // Only allow relative, same-origin redirect targets.
  const nextParam = searchParams.get('next')
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/dashboard'

  // Behind a proxy (Vercel), prefer the forwarded host so the redirect lands
  // on the public URL rather than the internal one.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocal = process.env.NODE_ENV === 'development'
  const base = isLocal || !forwardedHost ? origin : `https://${forwardedHost}`

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${base}${next}`)
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(`${base}${next}`)
  }

  return NextResponse.redirect(`${base}/login?error=confirmation_failed`)
}
