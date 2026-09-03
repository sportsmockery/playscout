import type { SupabaseClient } from '@supabase/supabase-js'
import { saveToTeamMemory } from './memory'
import { persistMistakeEvents, persistPlayerGrades, persistTeamTendencies } from './persist-intelligence'
import type { PositionAnalysisInput, PositionAnalysisResult } from './schemas'

/**
 * Everything that happens AFTER a module run produces a result: the
 * position_analysis_results row, MISTAKEIQ's per-mistake taxonomy, TEAMIQ's
 * tendency rollup, and the team-memory embedding.
 *
 * Extracted from app/api/intelligence/analyze/route.ts so the background
 * batch runner (lib/intelligence/run-analysis-job.ts) persists a result
 * identically to an interactive run — a batched MISTAKEIQ analysis has to
 * land in mistake_events the same way a clicked one does, or the Intelligence
 * hub quietly disagrees with itself depending on how the coach ran it.
 *
 * Throws if the result row can't be saved: the AI call already cost real
 * money, but reporting success for a report that vanishes on next page load
 * is worse than a clear failure the coach can retry.
 */
export async function saveAnalysisResult(
  supabase: SupabaseClient,
  input: PositionAnalysisInput,
  result: PositionAnalysisResult,
  opts?: { videoTitle?: string }
): Promise<string | undefined> {
  const { data: saved, error } = await supabase
    .from('position_analysis_results')
    .insert({
      team_id: input.teamId,
      player_id: input.playerId ?? null,
      video_id: input.videoId ?? null,
      play_sequence_id: input.playSequenceId ?? null,
      module_key: input.moduleKey,
      overall_score: result.overall_score,
      position_scores: result.position_scores,
      reasoning: result.reasoning,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      drills: result.drills,
      summary: result.summary,
      frames_analyzed: result.framesAnalyzed,
      analysis_mode: result.analysisMode,
      // Also a column now, not only a jsonb field: calibration ("are
      // 0.8-confidence claims right about 80% of the time?") is a query, and
      // it could not be asked while this lived inside `evidence`.
      confidence: result.confidence,
      evidence: {
        frames: result.evidence_frames,
        timestamps: result.evidence_timestamps,
        confidence: result.confidence,
        plays_observed: result.plays_observed,
        head_contact_flag: result.head_contact_flag ?? null,
        // TEAMIQ/SCOUTIQ structured breakdown — not columns of its own,
        // but needs to survive here so ScoutIQ Stage 2 aggregation (and a
        // reopened saved report) can read the full per-clip tendencies,
        // not just the generic score/summary above.
        offensive_tendencies: result.offensive_tendencies ?? null,
        defensive_tendencies: result.defensive_tendencies ?? null,
        formations: result.formations ?? null,
        explosive_plays: result.explosive_plays ?? null,
        situational_tells: result.situational_tells ?? null,
        attack_points: result.attack_points ?? null,
        target_players: result.target_players ?? null,
        // RANKERIQ's ranked list, so a reopened saved report renders without
        // a second query against player_grades.
        player_grades: result.player_grades ?? null,
        unit_graded: result.unit_graded ?? null,
        players_not_evaluable: result.players_not_evaluable ?? null,
      },
      model_provider: 'google',
      model_name: result.model,
    })
    .select()
    .single()

  if (error) {
    console.error('DB save error:', error)
    throw new Error(`Analysis completed but could not be saved: ${error.message}`)
  }

  if (input.moduleKey === 'MISTAKEIQ') {
    await persistMistakeEvents(
      supabase,
      { teamId: input.teamId, playSequenceId: input.playSequenceId },
      result.mistakes
    )
  }
  if (input.moduleKey === 'RANKERIQ') {
    await persistPlayerGrades(
      supabase,
      {
        teamId: input.teamId,
        videoId: input.videoId,
        analysisResultId: saved?.id as string | undefined,
        playSequenceId: input.playSequenceId,
        side: result.unit_graded,
        modelProvider: 'google',
        modelName: result.model,
      },
      result.player_grades
    )
  }
  if (input.moduleKey === 'TEAMIQ') {
    await persistTeamTendencies(supabase, input.teamId, {
      offensive: result.offensive_tendencies,
      defensive: result.defensive_tendencies,
    })
  }

  // Team memory is best-effort and must never fail the save.
  saveToTeamMemory(
    input.teamId,
    result,
    {
      moduleKey: input.moduleKey,
      playerName: input.player?.name,
      videoTitle: opts?.videoTitle,
      playLabel: input.playSequence?.coach_label,
    },
    supabase
  ).catch(console.error)

  return saved?.id as string | undefined
}
