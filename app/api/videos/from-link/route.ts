import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'
import { validateRemoteVideoUrl, titleFromUrl } from '@/lib/video/remote-source'

export const runtime = 'nodejs'

/**
 * POST /api/videos/from-link — register film that lives somewhere else.
 *
 * This route only records the link and queues the job: the fetch itself
 * happens in the Railway worker, same as every other large-video path (a
 * Vercel function has no business pulling a 4GB game file). The URL is
 * validated here anyway so a coach gets an immediate, specific explanation
 * instead of a video row that fails minutes later.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { teamId, url, title, folderId, opponentId } = body as {
      teamId?: string
      url?: string
      title?: string
      folderId?: string
      opponentId?: string
    }

    if (!teamId || !url) {
      return NextResponse.json({ error: 'teamId and url are required.' }, { status: 400 })
    }

    const check = validateRemoteVideoUrl(url)
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const access = await requireTeamMember(teamId, { writeRoles: WRITE_ROLES })
    if (access.error) return access.error

    let filmType: 'self' | 'opponent' = 'self'
    if (opponentId) {
      const { data: opponent } = await supabase
        .from('opponents')
        .select('id, team_id')
        .eq('id', opponentId)
        .maybeSingle()
      if (!opponent || opponent.team_id !== teamId) {
        return NextResponse.json({ error: 'Opponent not found for this team.' }, { status: 404 })
      }
      filmType = 'opponent'
    }

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

    const { data: video, error } = await supabase
      .from('videos')
      .insert({
        team_id: teamId,
        uploaded_by: user.id,
        title: title?.trim() || titleFromUrl(check.url),
        source_type: 'external_url',
        source_url: check.url,
        // No storage_path: the worker streams from the link, extracts frames,
        // and leaves the source where it lives.
        status: 'uploaded',
        film_type: filmType,
        opponent_id: opponentId ?? null,
        folder_id: folderId ?? null,
      })
      .select()
      .single()

    if (error) throw error

    const { error: jobErr } = await supabase.from('video_processing_jobs').insert({
      video_id: video.id,
      team_id: teamId,
      job_type: 'full_pipeline',
      status: 'queued',
      priority: 5,
    })
    if (jobErr) {
      // A video row with no job would sit at "Queued" forever with nothing
      // coming for it — better to fail the whole add.
      await supabase.from('videos').delete().eq('id', video.id)
      return NextResponse.json({ error: jobErr.message }, { status: 500 })
    }

    return NextResponse.json({ videoId: video.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not add film from that link'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
