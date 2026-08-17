import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'
import { guardAIRequest } from '@/lib/ai/guard'

export const runtime = 'nodejs'

/**
 * A batch is a lot of paid vision calls. This is a sanity ceiling, not a
 * product limit — a coach can queue another batch the moment this one lands.
 */
const MAX_BATCH_VIDEOS = 200

/** Fields the runner derives from the job row; a client can't set them. */
const CONTEXT_STRIP_KEYS = ['teamId', 'moduleKey', 'playerId', 'videoId', 'frames', 'pdf']

function sanitizeContext(context: unknown): Record<string, unknown> {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(context as Record<string, unknown>)) {
    if (CONTEXT_STRIP_KEYS.includes(k)) continue
    out[k] = v
  }
  return out
}

/**
 * GET /api/analysis/batches?teamId=…&moduleKey=…&limit=…
 *
 * The queue view. Returns each batch with its per-clip jobs and film titles,
 * which is what lets a coach close the tab mid-run and pick the batch back
 * up later — progress lives in the database, not in the page.
 */
export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  const moduleKey = req.nextUrl.searchParams.get('moduleKey')
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 10) || 10, 50)

  if (!teamId) return NextResponse.json({ error: 'teamId is required.' }, { status: 400 })

  const access = await requireTeamMember(teamId)
  if (access.error) return access.error

  const supabase = await createClient()
  let query = supabase
    .from('analysis_batches')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (moduleKey) query = query.eq('module_key', moduleKey)

  const { data: batches, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!batches?.length) return NextResponse.json({ batches: [] })

  const { data: jobs } = await supabase
    .from('analysis_batch_jobs')
    .select('id, batch_id, video_id, status, error_message, analysis_result_id, updated_at, videos(title)')
    .in('batch_id', batches.map((b) => b.id))
    .order('created_at', { ascending: true })

  return NextResponse.json({
    batches: batches.map((b) => ({
      ...b,
      jobs: (jobs ?? [])
        .filter((j) => j.batch_id === b.id)
        .map((j) => {
          const { videos, ...rest } = j as typeof j & { videos?: { title?: string } | { title?: string }[] }
          const video = Array.isArray(videos) ? videos[0] : videos
          return { ...rest, video_title: video?.title ?? 'Film' }
        }),
    })),
  })
}

/**
 * POST /api/analysis/batches — queue a module run across many clips.
 *
 * Accepts loose film ids, whole folders, or both. The response comes back as
 * soon as the queue rows exist; nothing is analyzed inside this request, so
 * the coach is free to navigate away immediately.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { teamId, moduleKey, videoIds, folderIds, playerId, title, context } = body as {
    teamId?: string
    moduleKey?: string
    videoIds?: string[]
    folderIds?: string[]
    playerId?: string
    title?: string
    context?: unknown
  }

  if (!teamId || !moduleKey) {
    return NextResponse.json({ error: 'teamId and moduleKey are required.' }, { status: 400 })
  }

  const access = await requireTeamMember(teamId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()
  const blocked = await guardAIRequest(supabase, access.user.id, teamId)
  if (blocked) return blocked

  // Resolve the selection to a concrete list of this team's videos. Both
  // sources are re-checked against team_id server-side rather than trusted.
  const ids = new Set<string>()
  if (Array.isArray(videoIds) && videoIds.length) {
    const { data } = await supabase
      .from('videos')
      .select('id')
      .eq('team_id', teamId)
      .in('id', videoIds.slice(0, MAX_BATCH_VIDEOS * 2))
    for (const v of data ?? []) ids.add(v.id)
  }
  if (Array.isArray(folderIds) && folderIds.length) {
    const { data } = await supabase
      .from('videos')
      .select('id')
      .eq('team_id', teamId)
      .in('folder_id', folderIds)
    for (const v of data ?? []) ids.add(v.id)
  }

  const resolved = [...ids]
  if (!resolved.length) {
    return NextResponse.json(
      { error: 'Select at least one video (or a folder that has film in it).' },
      { status: 400 }
    )
  }
  if (resolved.length > MAX_BATCH_VIDEOS) {
    return NextResponse.json(
      { error: `That's ${resolved.length} clips — queue at most ${MAX_BATCH_VIDEOS} at a time.` },
      { status: 400 }
    )
  }

  const { data: batch, error: batchErr } = await supabase
    .from('analysis_batches')
    .insert({
      team_id: teamId,
      created_by: access.user.id,
      module_key: moduleKey,
      player_id: playerId ?? null,
      folder_id: Array.isArray(folderIds) && folderIds.length === 1 ? folderIds[0] : null,
      title: title?.trim() || null,
      context: sanitizeContext(context),
    })
    .select()
    .single()

  if (batchErr || !batch) {
    return NextResponse.json(
      { error: batchErr?.message ?? 'Could not queue the analysis.' },
      { status: 500 }
    )
  }

  const { error: jobsErr } = await supabase.from('analysis_batch_jobs').insert(
    resolved.map((videoId) => ({
      batch_id: batch.id,
      team_id: teamId,
      video_id: videoId,
      module_key: moduleKey,
      player_id: playerId ?? null,
    }))
  )

  if (jobsErr) {
    // An empty batch would sit in the queue view forever looking stuck.
    await supabase.from('analysis_batches').delete().eq('id', batch.id)
    return NextResponse.json({ error: jobsErr.message }, { status: 500 })
  }

  return NextResponse.json({ batchId: batch.id, queued: resolved.length })
}
