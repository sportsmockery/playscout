import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkAIRateLimit } from '@/lib/rate-limit'

/**
 * One call every AI route makes right after its access check and before any
 * paid provider work: honors the env kill-switch and the per-user/per-org
 * rate limit. Returns a ready-to-send Response on rejection, null to
 * proceed — same shape as requireTeamMember's result.
 */
export async function guardAIRequest(
  supabase: SupabaseClient,
  userId: string,
  teamId?: string
): Promise<NextResponse | null> {
  if (process.env.AI_GLOBAL_DISABLE === 'true') {
    return NextResponse.json(
      { error: 'AI features are temporarily disabled. Please try again shortly.' },
      { status: 503 }
    )
  }

  const rateLimit = await checkAIRateLimit(supabase, userId, teamId)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many AI requests. Please slow down and try again in a moment.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  return null
}
