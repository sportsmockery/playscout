import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ playbookId: string }> }
) {
  const { playbookId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: playbook, error: pbErr } = await supabase
    .from('playbooks')
    .select('pages_status, pages_error')
    .eq('id', playbookId)
    .single()
  if (pbErr || !playbook) {
    return NextResponse.json({ error: 'Playbook not found' }, { status: 404 })
  }

  const { data: plays, error: playsErr } = await supabase
    .from('playbook_plays')
    .select('*')
    .eq('playbook_id', playbookId)
    .order('page_number', { ascending: true })
  if (playsErr) {
    return NextResponse.json({ error: playsErr.message }, { status: 500 })
  }

  const withUrls = await Promise.all(
    (plays ?? []).map(async (play) => {
      if (!play.image_path) return { ...play, imageUrl: null }
      const { data } = await supabase.storage.from('playbooks').createSignedUrl(play.image_path, 3600)
      return { ...play, imageUrl: data?.signedUrl ?? null }
    })
  )

  // The per-play visual pipeline usually finishes after the whole-book text
  // analysis was created (see app/api/playbookiq/analyze/route.ts), so
  // covered_play_ids is often still empty at that point. Backfill it here
  // once pages are actually ready, so the two AI passes end up linked
  // without the client having to orchestrate it.
  let coveredPlayIds: string[] | null = null
  const { data: latestAnalysis } = await supabase
    .from('playbook_analyses')
    .select('id, covered_play_ids')
    .eq('playbook_id', playbookId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestAnalysis) {
    const stored: string[] = latestAnalysis.covered_play_ids ?? []
    coveredPlayIds = stored
    if (playbook.pages_status === 'ready' && plays?.length) {
      const currentIds = plays.map((p) => p.id).sort()
      const storedIds = [...stored].sort()
      if (JSON.stringify(currentIds) !== JSON.stringify(storedIds)) {
        await supabase
          .from('playbook_analyses')
          .update({ covered_play_ids: plays.map((p) => p.id) })
          .eq('id', latestAnalysis.id)
        coveredPlayIds = plays.map((p) => p.id)
      }
    }
  }

  return NextResponse.json({
    pagesStatus: playbook.pages_status,
    pagesError: playbook.pages_error,
    plays: withUrls,
    coveredPlayIds,
  })
}
