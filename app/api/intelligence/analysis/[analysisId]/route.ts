import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Editable fields only — evidence frames, confidence, model_provider,
 * model_name, and every identity/foreign-key column are never accepted here,
 * regardless of what the client sends.
 */
const EDITABLE_FIELDS = ['overall_score', 'position_scores', 'strengths', 'weaknesses', 'summary', 'drills'] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await params
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
    .from('position_analysis_results')
    .select('overall_score, position_scores, strengths, weaknesses, summary, drills, original_result')
    .eq('id', analysisId)
    .single()
  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Analysis not found.' }, { status: 404 })
  }

  // Snapshot the AI's original values exactly once — never overwritten again,
  // so a second edit can't erase what the AI actually said.
  if (!existing.original_result) {
    patch.original_result = {
      overall_score: existing.overall_score,
      position_scores: existing.position_scores,
      strengths: existing.strengths,
      weaknesses: existing.weaknesses,
      summary: existing.summary,
      drills: existing.drills,
    }
  }

  patch.edited_by = user.id
  patch.edited_at = new Date().toISOString()

  const { data: updated, error: updateErr } = await supabase
    .from('position_analysis_results')
    .update(patch)
    .eq('id', analysisId)
    .select()
    .single()

  if (updateErr) {
    // RLS denies non-write-role members here rather than a 403 with detail,
    // to avoid confirming the row exists to someone who can't touch it.
    return NextResponse.json({ error: updateErr.message }, { status: 403 })
  }

  return NextResponse.json({ result: updated })
}
