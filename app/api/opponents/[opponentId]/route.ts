import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMemberForRow, WRITE_ROLES } from '@/lib/auth/require-team-member'

const EDITABLE_FIELDS: Record<string, string> = {
  name: 'name', ageGroup: 'age_group', nextGameDate: 'next_game_date', notes: 'notes',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ opponentId: string }> }
) {
  const { opponentId } = await params
  const access = await requireTeamMemberForRow('opponents', opponentId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
    if (key in body) patch[column] = body[key]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.from('opponents').update(patch).eq('id', opponentId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  return NextResponse.json({ opponent: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ opponentId: string }> }
) {
  const { opponentId } = await params
  const access = await requireTeamMemberForRow('opponents', opponentId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()
  const { error } = await supabase.from('opponents').delete().eq('id', opponentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  return NextResponse.json({ ok: true })
}
