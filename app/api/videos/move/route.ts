import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

/**
 * POST /api/videos/move — file a selection of clips into a folder, or back
 * out of one (folderId: null). Bulk by design: a coach who just uploaded 40
 * single-play clips is not going to file them one at a time.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { teamId, videoIds, folderId } = body as {
    teamId?: string
    videoIds?: string[]
    folderId?: string | null
  }

  if (!teamId || !Array.isArray(videoIds) || videoIds.length === 0) {
    return NextResponse.json({ error: 'teamId and videoIds are required.' }, { status: 400 })
  }

  const access = await requireTeamMember(teamId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

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

  // .eq('team_id') as well as .in('id') — the ids come from the client, and
  // this must not become a way to reparent another team's film.
  const { data, error } = await supabase
    .from('videos')
    .update({ folder_id: folderId ?? null })
    .eq('team_id', teamId)
    .in('id', videoIds)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ moved: data?.length ?? 0 })
}
