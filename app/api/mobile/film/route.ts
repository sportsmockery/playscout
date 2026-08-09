import { NextResponse } from 'next/server'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'
import { requireTeamMember } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

const PAGE_SIZE = 20

/**
 * GET /api/mobile/film?teamId=&filmType=self|opponent&cursor=<created_at>
 *
 * Paginated film list with the aggregates the film row needs: detected play
 * count and the most recent analysis time per video. Cursor is the created_at
 * of the last item (keyset pagination) so it stays stable as new film arrives.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase } = auth.ok

  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  const filmType = searchParams.get('filmType')
  const cursor = searchParams.get('cursor')
  if (!teamId) return mobileError('teamId is required.', 400)

  const access = await requireTeamMember(teamId, { supabase })
  if (access.error) return access.error

  let query = supabase
    .from('videos')
    .select(
      'id, title, status, processing_status, film_type, opponent_id, thumbnail_path, duration_seconds, error_message, created_at',
    )
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (filmType === 'self' || filmType === 'opponent') query = query.eq('film_type', filmType)
  if (cursor) query = query.lt('created_at', cursor)

  const { data: rows, error } = await query
  if (error) return mobileError('Could not load film.', 500)

  const page = (rows ?? []).slice(0, PAGE_SIZE)
  const nextCursor = (rows ?? []).length > PAGE_SIZE ? page[page.length - 1]?.created_at ?? null : null
  const videoIds = page.map((v) => v.id)

  // Batch the per-video aggregates rather than N+1 round trips.
  const [plays, analyses] = await Promise.all([
    videoIds.length
      ? supabase.from('play_sequences').select('video_id').in('video_id', videoIds)
      : Promise.resolve({ data: [] as { video_id: string }[] }),
    videoIds.length
      ? supabase
          .from('position_analysis_results')
          .select('video_id, created_at')
          .in('video_id', videoIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { video_id: string; created_at: string }[] }),
  ])

  const playCount = new Map<string, number>()
  for (const p of plays.data ?? []) playCount.set(p.video_id, (playCount.get(p.video_id) ?? 0) + 1)
  const latestAnalysis = new Map<string, string>()
  for (const a of analyses.data ?? []) if (!latestAnalysis.has(a.video_id)) latestAnalysis.set(a.video_id, a.created_at)

  return NextResponse.json({
    videos: page.map((v) => ({
      ...v,
      play_count: playCount.get(v.id) ?? 0,
      latest_analysis_at: latestAnalysis.get(v.id) ?? null,
    })),
    nextCursor,
  })
}
