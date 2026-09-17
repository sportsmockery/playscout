import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember } from '@/lib/auth/require-team-member'
import { STAT_CREDIT_COLUMNS, statCreditFromRow, type StatCreditRow } from '@/lib/intelligence/stat-credit-rows'

/**
 * Every stat waiting on the coach, across all of this team's charted film.
 *
 * The queue exists because the questions are worth answering in one sitting.
 * A coach who charts a game gets them in a batch — same game, same memory
 * loaded — and answering forty of them one film page at a time is how a
 * feature like this stops being used by week three.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params
  const access = await requireTeamMember(teamId)
  if (access.error) return access.error

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 100), 300)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('play_stat_credits')
    .select(`${STAT_CREDIT_COLUMNS}, analysis_result_id, video_id, created_at, videos(title)`)
    .eq('team_id', teamId)
    .eq('resolution_status', 'unresolved')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const questions = (data ?? []).map((raw) => {
    const row = raw as unknown as StatCreditRow & {
      analysis_result_id: string | null
      video_id: string | null
      videos?: { title?: string } | { title?: string }[]
    }
    const credit = statCreditFromRow(row)
    const v = row.videos
    const video = Array.isArray(v) ? v[0] : v
    return {
      id: row.id,
      analysisId: row.analysis_result_id,
      videoId: row.video_id,
      videoTitle: video?.title ?? 'Film',
      playIndex: credit.playIndex,
      side: credit.side,
      stat: credit.stat,
      positionId: credit.positionId,
      yards: credit.yards,
      touchdown: credit.touchdown,
      note: credit.note,
      question: credit.question,
      candidates: credit.candidates ?? [],
      evidenceTimestamps: credit.evidenceTimestamps,
    }
  })

  return NextResponse.json({ questions })
}
