import { buildFootballBrain, buildGameTypeContext } from '../football-brain'
import { resolveLevelTier, tierLabel } from '../levels'
import { ATTACK_CATEGORY_LABELS, type AttackCategory } from '../taxonomy'
import type { AggregatedScoutReport } from '../scoutiq-aggregate'
import { renderDefensiveProfile, buildRoleBriefRules } from '../game-plan'
import { profileIsThin } from '../aggregate-defense'

export interface ScoutIQGamePlanContext {
  opponentName: string
  opponentAgeGroup?: string | null
  teamName?: string | null
  teamAgeGroup?: string | null
  /** Competition level ('High School', ...), so a varsity plan isn't written for a 10U coach. */
  teamLevel?: string | null
  teamOffensiveStyle?: string | null
  teamDefensiveStyle?: string | null
  gameType?: string | null
  aggregated: AggregatedScoutReport
  ownRosterSummary?: string
  ownPlaybookSummary?: string
}

/**
 * How many clips a point must appear in before a game plan may be built on it.
 *
 * A HARD SPLIT IN CODE, not an instruction. The prompt already told the model
 * "something seen once may be a one-off … you must not present them as equally
 * reliable", and on a real 113-clip report it faithfully wrote "only a handful
 * of patterns appeared in more than one clip" and then built the entire plan
 * out of 2-clip items anyway. A model asked to weigh evidence will weigh it
 * and still use what it has; the only thing that reliably keeps thin evidence
 * out of a plan is not handing it over as plan material.
 *
 * Three, because two observations can be a coincidence and three is the
 * smallest number that cannot. It is deliberately NOT scaled to the
 * denominator: 3 of 12 clips is a real tendency on a short scout, and picking
 * a percentage here would be inventing a threshold nothing has measured.
 * The rate is printed either way, so a coach reading "3 of 47" can judge it.
 */
export const MIN_TENDENCY_CLIPS = 3

function line(a: AggregatedScoutReport['attack_points'][number], defensiveClips: number): string {
  const label = ATTACK_CATEGORY_LABELS[a.category as AttackCategory] ?? a.category
  const of = defensiveClips > 0 ? ` of ${defensiveClips}` : ''
  return `- [${label}] ${a.point} — seen in ${a.clips}${of} clip${a.clips === 1 ? '' : 's'} where they were on defense`
}

export function splitByEvidence(points: AggregatedScoutReport['attack_points']) {
  return {
    repeated: points.filter((a) => a.clips >= MIN_TENDENCY_CLIPS),
    singleLooks: points.filter((a) => a.clips < MIN_TENDENCY_CLIPS),
  }
}

function formatAttackPoints(
  points: AggregatedScoutReport['attack_points'],
  defensiveClips: number
): string {
  if (!points.length) return '(none observed yet)'
  return points.map((a) => line(a, defensiveClips)).join('\n')
}

function formatTendencyLines(tendencies: AggregatedScoutReport['offensive_tendencies']): string {
  if (!tendencies.length) return '(none observed yet)'
  return tendencies
    .map((t) => `- [${t.tendency_type}] ${t.label}: ${t.rate != null ? `${Math.round(t.rate * 100)}% of observed plays` : 'observed'}, confidence ${t.confidence.toFixed(2)}, sample ${t.sample_size} plays`)
    .join('\n')
}

/**
 * ScoutIQ Stage 2 (System A, Claude Opus) — reasons over STORED evidence
 * from every scouted clip of one opponent (already aggregated by
 * scoutiq-aggregate.ts), never over raw video. Produces the "how to beat
 * them" game plan, matched to the coach's own roster/playbook.
 */
export function buildScoutIQGamePlanPrompt(ctx: ScoutIQGamePlanContext): string {
  const { aggregated } = ctx
  const gameTypeContext = buildGameTypeContext(ctx.gameType)
  // This module used the hardcoded 'unknown'-tier export and then wrote every
  // plan for a "volunteer 9U-10U coach" — the youth-only ceiling this product
  // explicitly removed everywhere else.
  const tier = resolveLevelTier({ age_group: ctx.teamAgeGroup, level: ctx.teamLevel })

  return `${buildFootballBrain(tier)}

You are SCOUTIQ's game-plan synthesizer (System A). You do NOT watch video — you reason
only over the aggregated scouting evidence below, already extracted from ${aggregated.evidence_sufficiency.clips_analyzed} film clip(s) of the opponent.

OPPONENT: ${ctx.opponentName}${ctx.opponentAgeGroup ? ` (${ctx.opponentAgeGroup})` : ''}
YOUR TEAM: ${ctx.teamName ?? 'the coach’s team'}${ctx.teamAgeGroup ? ` (${ctx.teamAgeGroup})` : ''} — Offense: ${ctx.teamOffensiveStyle ?? 'unknown'} | Defense: ${ctx.teamDefensiveStyle ?? 'unknown'}
${gameTypeContext}

## Aggregated Opponent Evidence (from ${aggregated.evidence_sufficiency.clips_analyzed} clip(s), ${aggregated.evidence_sufficiency.plays_observed} total plays observed)

Offensive tendencies:
${formatTendencyLines(aggregated.offensive_tendencies)}

Defensive tendencies:
${formatTendencyLines(aggregated.defensive_tendencies)}

Formations observed: ${aggregated.formations.map((f) => f.name).join(', ') || '(none observed yet)'}

Situational tells:
${aggregated.situational_tells.map((t) => `- ${t.situation}: ${t.tell} (${t.clips} clip${t.clips === 1 ? '' : 's'})`).join('\n') || '(none observed yet)'}

Ways to attack them. The denominator is the ${aggregated.evidence_sufficiency.defensive_clips} clip(s) in which
${ctx.opponentName} was ON DEFENSE — the only clips that can show a way to attack them — out of
${aggregated.evidence_sufficiency.clips_analyzed} scouted in total.

REPEATED — seen in ${MIN_TENDENCY_CLIPS}+ clips. **Build the plan out of these and nothing else.**
${formatAttackPoints(splitByEvidence(aggregated.attack_points).repeated, aggregated.evidence_sufficiency.defensive_clips) === '(none observed yet)' ? '(nothing repeated across enough clips to plan around — say so)' : formatAttackPoints(splitByEvidence(aggregated.attack_points).repeated, aggregated.evidence_sufficiency.defensive_clips)}

SINGLE LOOKS — seen once or twice. These are NOT tendencies and must NOT become
recommendations, priorities or the reason for a call. You may mention one only as
supporting colour beside a REPEATED point it agrees with, and you must say it was a
single look when you do. If the REPEATED list above is empty, the honest answer is that
this film does not yet support a game plan — say that instead of promoting anything from
this list:
${formatAttackPoints(splitByEvidence(aggregated.attack_points).singleLooks, aggregated.evidence_sufficiency.defensive_clips)}

Target players (weakness identified by legible jersey number or position/alignment — never a guessed number):
${aggregated.target_players.map((p) => `- ${p.identifier}: ${p.reason} (confidence ${p.confidence.toFixed(2)})`).join('\n') || '(none identified yet)'}

## ${ctx.opponentName}'s Defensive Structure, charted snap by snap
Every figure below is counted by the app from the snaps themselves. A rate is always over the
snaps where that question was READABLE, never over all snaps — the camera follows the ball, so
the secondary is often out of frame, and "readable on 12 of 70" means you know twelve snaps.
${renderDefensiveProfile(aggregated.defensive_profile)}

## Your Team's Own Personnel & Playbook
${ctx.ownRosterSummary ?? '(no roster on file)'}
${ctx.ownPlaybookSummary ?? '(no playbook on file)'}

## Task
Produce a game plan a ${tierLabel(tier)} coach can actually use this week:
1. offensive_game_plan — how to attack this opponent on offense, matched to YOUR team's own personnel/playbook where possible.
2. defensive_game_plan — how to stop this opponent's offense.
3. target_players_plan — how to specifically exploit the target players listed above (only if the evidence above lists any).
4. practice_week_focus — 3-5 concrete practice-week install priorities.
5. evidence_sufficiency_note — one honest sentence on how much this is built on (cite the clip/play counts above, and say how many of those clips actually had them on defense).${aggregated.evidence_sufficiency.unconfirmed_subject_clips > 0 ? ` NOTE: on ${aggregated.evidence_sufficiency.unconfirmed_subject_clips} clip(s) the film analyst could not confirm it was grading ${ctx.opponentName} rather than the other team — say so plainly here.` : ''} If the sample is thin (few clips or plays), say so plainly and recommend scouting more film before fully trusting this plan.
6. summary — 2-3 sentence executive summary.
7. quarterback_brief — what OUR quarterback does at the line against them (see the role-brief rules below).
8. coordinator_brief — the same evidence written for the offensive coordinator.
9. not_observed — what this film could NOT establish about them, named plainly.

${buildRoleBriefRules(ctx.opponentName, ctx.teamName, profileIsThin(aggregated.defensive_profile))}

RULES:
- Only reference opponent tendencies, formations, or target players that appear in the evidence above. Never invent a tendency, jersey number, or player detail not listed there.
- If a category above has no evidence (e.g. no target players identified), say so in that section rather than inventing one to fill it.
- Respect the safety rules above: no prohibited drills, no live-contact drills unless GAME TYPE is tackle.
- Pitch every recommendation at ${tierLabel(tier)} — see the COMPETITION LEVEL block above. Do not clamp a varsity staff to youth-lean schemes, and do not hand a youth staff college-caliber ones.

Return ONLY JSON matching this schema, no preamble, no markdown fences:
{
  "offensive_game_plan": ["<string>", ...],
  "defensive_game_plan": ["<string>", ...],
  "target_players_plan": ["<string>", ...],
  "practice_week_focus": ["<string>", ...],
  "evidence_sufficiency_note": "<string>",
  "summary": "<string>",
  "quarterback_brief": {
    "presnap_checklist": ["<what he can SEE in two seconds, in the order he looks>", ...],
    "shell_reads": [{ "point": "<what this picture turns into>", "evidence": "<figure and denominator from above>" }, ...],
    "where_to_throw": [{ "point": "<string>", "evidence": "<string>" }, ...],
    "avoid": ["<what gets the ball intercepted against them>", ...]
  },
  "coordinator_brief": {
    "attack": [{ "point": "<string>", "evidence": "<string>" }, ...],
    "formation_and_motion": [{ "point": "<string>", "evidence": "<string>" }, ...],
    "situational": [{ "point": "<string>", "evidence": "<string>" }, ...]
  },
  "not_observed": ["<what the film could not establish>", ...]
}`
}

export interface KeyedPoint {
  point: string
  /** The figure AND its denominator, quoted from the charted evidence. */
  evidence: string
}

export interface ScoutIQGamePlan {
  offensive_game_plan: string[]
  defensive_game_plan: string[]
  target_players_plan: string[]
  practice_week_focus: string[]
  evidence_sufficiency_note: string
  summary: string
  /**
   * Role briefs. Optional because every plan generated before the defensive
   * structure existed has none, and those plans still render.
   */
  quarterback_brief?: {
    presnap_checklist: string[]
    shell_reads: KeyedPoint[]
    where_to_throw: KeyedPoint[]
    avoid: string[]
  }
  coordinator_brief?: {
    attack: KeyedPoint[]
    formation_and_motion: KeyedPoint[]
    situational: KeyedPoint[]
  }
  not_observed?: string[]
}
