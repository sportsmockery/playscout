import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMemberForRow, WRITE_ROLES } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

/** GET /api/analysis/batches/[batchId] — one batch with its per-clip jobs. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params
  const access = await requireTeamMemberForRow('analysis_batches', batchId)
  if (access.error) return access.error

  const supabase = await createClient()
  const [{ data: batch }, { data: jobs }] = await Promise.all([
    supabase.from('analysis_batches').select('*').eq('id', batchId).maybeSingle(),
    supabase
      .from('analysis_batch_jobs')
      .select('id, batch_id, video_id, status, error_message, analysis_result_id, updated_at, videos(title)')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true }),
  ])

  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })

  return NextResponse.json({
    batch: {
      ...batch,
      jobs: (jobs ?? []).map((j) => {
        const { videos, ...rest } = j as typeof j & { videos?: { title?: string } | { title?: string }[] }
        const video = Array.isArray(videos) ? videos[0] : videos
        return { ...rest, video_title: video?.title ?? 'Film' }
      }),
    },
  })
}

/**
 * DELETE /api/analysis/batches/[batchId] — stop a queued batch.
 *
 * Cancels every clip that hasn't run yet and marks the batch cancelled. A
 * clip already mid-flight finishes and saves its report (the AI call is
 * already paid for); the roll-up trigger leaves the batch cancelled.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params
  const access = await requireTeamMemberForRow('analysis_batches', batchId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()
  const now = new Date().toISOString()

  await supabase
    .from('analysis_batch_jobs')
    .update({ status: 'cancelled', completed_at: now, updated_at: now })
    .eq('batch_id', batchId)
    .in('status', ['queued', 'waiting_for_film'])

  const { error } = await supabase
    .from('analysis_batches')
    .update({ status: 'cancelled', completed_at: now, updated_at: now })
    .eq('id', batchId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
