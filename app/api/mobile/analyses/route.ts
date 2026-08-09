import { NextResponse } from 'next/server'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'
import { requireTeamMember } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

const PAGE_SIZE = 20

/**
 * GET /api/mobile/analyses?teamId=&moduleKey=&cursor=<created_at>
 *
 * Paginated saved-analysis history for the Analyze tab. Read-only.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase } = auth.ok

  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  const moduleKey = searchParams.get('moduleKey')
  const cursor = searchParams.get('cursor')
  if (!teamId) return mobileError('teamId is required.', 400)

  const access = await requireTeamMember(teamId, { supabase })
  if (access.error) return access.error

  let query = supabase
    .from('position_analysis_results')
    .select(
      'id, module_key, overall_score, summary, player_id, video_id, play_sequence_id, edited_at, created_at, players(first_name, last_name, primary_position)',
    )
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (moduleKey) query = query.eq('module_key', moduleKey)
  if (cursor) query = query.lt('created_at', cursor)

  const { data: rows, error } = await query
  if (error) return mobileError('Could not load analyses.', 500)

  const page = (rows ?? []).slice(0, PAGE_SIZE)
  const nextCursor = (rows ?? []).length > PAGE_SIZE ? page[page.length - 1]?.created_at ?? null : null

  return NextResponse.json({ analyses: page, nextCursor })
}
