import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainAnalysisJobs, reapStuckAnalysisJobs } from '@/lib/intelligence/run-analysis-job'
import { maybeSummarizeBatch } from '@/lib/intelligence/run-batch-summary'

export const runtime = 'nodejs'
export const maxDuration = 300

// Leave headroom under maxDuration so the response still gets sent; a job cut
// off mid-run is reaped and retried on the next pass anyway.
const DEADLINE_MS = 230_000
const MAX_JOBS_PER_RUN = 5
const MAX_SUMMARY_SWEEPS = 5

/**
 * GET /api/analysis/cron — drains the analysis queue on a schedule, for every
 * team, with nobody logged in.
 *
 * There are three things that can move a batch forward, and until this one
 * existed only two of them did:
 *
 *   1. The Railway worker (workers/process-analysis.ts) — the real answer, but
 *      it is a single process that can be down, redeploying, or out of restart
 *      budget, and nothing in the app could tell.
 *   2. The browser poke (/api/analysis/run) — only fires while a coach has a
 *      tab open, which is exactly the case a background queue is meant to fix.
 *
 * So a coach who queued 20 clips and closed their laptop while the worker was
 * down came back to a batch that had not moved. This is the third: a safety
 * net on Vercel's own scheduler that needs neither a session nor Railway.
 *
 * It deliberately does NOT do video frame extraction — that is ffmpeg on
 * multi-gigabyte files and must stay on Railway. This only runs analysis on
 * frames that already exist, the same work the poke endpoint already does.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. With no
 * CRON_SECRET configured the route refuses outright rather than running open.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured, so scheduled draining is disabled.' },
      { status: 503 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  }

  // Honor the same kill-switch the interactive AI routes check, so disabling
  // AI actually stops spend rather than only stopping the parts a coach sees.
  if (process.env.AI_GLOBAL_DISABLE === 'true') {
    return NextResponse.json({ skipped: 'AI_GLOBAL_DISABLE is set' })
  }

  // Service role: this runs with no session, and it has to reach every team's
  // queue, not one caller's. There is no user input to this route at all.
  const supabase = createAdminClient()

  const reaped = await reapStuckAnalysisJobs(supabase).catch(() => 0)

  const { processed, outcomes } = await drainAnalysisJobs(supabase, {
    workerId: 'vercel-cron',
    maxJobs: MAX_JOBS_PER_RUN,
    deadlineMs: DEADLINE_MS,
  })

  // A batch whose last clip finished while its runner was dying keeps its
  // per-clip reports but never gets the cumulative one. drainAnalysisJobs only
  // summarizes batches IT touched, so sweep for the stranded ones too.
  const { data: pending } = await supabase
    .from('analysis_batches')
    .select('id')
    .eq('summary_status', 'pending')
    .in('status', ['completed', 'completed_with_errors'])
    .order('updated_at', { ascending: true })
    .limit(MAX_SUMMARY_SWEEPS)

  let summariesWritten = 0
  for (const b of (pending ?? []) as { id: string }[]) {
    const outcome = await maybeSummarizeBatch(supabase, b.id).catch(() => 'failed' as const)
    if (outcome === 'written') summariesWritten++
  }

  return NextResponse.json({ reaped, processed, outcomes, summariesWritten })
}
