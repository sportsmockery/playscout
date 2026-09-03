import type { SupabaseClient } from '@supabase/supabase-js'
import { analyzeFramesWithGemini } from '@/lib/ai/providers/google'
import { getRoute } from '@/lib/ai/model-router'
import { recordUsage, hashCacheKey, getCachedResponse, setCachedResponse } from '@/lib/ai/record-usage'
import { buildQBIQSystemPrompt, QBIQ_RESPONSE_SCHEMA } from './modules/qbiq'
import { buildOLIQSystemPrompt, OLIQ_RESPONSE_SCHEMA } from './modules/oliq'
import { buildRBIQSystemPrompt, RBIQ_RESPONSE_SCHEMA } from './modules/rbiq'
import { buildTEAMIQSystemPrompt, TEAMIQ_RESPONSE_SCHEMA } from './modules/teamiq'
import { buildMISTAKEIQSystemPrompt, MISTAKEIQ_RESPONSE_SCHEMA } from './modules/mistakeiq'
import { buildSCOUTIQSystemPrompt, SCOUTIQ_RESPONSE_SCHEMA } from './modules/scoutiq'
import { buildRANKERIQSystemPrompt, RANKERIQ_RESPONSE_SCHEMA } from './modules/rankeriq'
import { PositionAnalysisOutputSchema, type PositionAnalysisInput, type PositionAnalysisResult } from './schemas'
import { framesFromBase64, type EvidenceFrame } from './get-frames'
import { applyDrillSafetyFilter, scrubProhibitedDrillMentions } from './safety'
import { rankPlayerGrades } from './player-grades'
import { resolveLevelTier } from './levels'

type ModuleConfig = {
  buildPrompt: (input: PositionAnalysisInput) => string
  schema: object
}

const MODULE_MAP: Record<string, ModuleConfig> = {
  QBIQ:      { buildPrompt: buildQBIQSystemPrompt,      schema: QBIQ_RESPONSE_SCHEMA },
  OLIQ:      { buildPrompt: buildOLIQSystemPrompt,      schema: OLIQ_RESPONSE_SCHEMA },
  RBIQ:      { buildPrompt: buildRBIQSystemPrompt,      schema: RBIQ_RESPONSE_SCHEMA },
  TEAMIQ:    { buildPrompt: buildTEAMIQSystemPrompt,    schema: TEAMIQ_RESPONSE_SCHEMA },
  MISTAKEIQ: { buildPrompt: buildMISTAKEIQSystemPrompt, schema: MISTAKEIQ_RESPONSE_SCHEMA },
  SCOUTIQ:   { buildPrompt: buildSCOUTIQSystemPrompt,   schema: SCOUTIQ_RESPONSE_SCHEMA },
  RANKERIQ:  { buildPrompt: buildRANKERIQSystemPrompt,  schema: RANKERIQ_RESPONSE_SCHEMA },
}

/**
 * `frames` is the wire contract with the browser (bare base64 strings, no
 * timing). Callers that read frames from `video_frames` have the real frame
 * index and capture time and should pass `evidenceFrames` instead, so the
 * labels shown to the model — and therefore every citation it makes — refer
 * to a real moment rather than a position in an array.
 */
export type AnalyzePositionInput = PositionAnalysisInput & {
  evidenceFrames?: EvidenceFrame[]
}

export async function analyzePosition(
  input: AnalyzePositionInput,
  // null when a background batch job runs film queued by a coach whose
  // account has since been removed — the usage ledger takes a null user.
  userId: string | null,
  supabase: SupabaseClient
): Promise<PositionAnalysisResult> {
  const config = MODULE_MAP[input.moduleKey]
  if (!config) throw new Error(`Unknown module: ${input.moduleKey}`)

  const frames = input.evidenceFrames ?? framesFromBase64(input.frames)

  // game_type drives the flag/tackle contact-drill safety gate — fetched
  // authoritatively from the DB rather than trusted from the client, since
  // a client-supplied value here would let a caller bypass the gate.
  const { data: teamRow } = await supabase
    .from('teams')
    .select('game_type, level, age_group')
    .eq('id', input.teamId)
    .maybeSingle()
  const gameType = teamRow?.game_type as 'flag' | 'tackle' | 'rookie_tackle' | null | undefined
  const tier = resolveLevelTier(teamRow as { age_group?: string | null; level?: string | null } | null)
  // RANKERIQ verifies every jersey number against the roster, so the roster is
  // read here from the DB rather than accepted from the caller — it decides
  // which numbers are allowed to exist, which makes it a trust boundary.
  let roster: { id: string; jersey_number: string | null; position: string | null; name: string | null }[] = []
  if (input.moduleKey === 'RANKERIQ') {
    const { data: players } = await supabase
      .from('players')
      .select('id, jersey_number, primary_position, first_name, last_name')
      .eq('team_id', input.teamId)
    roster = (players ?? []).map((p) => ({
      id: p.id as string,
      jersey_number: p.jersey_number != null ? String(p.jersey_number) : null,
      position: (p.primary_position as string | null) ?? null,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    }))
  }

  const inputWithGameType: PositionAnalysisInput = {
    ...input,
    team: input.team ? { ...input.team, game_type: gameType ?? undefined } : input.team,
    roster: roster.map(({ jersey_number, position, name }) => ({ jersey_number, position, name })),
  }

  const systemPrompt = config.buildPrompt(inputWithGameType)
  // Every module here is a frame-based structured-output call — route them
  // all through the same job type so the model choice has one source of
  // truth (lib/ai/model-router.ts) instead of being hardcoded per provider.
  const route = getRoute('frame_observation')

  const cacheHash = hashCacheKey(
    'frame_observation',
    `${input.moduleKey}:${systemPrompt}`,
    frames.map((f) => f.base64)
  )
  const cached = await getCachedResponse<string>(supabase, cacheHash)

  let rawJson: string
  if (cached != null) {
    rawJson = cached
    await recordUsage(supabase, {
      teamId: input.teamId, userId, jobType: 'frame_observation',
      provider: route.provider, model: route.model,
      inputTokens: 0, outputTokens: 0, cacheHit: true,
    })
  } else {
    const result = await analyzeFramesWithGemini(systemPrompt, frames, config.schema, { model: route.model })
    rawJson = result.text
    await recordUsage(supabase, {
      teamId: input.teamId, userId, jobType: 'frame_observation',
      provider: route.provider, model: route.model,
      inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
    })
    await setCachedResponse(supabase, cacheHash, 'frame_observation', rawJson)
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawJson)
  } catch {
    throw new Error(`Invalid JSON from ${input.moduleKey}: ${rawJson.slice(0, 200)}`)
  }

  // Syntactically valid JSON can still be the wrong shape (missing field, a
  // string where a number was expected) — reject that here rather than
  // rendering a report built on it. See PositionAnalysisOutputSchema's doc
  // comment.
  const result = PositionAnalysisOutputSchema.safeParse(parsedJson)
  if (!result.success) {
    throw new Error(`Malformed ${input.moduleKey} output: ${result.error.message}`)
  }
  const parsed = result.data

  // Belt-and-suspenders: the prompt already bans these, but scrub the
  // structured output too before it can reach a coach's screen.
  const { drills: safeDrills } = applyDrillSafetyFilter(parsed.drills, gameType, tier)
  const safeMistakes = parsed.mistakes?.map((m) => {
    const correction = scrubProhibitedDrillMentions(m.correction)
    const drill = m.drill
      ? applyDrillSafetyFilter([m.drill], gameType, tier).drills[0]
      : m.drill
    return { ...m, correction, drill, evidence_frames: keepCited(m.evidence_frames) }
  })

  // The model can only cite a frame it was actually shown. An index outside
  // that set is the cheapest hallucination signal we have — and rendering it
  // would seek a coach to nothing — so drop it here rather than pass it on.
  // Frames are labelled by their real `video_frames.frame_index`, so this
  // compares against identity, not array position.
  const shownIndexes = new Set(frames.map((f) => f.index))
  const keepCited = (cited?: number[]) => (cited ?? []).filter((i) => shownIndexes.has(i))

  // RANKERIQ: the model reports observations; the grade itself is computed
  // here from those factors so a 78 in clip 3 means what a 78 means in clip
  // 40 — otherwise ranking players across a game is comparing scales, not
  // performances. Identity is resolved against the roster fetched above.
  // Scrimmage/practice film: pinnies carry numbers belonging to other players,
  // so a roster "match" there proves nothing about who is wearing it.
  const allowNumbers = input.filmConditions !== 'scrimmage'
  const rankedGrades = parsed.player_grades?.length
    ? rankPlayerGrades(parsed.player_grades, roster, { allowNumbers })
    : parsed.player_grades

  return {
    overall_score: parsed.overall_score,
    position_scores: parsed.position_scores,
    reasoning: parsed.reasoning,
    strengths: parsed.strengths,
    weaknesses: parsed.weaknesses,
    drills: safeDrills,
    summary: parsed.summary,
    confidence: parsed.confidence ?? 0.7,
    evidence_frames: keepCited(parsed.evidence_frames),
    plays_observed: parsed.plays_observed,
    head_contact_flag: parsed.head_contact_flag,
    offensive_tendencies: parsed.offensive_tendencies,
    defensive_tendencies: parsed.defensive_tendencies,
    formations: parsed.formations,
    explosive_plays: parsed.explosive_plays,
    situational_tells: parsed.situational_tells,
    attack_points: parsed.attack_points,
    mistakes: safeMistakes,
    player_grades: rankedGrades,
    unit_graded: parsed.unit_graded,
    players_not_evaluable: parsed.players_not_evaluable,
    target_players: parsed.target_players,
    model: route.model,
    framesAnalyzed: frames.length,
  }
}
