import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Deletes a playbook upload entirely. playbook_plays, playbook_processing_jobs,
 * and playbook_analyses all cascade via FK ON DELETE CASCADE, so the DB side
 * is one delete — but Storage objects (the source file + every rendered page
 * image) don't cascade and have to be removed explicitly first.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ playbookId: string }> }
) {
  const { playbookId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: playbook, error: pbErr } = await supabase
    .from('playbooks')
    .select('id, storage_path')
    .eq('id', playbookId)
    .single()
  if (pbErr || !playbook) {
    return NextResponse.json({ error: 'Playbook not found.' }, { status: 404 })
  }

  const { data: plays } = await supabase
    .from('playbook_plays')
    .select('image_path')
    .eq('playbook_id', playbookId)

  const objectPaths = [
    ...(playbook.storage_path ? [playbook.storage_path] : []),
    ...((plays ?? []).map((p) => p.image_path).filter((p): p is string => !!p)),
  ]

  // RLS silently returns zero affected rows on a denied delete rather than
  // erroring, so a write-role check has to be confirmed via the returned row
  // — not just the absence of a Postgres error. Delete the DB row FIRST and
  // only remove Storage objects once that's confirmed, so a denied request
  // never orphan-deletes real files.
  const { data: deleted, error: deleteErr } = await supabase
    .from('playbooks')
    .delete()
    .eq('id', playbookId)
    .select('id')
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 403 })
  }
  if (!deleted?.length) {
    return NextResponse.json({ error: 'You do not have permission to delete this playbook.' }, { status: 403 })
  }

  if (objectPaths.length) {
    const { error: removeErr } = await supabase.storage.from('playbooks').remove(objectPaths)
    // Not fatal — an orphaned storage object is preferable to reporting
    // failure after the DB row (source of truth) is already gone.
    if (removeErr) console.error('Playbook storage cleanup error:', removeErr)
  }

  return NextResponse.json({ ok: true })
}
