import { z } from 'zod'
import { type DefensiveProfile, MIN_PROFILE_SNAPS } from './aggregate-defense'
import { COVERAGE_DEFINITIONS, COVERAGE_SHELL_DEFINITIONS } from './defense-structure'

/**
 * The role briefs — PlayScout's System A over the defensive structure System B
 * charted (PLAYSCOUTIQ_SPEC.md).
 *
 * A scouting report that says "they rush upfield hard" is true for the whole
 * staff and actionable for nobody. A quarterback needs to know what the shell
 * says and what it becomes; a coordinator needs to know which side to attack
 * and on which down. Same evidence, three readers, three documents.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: every number comes from
 * aggregate-defense.ts and is handed in as a fact. The model explains what the
 * facts MEAN. It may not add a coverage, upgrade a rate, or fill a gap with
 * what a defence "usually" does — a plan invented on top of a thin sample is
 * indistinguishable from a real one at the moment a coach reads it, and only
 * distinguishable on Friday night.
 */

const KeyedPointSchema = z.object({
  point: z.string(),
  /** The evidence line behind it — "two-high on 41 of 64 readable snaps". */
  evidence: z.string(),
})

export const GamePlanSchema = z.object({
  /** One line the whole staff shares. */
  headline: z.string(),
  /** What the defence IS, stated as structure rather than adjectives. */
  identity: z.string(),
  quarterback: z.object({
    /** What to look at before the snap, in the order to look at it. */
    presnap_checklist: z.array(z.string()),
    /** Shell → what it turned into, on this film. */
    shell_reads: z.array(KeyedPointSchema),
    /** Where the ball should go against what they showed. */
    where_to_throw: z.array(KeyedPointSchema),
    /** What will get the ball intercepted against this defence. */
    avoid: z.array(z.string()),
  }),
  offensive_coordinator: z.object({
    attack: z.array(KeyedPointSchema),
    formation_and_motion: z.array(KeyedPointSchema),
    situational: z.array(KeyedPointSchema),
  }),
  defensive_coordinator: z.object({
    /** What THEIR offence did to us, and what to take away. */
    take_away: z.array(KeyedPointSchema),
    personnel_matchups: z.array(KeyedPointSchema),
  }),
  /** Named explicitly: what the film could NOT establish. */
  not_observed: z.array(z.string()),
  /** How much to trust all of the above. */
  evidence_note: z.string(),
})
export type GamePlan = z.infer<typeof GamePlanSchema>

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/**
 * The profile as the model sees it: every figure with its denominator
 * attached, because a rate without one is how "Cover 3 on 80%" gets written
 * about four snaps.
 */
export function renderDefensiveProfile(profile: DefensiveProfile): string {
  const lines: string[] = []

  lines.push(`DEFENSIVE SNAPS CHARTED: ${profile.snaps}`)

  const dist = <T extends string>(
    label: string,
    block: { readable: number; distribution: { value: T; count: number; rate: number }[] },
    definitions?: Record<string, string>
  ) => {
    if (!block.readable) {
      lines.push(`${label}: never readable on this film (0 of ${profile.snaps} snaps).`)
      return
    }
    lines.push(`${label} — readable on ${block.readable} of ${profile.snaps} snaps:`)
    for (const d of block.distribution) {
      const meaning = definitions?.[d.value] ? ` (${definitions[d.value]})` : ''
      lines.push(`  ${d.value}: ${d.count} of ${block.readable} — ${pct(d.rate)}${meaning}`)
    }
  }

  dist('PRE-SNAP SHELL', profile.shells, COVERAGE_SHELL_DEFINITIONS)
  dist('COVERAGE PLAYED', profile.coverages, COVERAGE_DEFINITIONS)
  dist('SAFETY ROTATION', profile.rotations)
  dist('STRENGTH DECLARED', profile.strength)

  for (const [label, splits] of [
    ['SHELL BY BALL POSITION', profile.shellByBallPosition],
    ['COVERAGE BY SITUATION', profile.coverageBySituation],
    ['ROTATION BY DECLARED STRENGTH', profile.rotationByStrength],
  ] as const) {
    if (!splits.length) continue
    lines.push(`${label}:`)
    for (const s of splits) {
      const top = s.top ? `${s.top.value} ${s.top.count}/${s.snaps} (${pct(s.top.rate)})` : 'nothing readable'
      lines.push(`  ${s.key} — ${s.snaps} snaps — most often ${top}`)
    }
  }

  if (profile.safetyDepth.field) {
    lines.push(
      `FIELD SAFETY DEPTH: ${profile.safetyDepth.field.mean} yards average over ${profile.safetyDepth.field.measured} measured snaps`
    )
  }
  if (profile.safetyDepth.boundary) {
    lines.push(
      `BOUNDARY SAFETY DEPTH: ${profile.safetyDepth.boundary.mean} yards average over ${profile.safetyDepth.boundary.measured} measured snaps`
    )
  }
  if (profile.boxCount) {
    lines.push(`BOX COUNT: ${profile.boxCount.mean} average over ${profile.boxCount.measured} snaps`)
  }

  if (profile.pressure.readable) {
    lines.push(
      `PRESSURE: rushed five or more on ${profile.pressure.blitzed} of ${profile.pressure.readable} readable snaps (${pct(profile.pressure.rate)}); showed pressure and dropped out ${profile.pressure.bailedShowing} times`
    )
  }

  if (profile.tells.length) {
    lines.push('PRE-SNAP TELLS, by how often each kind recurred:')
    for (const t of profile.tells) {
      lines.push(`  ${t.kind} — seen ${t.count} times: ${t.observations.join(' | ')}`)
    }
  }

  if (profile.hashChecked) {
    lines.push(
      `HASH CROSS-CHECK: the film read and the coach's breakdown agreed on ${profile.hashChecked - profile.hashDisagreements} of ${profile.hashChecked} snaps.`
    )
  }

  return lines.join('\n')
}

/**
 * The rules that make a role brief usable, folded into ScoutIQ's existing
 * Stage-2 prompt rather than shipped as a second game-plan generator. There is
 * one game plan in this product and it lives in modules/scoutiq-gameplan.ts;
 * this only adds what the defensive structure makes newly answerable.
 */
export function buildRoleBriefRules(
  opponentName: string,
  teamName: string | null | undefined,
  thin: boolean
): string {
  const us = teamName ?? 'our team'
  return `
=== ROLE BRIEFS — the same evidence, written for three different readers ===
A plan that is true for the whole staff is actionable for nobody. Write the quarterback,
offensive-coordinator and defensive-coordinator sections separately.

1. EVERY claim carries its evidence. Each point's \`evidence\` field quotes the figure AND the
   denominator from the defensive structure above — "two-high on 41 of 64 readable snaps" — never
   a number you worked out yourself and never a rate without the snaps behind it.

2. You may not add a coverage, rotation, tendency or player that is not in the evidence above.
   If the film never showed what they play on third and long, that goes in not_observed, not
   into a paragraph that reads as though it did.

3. A "not readable" figure is NOT a zero. Coverage readable on 12 of 70 snaps means you know
   twelve snaps — say it in those terms. Never describe a defence from twelve snaps as though
   you watched seventy.

4. The QUARTERBACK brief is what he does at the line, in order. Checklist items are things he
   can SEE in two seconds: safety depth and width, corner leverage, box count, a walk-up. Not
   "identify the coverage" — tell him which picture means which answer, using the shells and
   rotations above.

5. where_to_throw and avoid follow from the structure. If they show two-high and rotate a safety
   to the field, the boundary is where the help left — say that, and say which snaps showed it.

6. The DC brief is about ${opponentName}'s OFFENSE. If there is little offensive evidence above,
   say so and keep it short rather than padding it.

7. Never recommend anything that helps ${opponentName}. Every line is an action for ${us}.
${thin ? `
8. THIN EVIDENCE — SAY SO FIRST. Coverage structure was readable on fewer than ${MIN_PROFILE_SNAPS}
   snaps. Open the headline and the evidence note by saying the plan rests on a small sample, and
   keep every section shorter and more cautious. A confident plan off this much film is worse
   than a short one.` : ''}`.trim()
}
