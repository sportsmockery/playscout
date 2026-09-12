import type { SupabaseClient } from '@supabase/supabase-js'
import { getRoute } from '@/lib/ai/model-router'
import { callClaude } from '@/lib/ai/providers/anthropic'
import { recordUsage } from '@/lib/ai/record-usage'
import { aggregateBatch, type BatchClipResult } from './aggregate-batch'
import { buildBatchSummaryPrompt, parseBatchSummary } from './batch-summary'
import { applyDrillSafetyFilter } from './safety'
import { resolveLevelTier } from './levels'
import type { PlayerGrade } from './schemas'

/**
 * Writes the cumulative report for a batch once all of its clips are done.
 *
 * Called opportunistically after every job finishes — by the Railway worker
 * and by the web drain endpoint alike. The claim is a conditional UPDATE on
 * summary_status, so when several runners finish the last few clips at the
 * same moment, exactly one of them writes the report and the rest no-op.
 */

/** Below this there's nothing to synthesize — one clip's report is the story. */
const MIN_CLIPS_FOR_SUMMARY = 2

type EvidenceShape = {
  confidence?: number | null
  plays_observed?: number | null
  player_grades?: PlayerGrade[] | null
  mistakes?: { title: string; category: string; severity: string }[] | null
}

export type SummaryOutcome = 'written' | 'skipped' | 'not_ready' | 'failed'

/**
 * True when no job in the batch can still produce a result. Cancelled and
 * failed jobs count as settled — a batch where two clips failed should still
 * get its report for the eight that worked.
 */
async function batchIsSettled(supabase: SupabaseClient, batchId: string): Promise<boolean> {
  const { count } = await supabase
    .from('analysis_batch_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .in('status', ['queued', 'waiting_for_film', 'running'])
  return (count ?? 0) === 0
}

/**
 * How long a summary may sit in 'running' before we assume its runner died.
 *
 * The synthesis is one model call over an aggregate; minutes, not tens of
 * minutes. A Vercel function killed at its deadline leaves the row claimed
 * forever, and 'running' is the one status nothing else will touch — so
 * without this a batch becomes permanently unsummarizable, which is strictly
 * worse than the failure it was retrying.
 */
const STUCK_SUMMARY_TIMEOUT_MS = Number(process.env.SUMMARY_STUCK_TIMEOUT_MS ?? 10 * 60 * 1000)

/** Hand back summaries whose runner never came home. */
export async function reapStuckSummaries(
  supabase: SupabaseClient,
  opts?: { timeoutMs?: number; batchId?: string; teamId?: string }
): Promise<number> {
  const cutoff = new Date(Date.now() - (opts?.timeoutMs ?? STUCK_SUMMARY_TIMEOUT_MS)).toISOString()
  let query = supabase
    .from('analysis_batches')
    .update({
      summary_status: 'pending',
      summary_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('summary_status', 'running')
    .lt('updated_at', cutoff)
  if (opts?.batchId) query = query.eq('id', opts.batchId)
  if (opts?.teamId) query = query.eq('team_id', opts.teamId)

  const { data } = await query.select('id')
  return data?.length ?? 0
}

/**
 * Write any combined report that is waiting for one.
 *
 * maybeSummarizeBatch only ever ran off the back of a finishing job, which is
 * fine for the normal path — the last clip triggers the report — and leaves no
 * route at all for a batch whose jobs are ALL done. A retry that puts the row
 * back to 'pending' would sit there indefinitely. This is what picks it up,
 * and it belongs on the worker: no request deadline, and a 188-clip aggregate
 * is a long enough call to exceed one.
 */
export async function sweepPendingSummaries(
  supabase: SupabaseClient,
  opts?: { limit?: number; teamId?: string }
): Promise<number> {
  let pending = supabase
    .from('analysis_batches')
    .select('id')
    .eq('summary_status', 'pending')
    .order('updated_at', { ascending: true })
    .limit(opts?.limit ?? 3)
  // Scoped when a caller has a team in hand, so a poke from one team's queue
  // view does not go and do work for another. The worker passes nothing and
  // sweeps everything, which is its job.
  if (opts?.teamId) pending = pending.eq('team_id', opts.teamId)

  const { data } = await pending

  let written = 0
  for (const row of data ?? []) {
    // maybeSummarizeBatch re-checks that the batch is settled and claims it
    // atomically, so a sweep racing the job-completion path is harmless.
    const outcome = await maybeSummarizeBatch(supabase, row.id as string)
    if (outcome === 'written') written++
  }
  return written
}

export async function maybeSummarizeBatch(
  supabase: SupabaseClient,
  batchId: string
): Promise<SummaryOutcome> {
  const { data: batch } = await supabase
    .from('analysis_batches')
    .select('id, team_id, module_key, status, context, created_by, summary_status')
    .eq('id', batchId)
    .maybeSingle()

  if (!batch || batch.summary_status !== 'pending') return 'skipped'
  if (!(await batchIsSettled(supabase, batchId))) return 'not_ready'

  const { data: jobs } = await supabase
    .from('analysis_batch_jobs')
    .select('video_id, analysis_result_id, status, videos(title)')
    .eq('batch_id', batchId)
    .eq('status', 'completed')
    .order('created_at', { ascending: true })

  const resultIds = (jobs ?? []).map((j) => j.analysis_result_id).filter((id): id is string => !!id)

  if (resultIds.length < MIN_CLIPS_FOR_SUMMARY) {
    await supabase
      .from('analysis_batches')
      .update({ summary_status: 'not_applicable', updated_at: new Date().toISOString() })
      .eq('id', batchId)
      .eq('summary_status', 'pending')
    return 'skipped'
  }

  // Claim: only the runner that flips pending → running writes the report.
  const { data: claimed } = await supabase
    .from('analysis_batches')
    .update({ summary_status: 'running', updated_at: new Date().toISOString() })
    .eq('id', batchId)
    .eq('summary_status', 'pending')
    .select('id')
    .maybeSingle()
  if (!claimed) return 'skipped'

  try {
    const { data: results } = await supabase
      .from('position_analysis_results')
      .select('id, video_id, overall_score, summary, strengths, weaknesses, drills, evidence')
      .in('id', resultIds)

    const titleByVideo = new Map<string, string>()
    for (const j of jobs ?? []) {
      const v = (j as { videos?: { title?: string } | { title?: string }[] }).videos
      const video = Array.isArray(v) ? v[0] : v
      titleByVideo.set(j.video_id, video?.title ?? 'Film')
    }

    // Preserve the order clips were queued in, so "trend across the batch"
    // means something.
    const byId = new Map((results ?? []).map((r) => [r.id, r]))
    const clips: BatchClipResult[] = resultIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => {
        const evidence = (r.evidence ?? {}) as EvidenceShape
        return {
          analysisId: r.id,
          videoId: r.video_id ?? '',
          videoTitle: titleByVideo.get(r.video_id ?? '') ?? 'Film',
          overallScore: r.overall_score,
          summary: r.summary,
          strengths: r.strengths ?? [],
          weaknesses: r.weaknesses ?? [],
          drills: r.drills ?? [],
          playsObserved: evidence.plays_observed ?? null,
          confidence: evidence.confidence ?? null,
          playerGrades: evidence.player_grades ?? null,
          mistakes: evidence.mistakes ?? null,
        }
      })

    const aggregate = aggregateBatch(clips)

    const { data: team } = await supabase
      .from('teams')
      .select('name, age_group, level, game_type')
      .eq('id', batch.team_id)
      .maybeSingle()

    const context = (batch.context ?? {}) as { coachNote?: string }
    const systemPrompt = buildBatchSummaryPrompt({
      moduleKey: batch.module_key,
      teamName: team?.name,
      ageGroup: team?.age_group,
      level: team?.level,
      gameType: team?.game_type,
      clips,
      aggregate,
      coachNote: context.coachNote,
    })

    const route = getRoute('report_generation')
    const response = await callClaude(
      route.model,
      systemPrompt,
      [{ role: 'user', content: 'Write the cumulative report now, following the JSON shape exactly.' }],
      // Synthesis across a whole game is the one call in the pipeline where
      // reasoning depth earns its cost, and the report is long — a low
      // max_tokens truncates it mid-clip.
      { maxTokens: 8000, thinking: true, effort: 'high' }
    )

    await recordUsage(supabase, {
      teamId: batch.team_id,
      userId: batch.created_by ?? null,
      jobType: 'report_generation',
      provider: route.provider,
      model: route.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    })

    const summary = parseBatchSummary(response.text)

    // Same belt-and-suspenders gate every module output passes through.
    summary.practice_focus = applyDrillSafetyFilter(
      summary.practice_focus ?? [],
      team?.game_type,
      resolveLevelTier(team)
    ).drills

    const { error } = await supabase
      .from('analysis_batches')
      .update({
        summary: { ...summary, aggregate },
        summary_status: 'complete',
        summary_model: route.model,
        summary_error: null,
        summarized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)
    if (error) throw new Error(error.message)

    return 'written'
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Batch summary failed'
    // The per-clip reports are all saved and readable — a failed synthesis
    // costs the coach the overview, not their analysis. Record why and move
    // on rather than retrying a prompt that will fail the same way.
    await supabase
      .from('analysis_batches')
      .update({
        summary_status: 'failed',
        summary_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)
    return 'failed'
  }
}
