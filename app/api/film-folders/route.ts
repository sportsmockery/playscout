import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

const MAX_NAME_LENGTH = 80

/** GET /api/film-folders?teamId=… — folders with their film counts. */
export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) {
    return NextResponse.json({ error: 'teamId is required.' }, { status: 400 })
  }

  const access = await requireTeamMember(teamId)
  if (access.error) return access.error

  const supabase = await createClient()
  const [{ data: folders }, { data: videos }] = await Promise.all([
    supabase.from('video_folders').select('*').eq('team_id', teamId).order('name'),
    supabase.from('videos').select('folder_id').eq('team_id', teamId),
  ])

  const counts = new Map<string, number>()
  for (const v of videos ?? []) {
    if (v.folder_id) counts.set(v.folder_id, (counts.get(v.folder_id) ?? 0) + 1)
  }

  return NextResponse.json({
    folders: (folders ?? []).map((f) => ({ ...f, video_count: counts.get(f.id) ?? 0 })),
  })
}

/** POST /api/film-folders — create a folder for a team. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { teamId, name, description } = body as {
    teamId?: string
    name?: string
    description?: string
  }

  if (!teamId || !name?.trim()) {
    return NextResponse.json({ error: 'teamId and a folder name are required.' }, { status: 400 })
  }

  const access = await requireTeamMember(teamId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('video_folders')
    .insert({
      team_id: teamId,
      name: name.trim().slice(0, MAX_NAME_LENGTH),
      description: description?.trim() || null,
      created_by: access.user.id,
    })
    .select()
    .single()

  if (error) {
    // 23505 = the (team_id, lower(name)) unique index. Coaches shouldn't have
    // to decode a Postgres error to learn they already made this folder.
    const message =
      error.code === '23505'
        ? 'A folder with that name already exists for this team.'
        : error.message
    return NextResponse.json({ error: message }, { status: error.code === '23505' ? 409 : 500 })
  }

  return NextResponse.json({ folder: { ...data, video_count: 0 } })
}
