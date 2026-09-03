import type { LevelTier } from '../levels'
import type { CueCatalog } from '../breakdown'

/**
 * The rubrics, as data.
 *
 * IQ_ANALYSIS_KNOWLEDGE_BASE and FOOTBALL_KNOWLEDGE_BASE hold ~1,400 lines of
 * this material and no code ever loaded a word of it — grep for either file
 * across the TypeScript returns nothing. What reached the model was one
 * comma-separated line per dimension ("Evaluate: base width, weight transfer,
 * stride length…"), with the two columns that make a grade mean something
 * left in the document: what good looks like, and the marker you read it from.
 *
 * Holding it here rather than in prose gets three things prose can't:
 * the prompt and the response schema render from one source, a drill is
 * chosen from a catalog instead of invented, and recalibrating a standard is
 * a data edit rather than a prompt rewrite.
 */

/** How much contact a drill requires — gates against the team's game type. */
export type ContactLevel = 'none' | 'bag' | 'live'

export interface Drill {
  id: string
  name: string
  /** Cue ids this drill actually fixes. A drill with no cue behind it is filler. */
  fixes: string[]
  /** What the coach says while running it. */
  cue: string
  contact: ContactLevel
}

export interface CueSpec {
  id: string
  name: string
  /** What is visibly on screen when this cue is done well. */
  good: string
  /** Where in the rep to look for it — from the knowledge base's "frame markers to read". */
  marker: string
}

export interface DimensionSpec {
  key: string
  /** Share of the overall score, 0-1. */
  weight: number
  /** One line on what the dimension is actually measuring. */
  purpose: string
  cues: CueSpec[]
  /** When this dimension can legitimately have no evidence at all. */
  nullWhen?: string
}

/**
 * A measurable target per level. The knowledge base stops at 8U/10U/12U while
 * resolveLevelTier spans 6U → varsity, which left JV and varsity — the levels
 * the product explicitly refuses to clamp to youth standards — with no anchor
 * at all, under an instruction ("use the row nearest the age group") that
 * could not be obeyed. These fill that gap.
 */
export interface Benchmark {
  cue: string
  targets: Partial<Record<LevelTier, string>>
}

export interface ModuleRubric {
  module: string
  /** One line on who is being graded. */
  subject: string
  dimensions: DimensionSpec[]
  benchmarks: Benchmark[]
}

/** The closed cue list per dimension, derived so it can never drift from the rubric. */
export function cueCatalogFor(rubric: ModuleRubric): CueCatalog {
  return Object.fromEntries(
    rubric.dimensions.map((d) => [d.key, d.cues.map((c) => c.id)])
  )
}

/** Every cue in the rubric, flattened — used to validate what the model reported. */
export function allCueIds(rubric: ModuleRubric): Set<string> {
  return new Set(rubric.dimensions.flatMap((d) => d.cues.map((c) => c.id)))
}
