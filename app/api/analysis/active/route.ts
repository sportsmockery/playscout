import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/** Finished batches stay in the dock this long so a coach who was on another
 *  page still sees that their film session landed. */
const RECENTLY_DONE_MS = 30 * 60 * 1000

/**
 * GET /api/analysis/active — every analysis batch still working (or just
 * finished) across ALL teams this user can see.
 *
 * The per-team queue panel only exists on module screens, so navigating away
 * from one made in-flight work invisible — a coach who queued 20 clips and
 * went to look at their roster had no way to tell anything was running. This
 * backs the app-wide dock instead, so the work is visible from anywhere.
 *
 * No teamId: RLS on analysis_batches already scopes rows to teams the user
 * can access, which is exactly the set the dock should cover.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const since = new Date(Date.now() - RECENTLY_DONE_MS).toISOString()

  const { data, error } = await supabase
    .from('analysis_batches')
    .select('id, team_id, module_key, title, status, summary_status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at, teams(name)')
    .or(`status.in.(queued,running),updated_at.gte.${since}`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const batches = (data ?? []).map((b) => {
    const t = (b as { teams?: { name?: string } | { name?: string }[] }).teams
    const team = Array.isArray(t) ? t[0] : t
    const { teams: _teams, ...rest } = b as typeof b & { teams?: unknown }
    void _teams
    return { ...rest, team_name: team?.name ?? null }
  })

  return NextResponse.json({ batches })
}
