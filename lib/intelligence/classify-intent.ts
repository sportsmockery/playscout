export type ChatIntent = 'team_specific' | 'general_scheme' | 'rules_compliance' | 'practice_plan' | 'game_strategy'

const RULES_KEYWORDS = /\b(rule|rules|legal|illegal|allowed|kickoff|punt|contact practice|live contact|heads up certif|nfhs|usa football|penalty|targeting|equipment requirement|concussion protocol)\b/i
const PRACTICE_KEYWORDS = /\b(practice plan|practice schedule|warm[\s-]?up|drill schedule|install (plan|schedule)|today'?s practice|this week'?s practice|90[\s-]?minute practice|60[\s-]?minute practice)\b/i
const TEAM_SPECIFIC_KEYWORDS = /\b(our|we'?re|we|us|my team|my kids|my players|my roster|this team|our film|our tendenc(y|ies)|our weakness(es)?|our mistakes?|biggest weakness)\b/i
const GAME_STRATEGY_KEYWORDS = /\b(this week'?s (game|opponent)|next game|game plan|opponent|scout(ing)?|halftime|4th quarter|down by|up by|final (drive|minutes))\b/i

/** Cheap regex pass — catches the common cases without a network call. */
export function classifyIntentHeuristic(message: string): ChatIntent | null {
  if (TEAM_SPECIFIC_KEYWORDS.test(message)) return 'team_specific'
  if (RULES_KEYWORDS.test(message)) return 'rules_compliance'
  if (PRACTICE_KEYWORDS.test(message)) return 'practice_plan'
  if (GAME_STRATEGY_KEYWORDS.test(message)) return 'game_strategy'
  return null
}

const CLASSIFIER_SYSTEM = `Classify a youth football coach's chat message into exactly one label. Respond with ONLY the label text, nothing else — no punctuation, no explanation.

Labels:
- team_specific: asks about their own team's film, players, tendencies, mistakes, weaknesses, or roster ("our", "we", "my team")
- rules_compliance: asks about league rules, legality of a technique, contact limits, required equipment, or safety protocol
- practice_plan: asks for a practice plan, schedule, or drill sequence to run at practice
- game_strategy: asks about an upcoming game, an opponent, or in-game/situational strategy
- general_scheme: general football scheme or coaching knowledge not tied to their specific team, film, or an upcoming game`

/**
 * Heuristic-first so the common cases (which are most of them) never pay for
 * a model call; falls back to a cheap Haiku classification only when the
 * regexes don't match anything. Defaults to general_scheme on any failure —
 * the safest fallback, since it never claims team-specific grounding it
 * doesn't have.
 */
export async function classifyIntent(message: string): Promise<ChatIntent> {
  const heuristic = classifyIntentHeuristic(message)
  if (heuristic) return heuristic

  try {
    // Dynamic import: keeps the Anthropic SDK out of the module graph for
    // callers that never classify an intent. (The client itself is lazy now —
    // see getAnthropic — so this is a bundle concern, not a load-time one.)
    // and refuses to load in a browser-like environment (e.g. this file's
    // own jsdom-based unit tests) — deferring the import means those tests
    // never pay that cost since they only exercise the heuristic path.
    const { callClaude } = await import('@/lib/ai/providers/anthropic')
    const result = await callClaude('claude-haiku-4-5-20251001', CLASSIFIER_SYSTEM, [
      { role: 'user', content: message },
    ], 16)
    const label = result.text.trim().toLowerCase()
    if (label.includes('team_specific')) return 'team_specific'
    if (label.includes('rules_compliance')) return 'rules_compliance'
    if (label.includes('practice_plan')) return 'practice_plan'
    if (label.includes('game_strategy')) return 'game_strategy'
    return 'general_scheme'
  } catch (err) {
    console.error('[classify-intent] Haiku classification failed, defaulting to general_scheme', err)
    return 'general_scheme'
  }
}
