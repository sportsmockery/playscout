import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMemberForRow, WRITE_ROLES } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

const MAX_NAME_LENGTH = 80

/** PATCH /api/film-folders/[folderId] — rename / re-describe. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string }> }
) {
  const { folderId } = await params
  const access = await requireTeamMemberForRow('video_folders', folderId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const body = await req.json().catch(() => ({}))
  const { name, description } = body as { name?: string; description?: string }

  const changes: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof name === 'string') {
    if (!name.trim()) return NextResponse.json({ error: 'Folder name cannot be empty.' }, { status: 400 })
    changes.name = name.trim().slice(0, MAX_NAME_LENGTH)
  }
  if (typeof description === 'string') changes.description = description.trim() || null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('video_folders')
    .update(changes)
    .eq('id', folderId)
    .select()
    .single()

  if (error) {
    const message =
      error.code === '23505'
        ? 'A folder with that name already exists for this team.'
        : error.message
    return NextResponse.json({ error: message }, { status: error.code === '23505' ? 409 : 500 })
  }

  return NextResponse.json({ folder: data })
}

/**
 * DELETE /api/film-folders/[folderId] — removes the folder only. The film
 * inside it is never deleted; videos.folder_id is ON DELETE SET NULL, so the
 * clips fall back to the unfiled library.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ folderId: string }> }
) {
  const { folderId } = await params
  const access = await requireTeamMemberForRow('video_folders', folderId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()
  const { error } = await supabase.from('video_folders').delete().eq('id', folderId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
