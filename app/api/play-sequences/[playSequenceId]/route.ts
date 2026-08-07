import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMemberForRow, WRITE_ROLES } from '@/lib/auth/require-team-member'

const EDITABLE_FIELDS = [
  'start_time_seconds', 'end_time_seconds', 'down', 'distance', 'yard_line', 'result', 'coach_label',
] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ playSequenceId: string }> }
) {
  const { playSequenceId } = await params
  const access = await requireTeamMemberForRow('play_sequences', playSequenceId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('play_sequences')
    .update(patch)
    .eq('id', playSequenceId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  return NextResponse.json({ playSequence: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ playSequenceId: string }> }
) {
  const { playSequenceId } = await params
  const access = await requireTeamMemberForRow('play_sequences', playSequenceId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()
  const { error } = await supabase.from('play_sequences').delete().eq('id', playSequenceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  return NextResponse.json({ ok: true })
}
