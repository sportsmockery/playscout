/**
 * PlayScout background analysis worker.
 *
 * Runs OUTSIDE Vercel (Railway per CLAUDE.md), alongside the video and
 * playbook workers. Polls analysis_batch_jobs and runs each queued module
 * analysis to completion.
 *
 * This is what makes "queue a folder of film and close the laptop" real: a
 * batch of 40 clips is 40 vision calls, far past any request's lifetime, so
 * the coach's browser is never the thing keeping it alive. Results land in
 * position_analysis_results as each clip finishes, so a coach who comes back
 * mid-batch sees partial results rather than nothing.
 *
 * Run: `npm run worker:analysis`  (env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_API_KEY)
 */
import { createServiceClient } from './lib/service-client'
import { Sentry } from './lib/sentry'
import {
  claimNextAnalysisJob,
  runAnalysisJob,
  reapStuckAnalysisJobs,
  type AnalysisJobRow,
} from '../lib/intelligence/run-analysis-job'
import { maybeSummarizeBatch } from '../lib/intelligence/run-batch-summary'

const WORKER_ID = process.env.WORKER_ID
  ? `${process.env.WORKER_ID}-analysis`
  : 'playscout-analysis-worker-001'
const POLL_INTERVAL_MS = Number(process.env.ANALYSIS_POLL_INTERVAL_MS ?? 5000)
const REAP_EVERY_N_POLLS = 12 // ~once/minute at the default 5s poll interval

let shuttingDown = false

function log(msg: string, extra?: unknown) {
  const stamp = new Date().toISOString()
  if (extra !== undefined) console.log(`[${stamp}] [${WORKER_ID}] ${msg}`, extra)
  else console.log(`[${stamp}] [${WORKER_ID}] ${msg}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const supabase = createServiceClient()
  log(`analysis worker online — polling every ${POLL_INTERVAL_MS}ms`)

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      if (!shuttingDown) log(`${sig} received — finishing current job then exiting`)
      shuttingDown = true
    })
  }

  let pollCount = 0
  while (!shuttingDown) {
    pollCount++
    if (pollCount % REAP_EVERY_N_POLLS === 0) {
      try {
        const reaped = await reapStuckAnalysisJobs(supabase)
        if (reaped) log(`reaped ${reaped} stuck analysis job(s)`)
      } catch (err) {
        log('reap error', err instanceof Error ? err.message : err)
      }
    }

    let job: AnalysisJobRow | null = null
    try {
      job = await claimNextAnalysisJob(supabase, { workerId: WORKER_ID })
    } catch (err) {
      log('claim error', err instanceof Error ? err.message : err)
    }

    if (!job) {
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    log(`claimed job ${job.id} (${job.module_key} on video ${job.video_id})`)
    try {
      // runAnalysisJob records its own failures on the job row and never
      // throws; the catch is only for an unreachable DB.
      const outcome = await runAnalysisJob(supabase, job)
      log(`job ${job.id} → ${outcome}`)

      // Finishing a batch's last clip is what triggers its cumulative report.
      const summary = await maybeSummarizeBatch(supabase, job.batch_id)
      if (summary === 'written') log(`batch ${job.batch_id}: cumulative report written`)
      else if (summary === 'failed') log(`batch ${job.batch_id}: cumulative report FAILED (per-clip reports are unaffected)`)
    } catch (err) {
      Sentry.captureException(err, {
        tags: { worker: 'analysis', module: job.module_key },
        extra: { jobId: job.id, batchId: job.batch_id, videoId: job.video_id },
      })
      log('run error', err instanceof Error ? err.message : err)
    }
  }

  log('analysis worker stopped')
  process.exit(0)
}

main().catch((err) => {
  log('fatal', err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
