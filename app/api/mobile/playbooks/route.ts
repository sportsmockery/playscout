import { NextResponse } from 'next/server'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'
import { requireTeamMember } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

/**
 * GET /api/mobile/playbooks?teamId=…
 *
 * A team's playbooks with their most recent analysis attached.
 *
 * `extracted_text` is deliberately not selected: it is the entire book, it is
 * only ever used server-side to build the prompt, and sending it would put
 * megabytes down a phone connection for something nothing renders.
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

  const { data: playbooks, error } = await supabase
    .from('playbooks')
    .select('id, team_id, title, file_type, page_count, created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })

  if (error) return mobileError('Could not load playbooks.', 500)

  const ids = (playbooks ?? []).map((p) => p.id)
  const { data: analyses } = ids.length
    ? await supabase
        .from('playbook_analyses')
        .select(
          'id, playbook_id, overall_score, complexity_score, age_appropriate, strengths, weaknesses, upgrade_recommendations, plays_to_keep, plays_to_remove, install_order, summary, created_at',
        )
        .in('playbook_id', ids)
        .order('created_at', { ascending: false })
    : { data: [] as Record<string, unknown>[] }

  // Newest first above, so the first row seen for a playbook is its latest.
  const latest = new Map<string, Record<string, unknown>>()
  for (const a of analyses ?? []) {
    const key = String((a as { playbook_id: string }).playbook_id)
    if (!latest.has(key)) latest.set(key, a as Record<string, unknown>)
  }

  return NextResponse.json({
    playbooks: (playbooks ?? []).map((p) => ({
      ...p,
      analysis: latest.get(p.id) ?? null,
    })),
  })
}
