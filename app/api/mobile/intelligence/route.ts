import { NextResponse } from 'next/server'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'
import { requireTeamMember } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

const MISTAKE_LIMIT = 30
const ANALYSIS_LIMIT = 10

/**
 * GET /api/mobile/intelligence?teamId=…
 *
 * What the team has learned so far: tendencies, recurring mistakes grouped by
 * category, and the most recent analyses.
 *
 * Tendencies carry a sample size for a reason — "runs right 71% of the time"
 * off four plays is not a tendency, it's noise, and a coach who game-plans
 * against it loses. Every count needed to say that travels with the row.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase } = auth.ok

  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  if (!teamId) return mobileError('teamId is required.', 400)

  const access = await requireTeamMember(teamId, { supabase })
  if (access.error) return access.error

  const [{ data: tendencies }, { data: mistakes }, { data: analyses }] = await Promise.all([
    supabase
      .from('team_tendencies')
      .select('id, tendency_type, label, value, sample_size, confidence, updated_at')
      .eq('team_id', teamId)
      .order('confidence', { ascending: false, nullsFirst: false }),
    supabase
      .from('mistake_events')
      .select('id, severity, category, title, description, correction, confidence, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(MISTAKE_LIMIT),
    supabase
      .from('position_analysis_results')
      .select('id, module_key, overall_score, summary, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(ANALYSIS_LIMIT),
  ])

  // Group mistakes by category so a coach sees "6 missed contains", not six
  // separate rows they have to count themselves.
  const byCategory = new Map<string, { category: string; count: number; worstSeverity: string; latestTitle: string | null }>()
  const SEVERITY_ORDER = ['minor', 'moderate', 'major', 'game_changing']
  for (const m of mistakes ?? []) {
    const key = m.category ?? 'uncategorised'
    const existing = byCategory.get(key)
    if (!existing) {
      byCategory.set(key, {
        category: key,
        count: 1,
        worstSeverity: m.severity ?? 'minor',
        latestTitle: m.title ?? null,
      })
      continue
    }
    existing.count += 1
    if (SEVERITY_ORDER.indexOf(m.severity ?? 'minor') > SEVERITY_ORDER.indexOf(existing.worstSeverity)) {
      existing.worstSeverity = m.severity ?? 'minor'
    }
  }

  return NextResponse.json({
    tendencies: tendencies ?? [],
    mistakes: mistakes ?? [],
    mistakeRollup: [...byCategory.values()].sort((a, b) => b.count - a.count),
    analyses: analyses ?? [],
  })
}
