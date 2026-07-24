import type { SupabaseClient } from '@supabase/supabase-js'
import { analyzeFramesWithGemini } from '@/lib/ai/providers/google'
import { getRoute } from '@/lib/ai/model-router'
import { recordUsage, hashCacheKey, getCachedResponse, setCachedResponse } from '@/lib/ai/record-usage'
import { buildQBIQSystemPrompt, QBIQ_RESPONSE_SCHEMA } from './modules/qbiq'
import { buildOLIQSystemPrompt, OLIQ_RESPONSE_SCHEMA } from './modules/oliq'
import { buildRBIQSystemPrompt, RBIQ_RESPONSE_SCHEMA } from './modules/rbiq'
import { buildTEAMIQSystemPrompt, TEAMIQ_RESPONSE_SCHEMA } from './modules/teamiq'
import { buildMISTAKEIQSystemPrompt, MISTAKEIQ_RESPONSE_SCHEMA } from './modules/mistakeiq'
import { PositionAnalysisOutputSchema, type PositionAnalysisInput, type PositionAnalysisResult } from './schemas'

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
}

export async function analyzePosition(
  input: PositionAnalysisInput,
  userId: string,
  supabase: SupabaseClient
): Promise<PositionAnalysisResult> {
  const config = MODULE_MAP[input.moduleKey]
  if (!config) throw new Error(`Unknown module: ${input.moduleKey}`)

  const systemPrompt = config.buildPrompt(input)
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

  return {
    overall_score: parsed.overall_score,
    position_scores: parsed.position_scores,
    reasoning: parsed.reasoning,
    strengths: parsed.strengths,
    weaknesses: parsed.weaknesses,
    drills: parsed.drills,
    summary: parsed.summary,
    confidence: parsed.confidence ?? 0.7,
    evidence_frames: parsed.evidence_frames ?? [],
    plays_observed: parsed.plays_observed,
    model: route.model,
    framesAnalyzed: input.frames.length,
  }
}
