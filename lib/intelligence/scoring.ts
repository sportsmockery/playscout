import type { ModuleRubric } from './rubrics/types'

/**
 * The overall score, computed rather than asked for.
 *
 * The prompts stated the formula — "OVERALL = round(0.4 * MECHANICS + 0.4 *
 * DECISION_MAKING + 0.2 * POCKET_PRESENCE)" — and then asked the model to
 * return `overall_score`, so a report's headline number was arithmetic done
 * inside a vision call. It also had to reweight by hand whenever a dimension
 * came back null, which is where the formula quietly stopped being followed.
 *
 * player-grades.ts already made this argument for RankerIQ: "a model asked for
 * a holistic number invents a fresh scale on every call, so cross-clip ranks
 * become noise". The same is true of a player's score across a season, and it
 * is the precondition for any trend line being worth drawing.
 */

export interface OverallScore {
  value: number | null
  /** The dimensions that carried weight, and what that weight became after reweighting. */
  weights: Record<string, number>
  /** Dimensions with no applicable evidence on this rep. */
  skipped: string[]
}

/**
 * Reweights the dimensions that have evidence so they still sum to 1.
 *
 * A quarterback clip with no dropback has no pocket_presence evidence; its 20%
 * is redistributed across mechanics and decision_making in proportion, rather
 * than being scored as a zero or silently dropped.
 */
export function computeOverall(
  scores: Record<string, number | null | undefined>,
  weights: Record<string, number>
): OverallScore {
  const present = Object.entries(weights).filter(
    ([key]) => typeof scores[key] === 'number' && Number.isFinite(scores[key] as number)
  )
  const skipped = Object.keys(weights).filter((key) => !present.some(([k]) => k === key))

  const totalWeight = present.reduce((n, [, w]) => n + w, 0)
  if (!present.length || totalWeight <= 0) {
    return { value: null, weights: {}, skipped }
  }

  const reweighted = Object.fromEntries(present.map(([key, w]) => [key, w / totalWeight]))
  const value = present.reduce(
    (sum, [key, w]) => sum + clamp(scores[key] as number, 0, 100) * (w / totalWeight),
    0
  )

  return { value: Math.round(value), weights: reweighted, skipped }
}

/** Weights straight off the rubric, so the prompt and the arithmetic can't disagree. */
export function weightsFor(rubric: ModuleRubric): Record<string, number> {
  return Object.fromEntries(rubric.dimensions.map((d) => [d.key, d.weight]))
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** The band language the whole product uses, relative to the team's level. */
export function scoreBand(score: number): string {
  if (score >= 90) return 'Elite'
  if (score >= 80) return 'Advanced'
  if (score >= 70) return 'Solid'
  if (score >= 60) return 'Developing'
  return 'Beginner'
}
