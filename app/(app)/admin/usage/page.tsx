import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentMembership } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import { ArrowLeft } from 'lucide-react'

export const metadata = { title: 'Admin — AI Usage' }
export const dynamic = 'force-dynamic'

interface LedgerRow {
  job_type: string
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  cache_hit: boolean
  created_at: string
}

const WINDOW_DAYS = 30

function formatCost(usd: number): string {
  return usd < 0.01 && usd > 0 ? '<$0.01' : `$${usd.toFixed(2)}`
}

// Pulled out of the component body — React's purity lint flags Date.now()
// called directly inside a Server Component's render, since RSC output can
// be cached/memoized.
function getWindowStartIso(): string {
  return new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export default async function AdminUsagePage() {
  const { user, membership } = await getCurrentMembership()
  if (!user) redirect('/login')
  if (!membership) redirect('/dashboard')

  const supabase = await createClient()
  const since = getWindowStartIso()

  const { data: rows } = await supabase
    .from('ai_usage_ledger')
    .select('job_type, provider, model, input_tokens, output_tokens, cost_usd, cache_hit, created_at')
    .eq('organization_id', membership.organization_id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  const ledger: LedgerRow[] = rows ?? []

  const totalCost = ledger.reduce((sum, r) => sum + Number(r.cost_usd), 0)
  const totalCalls = ledger.length
  const cacheHits = ledger.filter((r) => r.cache_hit).length
  const cacheHitRate = totalCalls > 0 ? (cacheHits / totalCalls) * 100 : 0

  const byDay = new Map<string, number>()
  for (const r of ledger) {
    const day = r.created_at.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + Number(r.cost_usd))
  }
  const dayRows = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))

  const byJobType = new Map<string, { calls: number; cost: number }>()
  for (const r of ledger) {
    const existing = byJobType.get(r.job_type) ?? { calls: 0, cost: 0 }
    existing.calls += 1
    existing.cost += Number(r.cost_usd)
    byJobType.set(r.job_type, existing)
  }
  const jobTypeRows = [...byJobType.entries()].sort((a, b) => b[1].cost - a[1].cost)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/admin"
        className="flex items-center gap-1.5 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors mb-2"
      >
        <ArrowLeft size={15} />
        Users &amp; Roles
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">AI Usage</h1>
        <p className="mt-1 text-sm text-[var(--brand-muted)]">
          {membership.organizations?.name ?? 'Your organization'} · spend and cache performance, last {WINDOW_DAYS} days.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="glass-card p-4">
          <p className="text-xs font-medium text-[var(--brand-muted)] uppercase tracking-wide">Total spend</p>
          <p className="text-2xl font-bold text-[var(--brand-navy)] mt-1">{formatCost(totalCost)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs font-medium text-[var(--brand-muted)] uppercase tracking-wide">AI calls</p>
          <p className="text-2xl font-bold text-[var(--brand-navy)] mt-1">{totalCalls}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs font-medium text-[var(--brand-muted)] uppercase tracking-wide">Cache hits</p>
          <p className="text-2xl font-bold text-[var(--brand-navy)] mt-1">{cacheHits}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs font-medium text-[var(--brand-muted)] uppercase tracking-wide">Cache hit rate</p>
          <p className="text-2xl font-bold text-[var(--brand-navy)] mt-1">{cacheHitRate.toFixed(0)}%</p>
        </div>
      </div>

      {totalCalls === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-[var(--brand-muted)]">No AI usage recorded yet in this window.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="glass-card p-5">
            <h2 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Spend by day</h2>
            <ul className="space-y-1.5">
              {dayRows.map(([day, cost]) => (
                <li key={day} className="flex items-center justify-between text-sm py-1 border-b border-[var(--brand-border)] last:border-0">
                  <span className="text-[var(--brand-ink)]">{day}</span>
                  <span className="font-semibold text-[var(--brand-navy)] tabular-nums">{formatCost(cost)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card p-5">
            <h2 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Spend by job type</h2>
            <ul className="space-y-1.5">
              {jobTypeRows.map(([jobType, stats]) => (
                <li key={jobType} className="flex items-center justify-between text-sm py-1 border-b border-[var(--brand-border)] last:border-0">
                  <span className="text-[var(--brand-ink)]">{jobType}</span>
                  <span className="text-[var(--brand-muted)] tabular-nums">
                    {stats.calls} call{stats.calls === 1 ? '' : 's'} ·{' '}
                    <span className="font-semibold text-[var(--brand-navy)]">{formatCost(stats.cost)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
