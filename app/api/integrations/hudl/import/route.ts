import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTeamMember } from '@/lib/auth/require-team-member'
import { parseHudlUrl, hudlTargetKey } from '@/lib/import/hudl-url'

export const runtime = 'nodejs'

/**
 * Queue and watch a Hudl playlist import.
 *
 * This route records the job and returns. Nothing is fetched here — signing in
 * to Hudl and pulling fifty clips is worker work, same rule as every other
 * large-video path.
 *
 * The URL is parsed here anyway so a bad paste is refused immediately with a
 * sentence a coach can act on, instead of becoming a job that starts, runs, and
 * fails twenty minutes later with nothing useful to say.
 */

const BIND_ROLES = ['owner', 'admin', 'coach'] as const

const StartSchema = z.object({
  teamId: z.string().uuid(),
  url: z.string().min(1),
  title: z.string().max(200).optional(),
  folderId: z.string().uuid().optional(),
  opponentId: z.string().uuid().optional(),
})

const JOB_COLUMNS =
  'id, status, current_step, clips_found, clips_imported, clips_failed, error_message, source_url, title, created_at, completed_at'

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 })

  const access = await requireTeamMember(teamId)
  if (access.error) return access.error

  // Read as the user — this table holds progress, not secrets, and RLS scopes
  // it to teams they can reach.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('hudl_import_jobs')
    .select(JOB_COLUMNS)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'Could not load imports.' }, { status: 500 })
  return NextResponse.json({ jobs: data ?? [] })
}

export async function POST(req: NextRequest) {
  const parsedBody = StartSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'A team and a Hudl link are required.' }, { status: 400 })
  }
  const { teamId, url, title, folderId, opponentId } = parsedBody.data

  const link = parseHudlUrl(url)
  if (!link.ok) return NextResponse.json({ error: link.reason }, { status: 400 })

  const access = await requireTeamMember(teamId, { writeRoles: BIND_ROLES })
  if (access.error) return access.error

  const admin = createAdminClient()

  // A job with no connected account would claim, fail, and tell the coach the
  // same thing this sentence does — only twenty minutes later. Existence only:
  // nothing about the credential is read or returned.
  const { data: credential } = await admin
    .from('hudl_credentials')
    .select('team_id')
    .eq('team_id', teamId)
    .maybeSingle()
  if (!credential) {
    return NextResponse.json(
      { error: 'Connect your Hudl account for this team first.' },
      { status: 409 }
    )
  }

  const supabase = await createClient()

  if (folderId) {
    const { data: folder } = await supabase
      .from('video_folders')
      .select('id, team_id')
      .eq('id', folderId)
      .maybeSingle()
    if (!folder || folder.team_id !== teamId) {
      return NextResponse.json({ error: 'Folder not found for this team.' }, { status: 404 })
    }
  }

  if (opponentId) {
    const { data: opponent } = await supabase
      .from('opponents')
      .select('id, team_id')
      .eq('id', opponentId)
      .maybeSingle()
    if (!opponent || opponent.team_id !== teamId) {
      return NextResponse.json({ error: 'Opponent not found for this team.' }, { status: 404 })
    }
  }

  const targetKey = hudlTargetKey(link.target)

  const { data: job, error } = await supabase
    .from('hudl_import_jobs')
    .insert({
      team_id: teamId,
      created_by: access.user.id,
      source_url: link.canonicalUrl,
      hudl_team_id: link.target.teamId,
      hudl_video_id: link.target.videoId,
      hudl_playlist_id: link.target.playlistId ?? null,
      target_key: targetKey,
      title: title?.trim() || null,
      folder_id: folderId ?? null,
      opponent_id: opponentId ?? null,
      film_type: opponentId ? 'opponent' : 'self',
      status: 'queued',
    })
    .select(JOB_COLUMNS)
    .single()

  if (error) {
    // The partial unique index on (team_id, target_key) for live jobs. Pasting
    // the same playlist twice should join the import already running, not pull
    // fifty clips a second time.
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('hudl_import_jobs')
        .select(JOB_COLUMNS)
        .eq('team_id', teamId)
        .eq('target_key', targetKey)
        .in('status', ['queued', 'running', 'retrying'])
        .maybeSingle()
      if (existing) return NextResponse.json({ job: existing, alreadyRunning: true })
    }
    console.error('[hudl] could not queue import for team', teamId, error.message)
    return NextResponse.json({ error: 'Could not start that import.' }, { status: 500 })
  }

  return NextResponse.json({ job })
}

/** Cancel a queued import. A running one finishes the clip it is on. */
export async function DELETE(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId')
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!jobId || !teamId) {
    return NextResponse.json({ error: 'jobId and teamId are required' }, { status: 400 })
  }

  const access = await requireTeamMember(teamId, { writeRoles: BIND_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('hudl_import_jobs')
    .update({
      status: 'cancelled',
      current_step: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('team_id', teamId)
    .in('status', ['queued', 'retrying'])
    .select('id')

  if (error) return NextResponse.json({ error: 'Could not cancel that import.' }, { status: 500 })
  // RLS refuses a write by returning zero rows, not an error — so the row
  // count is what says whether anything actually happened.
  if (!data?.length) {
    return NextResponse.json(
      { error: 'That import has already started or finished.' },
      { status: 409 }
    )
  }
  return NextResponse.json({ cancelled: true })
}
