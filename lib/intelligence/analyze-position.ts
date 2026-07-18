import { analyzeFramesWithGemini } from '@/lib/ai/providers/google'
import { getRoute } from '@/lib/ai/model-router'
import { buildQBIQSystemPrompt, QBIQ_RESPONSE_SCHEMA } from './modules/qbiq'
import { buildOLIQSystemPrompt, OLIQ_RESPONSE_SCHEMA } from './modules/oliq'
import { buildTEAMIQSystemPrompt, TEAMIQ_RESPONSE_SCHEMA } from './modules/teamiq'
import { buildMISTAKEIQSystemPrompt, MISTAKEIQ_RESPONSE_SCHEMA } from './modules/mistakeiq'
import type { PositionAnalysisInput, PositionAnalysisResult } from './schemas'

type ModuleConfig = {
  buildPrompt: (input: PositionAnalysisInput) => string
  schema: object
}

const MODULE_MAP: Record<string, ModuleConfig> = {
  QBIQ:      { buildPrompt: buildQBIQSystemPrompt,      schema: QBIQ_RESPONSE_SCHEMA },
  OLIQ:      { buildPrompt: buildOLIQSystemPrompt,      schema: OLIQ_RESPONSE_SCHEMA },
  TEAMIQ:    { buildPrompt: buildTEAMIQSystemPrompt,    schema: TEAMIQ_RESPONSE_SCHEMA },
  MISTAKEIQ: { buildPrompt: buildMISTAKEIQSystemPrompt, schema: MISTAKEIQ_RESPONSE_SCHEMA },
}

export async function analyzePosition(input: PositionAnalysisInput): Promise<PositionAnalysisResult> {
  const config = MODULE_MAP[input.moduleKey]
  if (!config) throw new Error(`Unknown module: ${input.moduleKey}`)

  const systemPrompt = config.buildPrompt(input)
  // Every module here is a frame-based structured-output call — route them
  // all through the same job type so the model choice has one source of
  // truth (lib/ai/model-router.ts) instead of being hardcoded per provider.
  const route = getRoute('frame_observation')
  const rawJson = await analyzeFramesWithGemini(systemPrompt, input.frames, config.schema, undefined, route.model)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    throw new Error(`Invalid JSON from ${input.moduleKey}: ${rawJson.slice(0, 200)}`)
  }

  // Normalize position_scores keys for consistent output
  const rawScores = parsed.position_scores as Record<string, number | null>
  const rawReasoning = parsed.reasoning as Record<string, string>

  return {
    overall_score: parsed.overall_score as number,
    position_scores: rawScores,
    reasoning: rawReasoning,
    strengths: parsed.strengths as string[],
    weaknesses: parsed.weaknesses as string[],
    drills: parsed.drills as string[],
    summary: parsed.summary as string,
    confidence: (parsed.confidence as number) ?? 0.7,
    evidence_frames: (parsed.evidence_frames as number[]) ?? [],
    plays_observed: parsed.plays_observed as number | undefined,
    model: route.model,
    framesAnalyzed: input.frames.length,
  }
}
