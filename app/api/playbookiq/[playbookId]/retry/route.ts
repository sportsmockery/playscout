import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Resets the existing processing job back to `queued` so the worker picks it
 * back up on its next poll — never inserts a second job or a second playbook
 * row, so this never produces a duplicate upload.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ playbookId: string }> }
) {
  const { playbookId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: playbook, error: pbErr } = await supabase
    .from('playbooks')
    .select('id, pages_status')
    .eq('id', playbookId)
    .single()
  if (pbErr || !playbook) {
    return NextResponse.json({ error: 'Playbook not found.' }, { status: 404 })
  }
  if (playbook.pages_status !== 'failed') {
    return NextResponse.json({ error: 'Only a failed playbook can be retried.' }, { status: 400 })
  }

  const { data: job, error: jobErr } = await supabase
    .from('playbook_processing_jobs')
    .select('id')
    .eq('playbook_id', playbookId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (jobErr || !job) {
    return NextResponse.json({ error: 'No processing job found for this playbook.' }, { status: 404 })
  }

  // playbooks' UPDATE policy is the write-role gate. Verify this one first —
  // RLS silently returns zero affected rows on denial rather than erroring,
  // so a `.select()` + length check is required to actually detect it.
  const { data: playbookUpdated, error: playbookUpdateErr } = await supabase
    .from('playbooks')
    .update({ pages_status: 'queued', pages_error: null })
    .eq('id', playbookId)
    .select('id')
  if (playbookUpdateErr) {
    return NextResponse.json({ error: playbookUpdateErr.message }, { status: 403 })
  }
  if (!playbookUpdated?.length) {
    return NextResponse.json({ error: 'You do not have permission to retry this playbook.' }, { status: 403 })
  }

  const { error: jobUpdateErr } = await supabase
    .from('playbook_processing_jobs')
    .update({
      status: 'queued',
      attempts: 0,
      error_message: null,
      locked_by: null,
      locked_at: null,
      started_at: null,
      completed_at: null,
      progress: 0,
      current_step: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
  if (jobUpdateErr) {
    return NextResponse.json({ error: jobUpdateErr.message }, { status: 403 })
  }

  return NextResponse.json({ ok: true })
}
