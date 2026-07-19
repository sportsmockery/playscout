import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Deletes only the whole-book analysis row — the source playbook and its
 * per-play data are never touched. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // RLS silently returns zero affected rows on a denied delete rather than
  // erroring, so success has to be confirmed via the returned row.
  const { data: deleted, error: deleteErr } = await supabase
    .from('playbook_analyses')
    .delete()
    .eq('id', analysisId)
    .select('id')
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 403 })
  }
  if (!deleted?.length) {
    return NextResponse.json({ error: 'You do not have permission to delete this analysis.' }, { status: 403 })
  }

  return NextResponse.json({ ok: true })
}
