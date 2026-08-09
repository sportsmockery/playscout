import { NextResponse } from 'next/server'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'
import { requireTeamMember } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

/**
 * GET /api/mobile/home?teamId=
 *
 * Command-center payload. Assembles the small set of things a coach needs to
 * see first — what needs attention, the latest intelligence, practice focus,
 * the next opponent, and recent film — in one round trip. Read-only; no write
 * role required. Never invents football facts: every number comes straight from
 * stored rows.
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

  const [team, opponents, recentVideos, recentAnalyses, recentMistakes] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, age_group, level, season, game_type, offensive_style, defensive_style')
      .eq('id', teamId)
      .maybeSingle(),
    supabase
      .from('opponents')
      .select('id, name, next_game_date')
      .eq('team_id', teamId)
      .order('next_game_date', { ascending: true })
      .limit(5),
    supabase
      .from('videos')
      .select('id, title, status, processing_status, film_type, thumbnail_path, duration_seconds, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('position_analysis_results')
      .select('id, module_key, overall_score, summary, player_id, video_id, created_at, evidence')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('mistake_events')
      .select('id, title, severity, category, correction, created_at')
      .eq('team_id', teamId)
      .in('severity', ['moderate', 'major', 'game_changing'])
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const videos = recentVideos.data ?? []

  // Needs attention: failed processing, or film ready for a coach to confirm
  // plays. Capped small — the client shows at most three before "View all".
  const needsAttention = videos
    .filter((v) => v.status === 'failed' || v.status === 'ready_for_review')
    .map((v) => ({
      videoId: v.id,
      title: v.title,
      kind: v.status === 'failed' ? ('processing_failed' as const) : ('confirm_plays' as const),
    }))

  // Surface a head-contact observation above ordinary analytics if any recent
  // analysis carries one. Only expose the flag + note, not the whole report.
  const safetyFlag = recentAnalyses.data
    ?.map((a) => (a.evidence as { head_contact_flag?: { flagged?: boolean; note?: string } } | null)?.head_contact_flag)
    .find((f) => f?.flagged)

  const nextOpponent =
    opponents.data?.find((o) => o.next_game_date && new Date(o.next_game_date) >= new Date()) ??
    opponents.data?.[0] ??
    null

  return NextResponse.json({
    team: team.data,
    role: access.role,
    nextOpponent,
    safety: safetyFlag ? { flagged: true, note: safetyFlag.note ?? '' } : null,
    needsAttention,
    latestIntelligence: (recentAnalyses.data ?? []).map((a) => ({
      id: a.id,
      module_key: a.module_key,
      overall_score: a.overall_score,
      summary: a.summary,
      created_at: a.created_at,
    })),
    practiceFocus: recentMistakes.data ?? [],
    recentFilm: videos.slice(0, 5).map((v) => ({
      id: v.id,
      title: v.title,
      status: v.status,
      processing_status: v.processing_status,
      film_type: v.film_type,
      duration_seconds: v.duration_seconds,
      created_at: v.created_at,
    })),
  })
}
