import { NextResponse } from 'next/server'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'
import { getCurrentMembership } from '@/lib/auth/roles'

export const runtime = 'nodejs'

const WINDOW_DAYS = 30

/**
 * GET /api/mobile/usage — AI spend and cache performance for the org.
 *
 * The web page computes these totals in its own render. Doing the same
 * arithmetic again on the phone would give two answers to one question the
 * moment either changes, so the aggregation happens here and the app renders
 * what it is handed.
 *
 * Any org member may read their own org's spend, matching the web page, which
 * gates on membership rather than an admin role.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase } = auth.ok

  const { membership } = await getCurrentMembership({ supabase })
  if (!membership) return mobileError('You are not a member of an organization.', 403)

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await supabase
    .from('ai_usage_ledger')
    .select('job_type, provider, model, input_tokens, output_tokens, cost_usd, cache_hit, created_at')
    .eq('organization_id', membership.organization_id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) return mobileError('Could not load usage.', 500)

  const ledger = rows ?? []
  const totalCost = ledger.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0)
  const totalCalls = ledger.length
  const cacheHits = ledger.filter((r) => r.cache_hit).length

  const byJobType = new Map<string, { calls: number; cost: number }>()
  const byDay = new Map<string, number>()
  for (const r of ledger) {
    const jt = byJobType.get(r.job_type) ?? { calls: 0, cost: 0 }
    jt.calls += 1
    jt.cost += Number(r.cost_usd ?? 0)
    byJobType.set(r.job_type, jt)

    const day = String(r.created_at).slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + Number(r.cost_usd ?? 0))
  }

  return NextResponse.json({
    windowDays: WINDOW_DAYS,
    organizationName: membership.organizations?.name ?? null,
    totalCost,
    totalCalls,
    cacheHits,
    // Sent as a rate rather than two numbers the client has to divide — the
    // zero-call case is the one a client would get wrong.
    cacheHitRate: totalCalls > 0 ? (cacheHits / totalCalls) * 100 : 0,
    byJobType: [...byJobType.entries()]
      .map(([jobType, v]) => ({ jobType, ...v }))
      .sort((a, b) => b.cost - a.cost),
    byDay: [...byDay.entries()]
      .map(([day, cost]) => ({ day, cost }))
      .sort((a, b) => b.day.localeCompare(a.day)),
  })
}
