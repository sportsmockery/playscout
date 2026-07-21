import type { SupabaseClient } from '@supabase/supabase-js'

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

/**
 * Fixed-window limiter backed by rate_limit_counters + the
 * increment_rate_limit() RPC (migration 028), which does the
 * insert-or-increment atomically so concurrent requests in the same window
 * can't race past the limit. Windows are aligned to windowSeconds
 * boundaries since epoch, not per-subject sliding windows — simple and
 * good enough for this scale.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  subject: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000
  const windowStartMs = Math.floor(Date.now() / windowMs) * windowMs
  const windowStart = new Date(windowStartMs).toISOString()

  const { data: count, error } = await supabase.rpc('increment_rate_limit', {
    p_subject: subject,
    p_window_start: windowStart,
  })

  if (error) {
    // Fail open — a broken limiter shouldn't take down every AI route.
    console.error('rate limit check failed:', error)
    return { allowed: true, retryAfterSeconds: 0 }
  }

  const retryAfterSeconds = Math.ceil((windowStartMs + windowMs - Date.now()) / 1000)
  return { allowed: (count as number) <= limit, retryAfterSeconds }
}

/**
 * Per-user (10/min) + per-org (60/min) AI rate limit, applied together on
 * every AI route. Resolves the org from teamId itself so callers don't need
 * a separate lookup — same pattern as lib/ai/record-usage.ts.
 */
export async function checkAIRateLimit(
  supabase: SupabaseClient,
  userId: string,
  teamId?: string
): Promise<RateLimitResult> {
  const perUser = await checkRateLimit(supabase, `user:${userId}`, 10, 60)
  if (!perUser.allowed) return perUser

  if (teamId) {
    const { data: team } = await supabase.from('teams').select('organization_id').eq('id', teamId).maybeSingle()
    if (team) {
      const perOrg = await checkRateLimit(supabase, `org:${team.organization_id}`, 60, 60)
      if (!perOrg.allowed) return perOrg
    }
  }

  return { allowed: true, retryAfterSeconds: 0 }
}
