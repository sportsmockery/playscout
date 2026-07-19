import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Evidence (image_path, page_number, confidence) and model metadata are
 * never editable, regardless of what the client sends. */
const EDITABLE_FIELDS = ['play_name', 'assignments', 'blocking_summary'] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ playId: string }> }
) {
  const { playId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided.' }, { status: 400 })
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('playbook_plays')
    .select('play_name, assignments, blocking_summary, original_play')
    .eq('id', playId)
    .single()
  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Play not found.' }, { status: 404 })
  }

  if (!existing.original_play) {
    patch.original_play = {
      play_name: existing.play_name,
      assignments: existing.assignments,
      blocking_summary: existing.blocking_summary,
    }
  }

  patch.edited_by = user.id
  patch.edited_at = new Date().toISOString()

  const { data: updated, error: updateErr } = await supabase
    .from('playbook_plays')
    .update(patch)
    .eq('id', playId)
    .select()
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 403 })
  }

  return NextResponse.json({ play: updated })
}
