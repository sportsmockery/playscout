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
