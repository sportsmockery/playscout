import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'

export async function POST(req: NextRequest) {
  try {
    const { uploadId, storagePath, teamId, title, opponentId, folderId } = await req.json()

    if (!storagePath || !teamId) {
      return NextResponse.json(
        { error: 'storagePath and teamId are required' },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // RLS's insert-role policy on videos is the actual floor, but this
    // explicit check runs before any DB write — mirrors the pattern in
    // app/api/intelligence/analyze/route.ts rather than relying on RLS alone
    // to quietly deny a video row created for a team the user can't access.
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

    // Uploading straight into a folder is how a coach keeps a 40-clip game
    // dump organized — filing them afterwards is the step nobody does.
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
        title: title ?? 'Untitled Film',
        source_type: 'upload',
        storage_path: storagePath,
        status: 'uploaded',
        film_type: filmType,
        opponent_id: opponentId ?? null,
        folder_id: folderId ?? null,
      })
      .select()
      .single()

    if (error) throw error

    if (uploadId) {
      await supabase
        .from('video_uploads')
        .update({ upload_status: 'uploaded', storage_path: storagePath })
        .eq('id', uploadId)
    }

    await supabase.from('video_processing_jobs').insert({
      video_id: video.id,
      team_id: teamId,
      job_type: 'full_pipeline',
      status: 'queued',
      priority: 5,
    })

    return NextResponse.json({ videoId: video.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to complete upload'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
