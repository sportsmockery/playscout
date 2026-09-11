import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'
import { guardAIRequest } from '@/lib/ai/guard'
import { maybeSummarizeBatch } from '@/lib/intelligence/run-batch-summary'

export const runtime = 'nodejs'
// One Claude call over results already on disk — nothing like a full batch,
// but the aggregate for a 188-clip batch is a big prompt, so it gets room.
export const maxDuration = 300

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
 * So this resets the status and runs the synthesis again. It is one model
 * call, and it reads the per-clip results that are already there — nothing is
 * re-analyzed, and the clips' own reports are never touched.
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

  // Only a settled failure is retryable. 'running' means another runner has it
  // right now, and resetting that would have two of them writing one report.
  if (batch.summary_status === 'running') {
    return NextResponse.json(
      { error: 'The write-up is being generated right now — give it a minute.' },
      { status: 409 }
    )
  }
  if (batch.summary_status === 'complete') {
    return NextResponse.json({ outcome: 'skipped', alreadyComplete: true })
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
    .eq('summary_status', batch.summary_status as string)
    .select('id')
    .maybeSingle()

  if (!reset) {
    return NextResponse.json(
      { error: 'That report just changed — reload the page and try again.' },
      { status: 409 }
    )
  }

  const outcome = await maybeSummarizeBatch(supabase, batchId)

  if (outcome === 'written') return NextResponse.json({ outcome })

  // Anything else leaves a reason on the row; read it back rather than
  // inventing a message, so the coach sees what actually went wrong.
  const { data: after } = await supabase
    .from('analysis_batches')
    .select('summary_status, summary_error')
    .eq('id', batchId)
    .maybeSingle()

  return NextResponse.json(
    {
      outcome,
      error:
        (after?.summary_error as string | null) ??
        (outcome === 'not_ready'
          ? 'Some clips are still running — the write-up lands when they finish.'
          : 'The write-up could not be generated.'),
    },
    { status: outcome === 'failed' ? 500 : 200 }
  )
}
