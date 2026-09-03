import type { SupabaseClient } from '@supabase/supabase-js'
import { analyzePosition } from './analyze-position'
import { getVideoFrames } from './get-frames'
import { saveAnalysisResult } from './save-analysis'
import { PositionAnalysisInputSchema, type PositionAnalysisInput } from './schemas'
import { maybeSummarizeBatch } from './run-batch-summary'

/**
 * One unit of background analysis: "run module X against video Y with the
 * context the coach configured for this batch."
 *
 * Shared by the Railway worker (workers/process-analysis.ts, which drains the
 * queue whether or not anyone's browser is open) and the poke endpoint
 * (app/api/analysis/run, which keeps a batch moving while the coach watches).
 * Both claim jobs the same optimistic way video processing already does, so
 * running both at once is safe — a row can only be claimed once.
 */

export const CLAIMABLE_JOB_STATUSES = ['queued', 'waiting_for_film'] as const

/**
 * How long a clip that isn't done processing sits before we look at it
 * again. Frame extraction takes minutes on a full game, and a hot loop
 * re-downloading nothing helps no one.
 */
export const WAITING_RETRY_MS = 60_000

/** A job left `running` this long means its worker died mid-run. */
export const STUCK_JOB_TIMEOUT_MS = 20 * 60 * 1000

export interface AnalysisJobRow {
  id: string
  batch_id: string
  team_id: string
  video_id: string
  module_key: string
  player_id: string | null
  status: string
  attempts: number
  max_attempts: number
}

const JOB_COLUMNS = 'id, batch_id, team_id, video_id, module_key, player_id, status, attempts, max_attempts'

export type JobOutcome = 'completed' | 'failed' | 'retrying' | 'waiting' | 'cancelled'

/**
 * Replays the batch's saved module context against one video.
 *
 * The context is whatever the coach configured on the module screen (team
 * context, jersey color, side of ball, coach note). It's user-supplied, so
 * the identity fields that decide WHOSE film gets analyzed and billed —
 * team, module, player, video — are taken from the job row and override
 * anything the context claims. Frames are injected by the caller.
 */
export function buildJobInput(context: unknown, job: AnalysisJobRow): PositionAnalysisInput {
  const base = context && typeof context === 'object' && !Array.isArray(context) ? context : {}
  return PositionAnalysisInputSchema.parse({
    ...base,
    moduleKey: job.module_key,
    teamId: job.team_id,
    playerId: job.player_id ?? undefined,
    videoId: job.video_id,
    frames: [],
  })
}

/**
 * Optimistically claim the next runnable job. The conditional UPDATE (status
 * must still be claimable) is atomic, so when two runners race only one
 * update matches the row. Same pattern as workers/process-video.ts.
 */
export async function claimNextAnalysisJob(
  supabase: SupabaseClient,
  opts: { workerId: string; teamId?: string }
): Promise<AnalysisJobRow | null> {
  const waitingCutoff = new Date(Date.now() - WAITING_RETRY_MS).toISOString()

  let query = supabase
    .from('analysis_batch_jobs')
    .select(`${JOB_COLUMNS}, updated_at`)
    .in('status', CLAIMABLE_JOB_STATUSES)
    .order('created_at', { ascending: true })
    .limit(10)
  if (opts.teamId) query = query.eq('team_id', opts.teamId)

  const { data: candidates } = await query
  if (!candidates?.length) return null

  const now = new Date().toISOString()
  for (const c of candidates as (AnalysisJobRow & { updated_at: string })[]) {
    // Back off on clips still being processed instead of spinning on them.
    if (c.status === 'waiting_for_film' && c.updated_at > waitingCutoff) continue

    const { data: claimed } = await supabase
      .from('analysis_batch_jobs')
      .update({
        status: 'running',
        locked_by: opts.workerId,
        locked_at: now,
        started_at: now,
        updated_at: now,
      })
      .eq('id', c.id)
      .in('status', CLAIMABLE_JOB_STATUSES)
      .select(JOB_COLUMNS)
      .maybeSingle()

    if (claimed) return claimed as AnalysisJobRow
    // Lost the race — try the next candidate.
  }
  return null
}

async function finish(
  supabase: SupabaseClient,
  jobId: string,
  changes: Record<string, unknown>
) {
  await supabase
    .from('analysis_batch_jobs')
    .update({ ...changes, locked_by: null, updated_at: new Date().toISOString() })
    .eq('id', jobId)
}

/**
 * Runs one claimed job to a terminal (or parked) state. Never throws — every
 * failure path is recorded on the job row so the coach sees WHY a clip in
 * their batch didn't produce a report.
 */
export async function runAnalysisJob(
  supabase: SupabaseClient,
  job: AnalysisJobRow
): Promise<JobOutcome> {
  try {
    const { data: batch } = await supabase
      .from('analysis_batches')
      .select('id, status, context, created_by')
      .eq('id', job.batch_id)
      .maybeSingle()

    if (!batch) {
      await finish(supabase, job.id, {
        status: 'failed',
        error_message: 'The batch this clip belonged to no longer exists.',
        completed_at: new Date().toISOString(),
      })
      return 'failed'
    }

    if (batch.status === 'cancelled') {
      await finish(supabase, job.id, { status: 'cancelled', completed_at: new Date().toISOString() })
      return 'cancelled'
    }

    const { data: video } = await supabase
      .from('videos')
      .select('id, title, status, team_id, storage_path')
      .eq('id', job.video_id)
      .maybeSingle()

    if (!video || video.team_id !== job.team_id) {
      await finish(supabase, job.id, {
        status: 'failed',
        error_message: 'This film is no longer in the team library.',
        completed_at: new Date().toISOString(),
      })
      return 'failed'
    }

    if (video.status === 'failed') {
      await finish(supabase, job.id, {
        status: 'failed',
        error_message: 'This film failed to process, so there are no frames to analyze. Retry the upload from the film library first.',
        completed_at: new Date().toISOString(),
      })
      return 'failed'
    }

    // Film with a stored copy is read as video and needs no extracted frames
    // at all, so a job no longer waits on frame extraction that only the
    // fallback path uses. Film added from an external link has no stored copy
    // and still does.
    const evidenceFrames = video.storage_path ? [] : await getVideoFrames(job.video_id, supabase)
    if (!video.storage_path && !evidenceFrames.length) {
      // Selecting film that's still processing is a normal thing for a coach
      // to do — park the job and pick it up once the video worker is done,
      // rather than failing something that isn't wrong yet.
      await finish(supabase, job.id, {
        status: 'waiting_for_film',
        error_message: null,
        started_at: null,
      })
      return 'waiting'
    }

    const input = buildJobInput(batch.context, job)

    await supabase
      .from('analysis_batch_jobs')
      .update({ attempts: job.attempts + 1, updated_at: new Date().toISOString() })
      .eq('id', job.id)

    const result = await analyzePosition({ ...input, evidenceFrames }, batch.created_by ?? null, supabase)
    const analysisId = await saveAnalysisResult(supabase, input, result, {
      videoTitle: video.title,
    })

    await finish(supabase, job.id, {
      status: 'completed',
      analysis_result_id: analysisId ?? null,
      error_message: null,
      completed_at: new Date().toISOString(),
    })
    return 'completed'
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    const attempts = job.attempts + 1
    const exhausted = attempts >= job.max_attempts
    await finish(supabase, job.id, {
      status: exhausted ? 'failed' : 'queued',
      error_message: message.slice(0, 1000),
      ...(exhausted ? { completed_at: new Date().toISOString() } : {}),
    })
    return exhausted ? 'failed' : 'retrying'
  }
}

/**
 * Re-queues jobs whose runner died mid-run (crash, deploy, a Vercel function
 * hitting its ceiling). Without this a batch would sit at "running" forever.
 */
export async function reapStuckAnalysisJobs(
  supabase: SupabaseClient,
  opts?: { timeoutMs?: number; teamId?: string }
): Promise<number> {
  const cutoff = new Date(Date.now() - (opts?.timeoutMs ?? STUCK_JOB_TIMEOUT_MS)).toISOString()
  let query = supabase
    .from('analysis_batch_jobs')
    .select(JOB_COLUMNS)
    .eq('status', 'running')
    .lt('locked_at', cutoff)
  if (opts?.teamId) query = query.eq('team_id', opts.teamId)

  const { data: stuck } = await query
  if (!stuck?.length) return 0

  for (const job of stuck as AnalysisJobRow[]) {
    const exhausted = job.attempts >= job.max_attempts
    await finish(supabase, job.id, {
      status: exhausted ? 'failed' : 'queued',
      error_message: 'Analysis timed out — the runner stopped before finishing this clip.',
      ...(exhausted ? { completed_at: new Date().toISOString() } : {}),
    })
  }
  return stuck.length
}

/**
 * Claim-and-run in a loop until the queue is empty, the job budget is spent,
 * or the deadline passes. The deadline is what keeps the Vercel poke endpoint
 * inside its function ceiling; the worker passes none.
 */
export async function drainAnalysisJobs(
  supabase: SupabaseClient,
  opts: { workerId: string; teamId?: string; maxJobs?: number; deadlineMs?: number }
): Promise<{ processed: number; outcomes: JobOutcome[] }> {
  const started = Date.now()
  const maxJobs = opts.maxJobs ?? Infinity
  const outcomes: JobOutcome[] = []

  const touchedBatches = new Set<string>()

  while (outcomes.length < maxJobs) {
    if (opts.deadlineMs && Date.now() - started > opts.deadlineMs) break
    const job = await claimNextAnalysisJob(supabase, { workerId: opts.workerId, teamId: opts.teamId })
    if (!job) break
    outcomes.push(await runAnalysisJob(supabase, job))
    touchedBatches.add(job.batch_id)
  }

  // Whichever runner finished a batch's last clip writes its cumulative
  // report. maybeSummarizeBatch no-ops when the batch still has work in
  // flight or another runner already claimed the summary.
  for (const batchId of touchedBatches) {
    await maybeSummarizeBatch(supabase, batchId).catch(() => {})
  }

  return { processed: outcomes.length, outcomes }
}
