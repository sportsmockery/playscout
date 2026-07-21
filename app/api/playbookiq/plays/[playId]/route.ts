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
    .select('team_id, play_name, assignments, blocking_summary, original_play, confidence')
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

  // Training-data flywheel: one row per field actually changed, ai_value
  // always the model's true original (never a previous correction), even on
  // a coach's second or third edit of the same field.
  const originalValues = (existing.original_play as Record<string, unknown> | null) ?? existing
  const corrections = (EDITABLE_FIELDS as readonly string[])
    .filter((field) => field in patch && JSON.stringify(patch[field]) !== JSON.stringify((existing as Record<string, unknown>)[field]))
    .map((field) => ({
      team_id: existing.team_id,
      result_id: playId,
      result_type: 'playbook_play' as const,
      field,
      ai_value: (originalValues as Record<string, unknown>)[field] ?? null,
      corrected_value: patch[field] ?? null,
      ai_confidence: existing.confidence ?? null,
      model: null,
      corrected_by: user.id,
    }))
  if (corrections.length) {
    const { error: correctionErr } = await supabase.from('output_corrections').insert(corrections)
    if (correctionErr) console.error('output_corrections insert failed:', correctionErr)
  }

  return NextResponse.json({ play: updated })
}
