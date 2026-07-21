import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { estimateCostUsd } from './pricing'

/**
 * No 'server-only' guard here (unlike most of lib/) — this module is
 * imported from both Next.js API routes (RLS-respecting cookie client) and
 * standalone Railway workers (service-role client, no Next.js/cookies
 * context at all). 'server-only' only resolves inside Next.js's bundler; a
 * worker run via `tsx` would crash on import if it were here. Every
 * function below takes its Supabase client as a parameter instead of
 * constructing one, so either caller can pass the client that's actually
 * right for its context.
 */

export interface AIUsage {
  inputTokens: number
  outputTokens: number
}

interface RecordUsageInput extends AIUsage {
  teamId: string
  userId: string | null
  jobType: string
  provider: string
  model: string
  cacheHit?: boolean
}

/** The single funnel every provider call's token usage passes through. */
export async function recordUsage(supabase: SupabaseClient, input: RecordUsageInput): Promise<void> {
  const { data: team } = await supabase.from('teams').select('organization_id').eq('id', input.teamId).maybeSingle()
  if (!team) return

  const costUsd = input.cacheHit ? 0 : estimateCostUsd(input.provider, input.model, input.inputTokens, input.outputTokens)

  const { error } = await supabase.from('ai_usage_ledger').insert({
    organization_id: team.organization_id,
    team_id: input.teamId,
    user_id: input.userId,
    job_type: input.jobType,
    provider: input.provider,
    model: input.model,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    cost_usd: costUsd,
    cache_hit: input.cacheHit ?? false,
  })
  // Never let ledger-write failure break the actual AI response the coach
  // is waiting on — usage tracking is important but not load-bearing.
  if (error) console.error('ai_usage_ledger insert failed:', error)
}

/** sha256 over exactly the inputs that determine the model's output — frame
 * bytes, module/job type, and the prompt version — so any prompt change
 * naturally busts the cache instead of silently serving a stale response. */
export const PROMPT_VERSION = '1'

export function hashCacheKey(jobType: string, promptKey: string, frames: string[]): string {
  const hash = createHash('sha256')
  hash.update(jobType)
  hash.update(promptKey)
  hash.update(PROMPT_VERSION)
  for (const frame of frames) hash.update(frame)
  return hash.digest('hex')
}

export async function getCachedResponse<T>(supabase: SupabaseClient, hash: string): Promise<T | null> {
  const { data } = await supabase.from('ai_response_cache').select('response, hit_count').eq('hash', hash).maybeSingle()
  if (!data) return null

  // Best-effort — a failed hit-count bump shouldn't turn a cache hit into a
  // wasted provider call.
  supabase
    .from('ai_response_cache')
    .update({ hit_count: data.hit_count + 1, last_hit_at: new Date().toISOString() })
    .eq('hash', hash)
    .then(({ error }: { error: unknown }) => {
      if (error) console.error('ai_response_cache hit-count update failed:', error)
    })

  return data.response as T
}

export async function setCachedResponse(supabase: SupabaseClient, hash: string, jobType: string, response: unknown): Promise<void> {
  const { error } = await supabase.from('ai_response_cache').insert({ hash, job_type: jobType, response })
  // A duplicate-key race (two identical requests landing at once) is fine —
  // whichever wrote first wins, this one just no-ops.
  if (error && error.code !== '23505') console.error('ai_response_cache insert failed:', error)
}
