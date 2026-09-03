/**
 * The shared vocabulary TEAMIQ and SCOUTIQ describe a team with.
 *
 * IQ_ANALYSIS_KNOWLEDGE_BASE §6.4 defines sixteen tendency types and says
 * "TEAMIQ and SCOUTIQ score frames against this catalog". The prompts emitted
 * a different set of ten; `blitz_tendency` was the only value present in both,
 * so anything written against the documented taxonomy matched nothing.
 *
 * The bigger cost was silent. persist-intelligence matches an existing
 * team_tendencies row on exact string equality of a FREE-TEXT label, and the
 * prompts asked for formation names with no vocabulary at all — so "Runs right
 * from tight double wing" and "Runs to the right out of Tight Double Wing"
 * became two rows, each with half the sample. A season aggregate built that
 * way under-counts by construction, and every downstream confidence with it.
 */

/** §6.4 — offense. */
export const OFFENSIVE_TENDENCY_TYPES = [
  'perimeter_run',
  'off_tackle_run',
  'motion_tell',
  'misdirection',
  'formation_cluster',
  'down_distance',
  'personnel_tell',
] as const

/** §6.4 — defense. */
export const DEFENSIVE_TENDENCY_TYPES = [
  'overpursuit',
  'gap_loss_inside_out',
  'soft_edge',
  'motion_coverage_bust',
  'tackling_leverage',
  'blitz_tendency',
] as const

/** §6.4 — either side of the ball. */
export const SHARED_TENDENCY_TYPES = ['field_position', 'clock_situation', 'hash_tendency'] as const

export const TENDENCY_TYPES = [
  ...OFFENSIVE_TENDENCY_TYPES,
  ...DEFENSIVE_TENDENCY_TYPES,
  ...SHARED_TENDENCY_TYPES,
] as const
export type TendencyType = (typeof TENDENCY_TYPES)[number]

/**
 * §7.3 — the labels TEAMIQ uses when describing `formation_cluster`.
 * A closed list because the rollup groups by what the model calls a formation:
 * free naming fragments one real tendency across several season rows.
 */
export const OFFENSIVE_FORMATIONS = [
  'double_wing',
  'power_i',
  'single_wing_wildcat',
  'trips_spread',
  'twins_pro',
  'empty',
  'goal_line',
  'other',
] as const
export type OffensiveFormation = (typeof OFFENSIVE_FORMATIONS)[number]

export const DEFENSIVE_FRONTS = [
  'six_two',
  'five_three',
  'four_four',
  'four_two_five',
  'bear_46',
  'goal_line',
  'other',
] as const
export type DefensiveFront = (typeof DEFENSIVE_FRONTS)[number]

/** §7.4 — tendencies live inside situations, so the buckets are fixed too. */
export const SITUATION_BUCKETS = [
  'first_and_ten',
  'second_and_short',
  'passing_down',
  'money_down',
  'red_zone',
  'backed_up',
  'two_minute',
] as const
export type SituationBucket = (typeof SITUATION_BUCKETS)[number]

export const SITUATION_DEFINITIONS: Record<SituationBucket, string> = {
  first_and_ten: '1st & 10 — the base down, where a team calls its real identity',
  second_and_short: '2nd & short (3 or fewer) — stay-on-schedule, often the most predictable run',
  passing_down: '2nd or 3rd & long (7 or more) — where pass tendency and pressure show',
  money_down: '3rd or 4th & short (2 or fewer) — the highest-leverage tendency to scout',
  red_zone: 'Red zone (inside the 20) — compressed field, scheme and personnel often change',
  backed_up: 'Backed up (own 10 or closer) — conservative tells',
  two_minute: 'Two-minute — clock pressure and situational errors',
}

/**
 * §7.6 — the threshold was never stated in any prompt, so the model picked its
 * own definition of a big play per clip and the counts meant nothing across
 * clips.
 */
export const EXPLOSIVE_PLAY_YARDS = 10

/** §7.6 — an explosive play is almost always one of these three failures. */
export const EXPLOSIVE_CAUSES = ['force_failure', 'gap_failure', 'pursuit_failure'] as const
export type ExplosiveCause = (typeof EXPLOSIVE_CAUSES)[number]

/** Renders the vocabulary into a prompt block, so it can't drift from the enums the schema enforces. */
export function buildTaxonomyPrompt(): string {
  return `SHARED VOCABULARY — use these exact ids. A tendency named freely cannot be counted
across clips, so a label you invent is a tendency the team never accumulates evidence for.

TENDENCY TYPES
  Offense: ${OFFENSIVE_TENDENCY_TYPES.join(', ')}
  Defense: ${DEFENSIVE_TENDENCY_TYPES.join(', ')}
  Either:  ${SHARED_TENDENCY_TYPES.join(', ')}

FORMATIONS (offense): ${OFFENSIVE_FORMATIONS.join(', ')}
FRONTS (defense): ${DEFENSIVE_FRONTS.join(', ')}

SITUATIONS
${SITUATION_BUCKETS.map((b) => `  - ${b}: ${SITUATION_DEFINITIONS[b]}`).join('\n')}

EXPLOSIVE PLAYS: a gain of ${EXPLOSIVE_PLAY_YARDS}+ yards. For each one, name which failure
created it — ${EXPLOSIVE_CAUSES.join(', ')} — because that is the coaching point, not the yardage.`
}
