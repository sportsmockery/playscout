import { contentWords, jaccard } from './aggregate-batch'
import { breakdownCoverage, type CueCatalog, type RepBreakdown } from './breakdown'

/**
 * Measures the two things a coach actually complained about: reports that are
 * too short, and reports that could have been written about someone else.
 *
 * "Improve the analysis" only means something if it is measurable, and both
 * of these are measurable without knowing the right answer — no graded film
 * needed, so a baseline can be taken today and every prompt or model change
 * checked against it.
 */

export interface QualityInput {
  strengths?: string[]
  weaknesses?: string[]
  drills?: string[]
  summary?: string
  reasoning?: Record<string, string>
  breakdown?: RepBreakdown
}

/** An anchor pattern the model was asked to produce: "frame 7" / "00:02.4" / "at 2.4s". */
const ANCHOR_PATTERN = /\b(?:frame\s*\d+|\d{1,2}:\d{2}(?:\.\d)?|\d+(?:\.\d+)?\s*s\b)/i

export function hasAnchor(text: string): boolean {
  return ANCHOR_PATTERN.test(text)
}

export interface DepthReport {
  /** Individual claims made across strengths, weaknesses and reasoning. */
  claims: number
  /** Cue observations in the structured breakdown. */
  cueNotes: number
  /** Cues explicitly declared unreadable — honesty, not absence. */
  notEvaluable: number
  /** Share of the module's cue catalog the report accounted for at all. */
  catalogCoverage: number
}

export function measureDepth(result: QualityInput, catalog: CueCatalog): DepthReport {
  const claims =
    (result.strengths?.length ?? 0) +
    (result.weaknesses?.length ?? 0) +
    Object.keys(result.reasoning ?? {}).length

  const coverage = breakdownCoverage(result.breakdown, catalog)

  return {
    claims,
    cueNotes: coverage.evaluated,
    notEvaluable: coverage.notEvaluable,
    catalogCoverage:
      coverage.total === 0
        ? 0
        : (coverage.evaluated + coverage.notEvaluable) / coverage.total,
  }
}

export interface SpecificityReport {
  /** Share of prose claims that point at a moment in the film. */
  anchoredProse: number
  /** Share of cue observations carrying a usable anchor. */
  anchoredCues: number
  /** Cue observations whose visible_marker is only a restatement of the cue name. */
  emptyMarkers: number
}

/**
 * Bare verdicts. They grade the cue instead of describing what was on screen,
 * so a marker built only from these plus the cue's own name is the generic
 * failure mode wearing the schema's clothes — "poor release point" tells a
 * coach nothing they can look at.
 */
const JUDGMENT_WORDS = new Set([
  'poor', 'bad', 'weak', 'good', 'great', 'strong', 'solid', 'excellent', 'elite',
  'inconsistent', 'consistent', 'inadequate', 'adequate', 'improve', 'improved',
  'needs', 'lacking', 'lacks', 'better', 'worse', 'average', 'decent', 'nice',
])

/**
 * A marker like "poor mechanics" for the cue `mechanics` describes nothing
 * that was visible — it renames the cue and grades it. The prompt asks for
 * what was on screen ("front foot lands closed, pointing to the near hash"),
 * so a marker that adds no observable words beyond the cue itself is empty.
 */
function markerIsEmpty(cue: string, marker: string): boolean {
  const cueWords = contentWords(cue.replace(/_/g, ' '))
  const markerWords = contentWords(marker)
  if (markerWords.size === 0) return true
  for (const w of markerWords) {
    if (!cueWords.has(w) && !JUDGMENT_WORDS.has(w)) return false
  }
  return true
}

export function measureSpecificity(result: QualityInput): SpecificityReport {
  const prose = [
    ...(result.strengths ?? []),
    ...(result.weaknesses ?? []),
    ...Object.values(result.reasoning ?? {}),
  ].filter((t) => t?.trim())

  const notes = result.breakdown?.cue_notes ?? []
  const anchored = notes.filter((n) => n.at_seconds != null || n.at_frame != null)

  return {
    anchoredProse: prose.length ? prose.filter(hasAnchor).length / prose.length : 0,
    anchoredCues: notes.length ? anchored.length / notes.length : 0,
    emptyMarkers: notes.filter((n) => markerIsEmpty(n.cue, n.visible_marker)).length,
  }
}

/**
 * Above this, two reports are saying the same thing in the same words — which
 * for two different clips means at least one of them is boilerplate. Set
 * deliberately higher than aggregate-batch's repeat threshold: there, two
 * clips making the same point is the signal being looked for; here it is the
 * defect.
 */
export const BOILERPLATE_SIMILARITY = 0.75

export interface BoilerplateHit {
  text: string
  similarTo: string
  score: number
}

/**
 * Finds claims in a new report that are near-copies of claims in the team's
 * recent reports. Catches the failure a coach notices first — a report that
 * reads identically for a different player — which no amount of prompt
 * instruction reliably prevents on its own.
 */
export function findBoilerplate(
  result: QualityInput,
  priorReports: QualityInput[],
  threshold = BOILERPLATE_SIMILARITY
): BoilerplateHit[] {
  const claimsOf = (r: QualityInput) =>
    [...(r.strengths ?? []), ...(r.weaknesses ?? []), ...Object.values(r.reasoning ?? {})].filter(
      (t) => t?.trim()
    )

  const prior = priorReports.flatMap(claimsOf).map((text) => ({ text, words: contentWords(text) }))
  const hits: BoilerplateHit[] = []

  for (const text of claimsOf(result)) {
    const words = contentWords(text)
    if (!words.size) continue

    let best: BoilerplateHit | null = null
    for (const p of prior) {
      const score = jaccard(words, p.words)
      if (score >= threshold && (!best || score > best.score)) {
        best = { text, similarTo: p.text, score }
      }
    }
    if (best) hits.push(best)
  }

  return hits
}
