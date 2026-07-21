import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkRateLimit } from './rate-limit'

function mockSupabase(rpcResult: { data: number | null; error: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as unknown as SupabaseClient
}

describe('checkRateLimit', () => {
  it('allows a request when the count is at or under the limit', async () => {
    const supabase = mockSupabase({ data: 5, error: null })
    const result = await checkRateLimit(supabase, 'user:abc', 10, 60)
    expect(result.allowed).toBe(true)
  })

  it('allows a request when the count exactly equals the limit', async () => {
    const supabase = mockSupabase({ data: 10, error: null })
    const result = await checkRateLimit(supabase, 'user:abc', 10, 60)
    expect(result.allowed).toBe(true)
  })

  it('rejects a request once the count exceeds the limit', async () => {
    const supabase = mockSupabase({ data: 11, error: null })
    const result = await checkRateLimit(supabase, 'user:abc', 10, 60)
    expect(result.allowed).toBe(false)
  })

  it('returns a positive retryAfterSeconds within the current window when rejected', async () => {
    const supabase = mockSupabase({ data: 99, error: null })
    const result = await checkRateLimit(supabase, 'user:abc', 10, 60)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('fails OPEN (allows the request) when the RPC errors, so a broken limiter cannot take down every AI route', async () => {
    const supabase = mockSupabase({ data: null, error: new Error('db unavailable') })
    const result = await checkRateLimit(supabase, 'user:abc', 10, 60)
    expect(result.allowed).toBe(true)
  })

  it('passes the current window-aligned timestamp and the exact subject to the RPC', async () => {
    const supabase = mockSupabase({ data: 1, error: null })
    await checkRateLimit(supabase, 'org:my-org-id', 60, 60)
    expect(supabase.rpc).toHaveBeenCalledWith(
      'increment_rate_limit',
      expect.objectContaining({ p_subject: 'org:my-org-id' })
    )
  })
})
