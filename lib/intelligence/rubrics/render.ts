import type { LevelTier } from '../levels'
import { tierLabel } from '../levels'
import type { Drill, ModuleRubric } from './types'

/**
 * Renders rubric data into the prompt.
 *
 * The two columns that never used to ship are the ones doing the work here:
 * the MARKER (where on screen to read the cue) and the STANDARD (what good
 * means at this team's level). Without them the model was told to "evaluate
 * hip-shoulder separation" and left to decide both where to look and what
 * counts as good — which is where interchangeable reports come from.
 */

/** The measurable targets, rendered only for the tier being graded. */
function renderBenchmarks(rubric: ModuleRubric, tier: LevelTier): string {
  const rows = rubric.benchmarks
    .map((b) => {
      const target = b.targets[tier]
      return target ? `  - ${b.cue}: ${target}` : null
    })
    .filter(Boolean)

  if (!rows.length) return ''

  return `MEASURABLE TARGETS AT THIS LEVEL (${tierLabel(tier)}) — meeting the target is Advanced (80-89) FOR THIS LEVEL:
${rows.join('\n')}`
}

export function buildRubricPrompt(rubric: ModuleRubric, tier: LevelTier): string {
  const dimensions = rubric.dimensions
    .map((d) => {
      const cues = d.cues
        .map((c) => `   - ${c.id} (${c.name}) — good: ${c.good}. Look for it: ${c.marker}.`)
        .join('\n')

      const nulling = d.nullWhen
        ? `\n   NO EVIDENCE: if ${d.nullWhen}, return null for this dimension rather than a numeric guess, and say so in the reasoning.`
        : ''

      return `${d.key.toUpperCase()} (${Math.round(d.weight * 100)}% of overall) — ${d.purpose}\n${cues}${nulling}`
    })
    .join('\n\n')

  const weights = rubric.dimensions
    .map((d) => `${d.key} ${Math.round(d.weight * 100)}%`)
    .join(', ')

  const benchmarks = renderBenchmarks(rubric, tier)

  return `${rubric.module} RUBRIC — grading ${rubric.subject}. Score each dimension 0-100.

${dimensions}

The overall score is computed from your dimension scores (${weights}) — do NOT return one, and
do not do the arithmetic. A dimension you return as null is dropped and the rest reweighted
automatically, so return null honestly rather than guessing a number to keep the maths tidy.

${benchmarks}

Grade against ${tierLabel(tier)} standards — never below (do not clamp a varsity player to youth
fundamentals) and never above (do not grade a youth player against varsity standards).`.trim()
}

/**
 * The drill menu.
 *
 * Filtered to this team's allowed contact level before it is rendered, so a
 * flag team is never shown a live-contact drill to choose from. Handing the
 * model a catalog is what stops `drills` being free-form invention — until
 * now the only drill knowledge in the system was the prohibited list.
 */
export function buildDrillMenuPrompt(drills: Drill[]): string {
  if (!drills.length) {
    return `DRILLS: no catalog drill fits this team's contact level. Recommend only non-contact
fundamentals, and name the cue each one fixes.`
  }

  const menu = drills
    .map((d) => `  - ${d.id} — ${d.name}. Fixes: ${d.fixes.join(', ')}. Coaching cue: "${d.cue}"`)
    .join('\n')

  return `DRILL MENU — choose from these ids only. Every drill you prescribe must fix a cue you
actually graded below standard on this rep; do not prescribe a drill for something he did well,
and do not invent a drill that is not on this list.

${menu}

For each prescription give: the drill id, the cue it addresses, and one sentence saying what
about THIS rep makes it the right drill this week.`
}
