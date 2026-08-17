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
import { PositionAnalysisOutputSchema, type PositionAnalysisInput, type PositionAnalysisResult } from './schemas'
import { applyDrillSafetyFilter, scrubProhibitedDrillMentions } from './safety'
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
}

export async function analyzePosition(
  input: PositionAnalysisInput,
  // null when a background batch job runs film queued by a coach whose
  // account has since been removed — the usage ledger takes a null user.
  userId: string | null,
  supabase: SupabaseClient
): Promise<PositionAnalysisResult> {
  const config = MODULE_MAP[input.moduleKey]
  if (!config) throw new Error(`Unknown module: ${input.moduleKey}`)

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
  const inputWithGameType: PositionAnalysisInput = {
    ...input,
    team: input.team ? { ...input.team, game_type: gameType ?? undefined } : input.team,
  }

  const systemPrompt = config.buildPrompt(inputWithGameType)
  // Every module here is a frame-based structured-output call — route them
  // all through the same job type so the model choice has one source of
  // truth (lib/ai/model-router.ts) instead of being hardcoded per provider.
  const route = getRoute('frame_observation')

  const cacheHash = hashCacheKey('frame_observation', `${input.moduleKey}:${systemPrompt}`, input.frames)
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
    const result = await analyzeFramesWithGemini(systemPrompt, input.frames, config.schema, undefined, route.model)
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
    return { ...m, correction, drill }
  })

  return {
    overall_score: parsed.overall_score,
    position_scores: parsed.position_scores,
    reasoning: parsed.reasoning,
    strengths: parsed.strengths,
    weaknesses: parsed.weaknesses,
    drills: safeDrills,
    summary: parsed.summary,
    confidence: parsed.confidence ?? 0.7,
    evidence_frames: parsed.evidence_frames ?? [],
    plays_observed: parsed.plays_observed,
    head_contact_flag: parsed.head_contact_flag,
    offensive_tendencies: parsed.offensive_tendencies,
    defensive_tendencies: parsed.defensive_tendencies,
    formations: parsed.formations,
    explosive_plays: parsed.explosive_plays,
    situational_tells: parsed.situational_tells,
    attack_points: parsed.attack_points,
    mistakes: safeMistakes,
    target_players: parsed.target_players,
    model: route.model,
    framesAnalyzed: input.frames.length,
  }
}
