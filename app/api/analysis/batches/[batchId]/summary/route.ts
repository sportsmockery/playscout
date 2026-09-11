import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'
import { guardAIRequest } from '@/lib/ai/guard'
import { reapStuckSummaries } from '@/lib/intelligence/run-batch-summary'

export const runtime = 'nodejs'

/**
 * POST /api/analysis/batches/[batchId]/summary — write the combined report again.
 *
 * `maybeSummarizeBatch` deliberately refuses to run unless `summary_status` is
 * 'pending', and a failure sets it to 'failed' permanently. That is right for
 * the case it was written for — a prompt that will fail identically on every
 * retry — and wrong for the case that actually happened: a MISSING
 * ANTHROPIC_API_KEY, which is a deployment problem someone then fixes. With no
 * way back to 'pending', the only route to the report was re-running every
 * clip: 188 paid vision calls to redo work already saved in
 * position_analysis_results.
 *
 * So this puts the status back to 'pending' and returns. It does NOT run the
 * synthesis inline, which the first version did and which failed in exactly
 * the way the shape invites: a 188-clip aggregate is a long model call, the
 * phone holding the request gave up before it finished ("Load failed" in
 * Safari, which is a fetch with no response at all), and the batch was left
 * claimed as 'running' by a function nobody was waiting on any more. Since
 * 'running' is the one status no other runner will touch, that made the report
 * permanently unreachable — worse than the failure being retried.
 *
 * The worker sweeps 'pending' summaries and writes them, with no request
 * deadline over its head. Nothing is re-analyzed either way: the synthesis
 * reads per-clip results already in position_analysis_results.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await ctx.params

  const supabase = await createClient()

  // Read the batch first to learn its team — RLS already limits this select to
  // batches the caller can reach, and requireTeamMember then checks they may
  // spend the team's AI budget rather than merely read it.
  const { data: batch } = await supabase
    .from('analysis_batches')
    .select('id, team_id, summary_status')
    .eq('id', batchId)
    .maybeSingle()

  if (!batch) return NextResponse.json({ error: 'Report not found.' }, { status: 404 })

  const access = await requireTeamMember(batch.team_id as string, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const blocked = await guardAIRequest(supabase, access.user.id, batch.team_id as string)
  if (blocked) return blocked

  if (batch.summary_status === 'complete') {
    return NextResponse.json({ outcome: 'skipped', alreadyComplete: true })
  }

  // A 'running' row whose runner died is handed back before we judge the
  // status, so a batch stranded by a killed function is retryable rather than
  // permanently stuck behind "it is already running".
  let status = batch.summary_status as string
  if (status === 'running') {
    await reapStuckSummaries(supabase, { batchId })
    const { data: fresh } = await supabase
      .from('analysis_batches')
      .select('summary_status')
      .eq('id', batchId)
      .maybeSingle()
    status = (fresh?.summary_status as string) ?? status

    // Still running, so it is genuinely in flight and recent. Two runners on
    // one report is the thing this guard exists to prevent.
    if (status === 'running') {
      return NextResponse.json(
        { error: 'The write-up is being generated right now — give it a minute, then reload.' },
        { status: 409 }
      )
    }
  }

  // Back to 'pending' so maybeSummarizeBatch will claim it. Conditioned on the
  // status we just read, so two coaches pressing at once means one wins and
  // the other finds it already running.
  const { data: reset } = await supabase
    .from('analysis_batches')
    .update({
      summary_status: 'pending',
      summary_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('summary_status', status)
    .select('id')
    .maybeSingle()

  if (!reset) {
    return NextResponse.json(
      { error: 'That report just changed — reload the page and try again.' },
      { status: 409 }
    )
  }

  // Returns here, deliberately. The worker picks it up on its next sweep; the
  // page polls. Holding this request open for the model call is what stranded
  // the batch the first time.
  return NextResponse.json({ queued: true })
}
