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

/**
 * How a way to attack an opponent is filed.
 *
 * A scout report that returns twenty-five sentences in a flat list is a wall,
 * not a plan. Grouping them by what a coach would actually install lets the
 * list be read as "here are four things on the perimeter, three off motion"
 * rather than twenty-five equally-weighted bullets.
 */
export const ATTACK_CATEGORIES = [
  'perimeter_run',
  'interior_run',
  'play_action',
  'dropback_pass',
  'motion',
  'tempo',
  'personnel_mismatch',
  'situational',
  'special_teams',
] as const
export type AttackCategory = (typeof ATTACK_CATEGORIES)[number]

/**
 * WHAT is wrong with the opponent, as a closed set — separate from
 * ATTACK_CATEGORIES, which says which part of OUR game plan exploits it.
 *
 * This exists because counting free text does not work, and that was measured
 * on a real 113-clip report. Clustering coaching points by shared words left
 * "corners play soft off-coverage" and "boundary corner plays with a large
 * cushion" in separate clusters — they share two words out of fifteen — so one
 * real tendency shattered into dozens of one-clip fragments and the report
 * told the coach "only a handful of patterns appeared in more than one clip".
 * Worse, the only things that DID cluster were the model's templated
 * non-findings, because boilerplate is worded identically every time.
 *
 * Lexical matching cannot fix that: the pair above scores 0.133 while pairs
 * that must never merge score 0.111. So the model files each weakness under
 * one of these ids and the counting becomes exact — the same move that fixed
 * tendencies, player grades and stat credits. The prose still carries the
 * detail; the id carries the count.
 *
 * Deliberately about the DEFENSE, because an attack point is how our offense
 * attacks theirs.
 */
export const WEAKNESS_TYPES = [
  'soft_coverage',
  'coverage_bust',
  'no_deep_help',
  'slow_safety_rotation',
  'poor_zone_spacing',
  'beaten_in_man',
  'overaggressive_rush',
  'lost_contain',
  'interior_displaced',
  'slow_recognition',
  'wrong_gap_fit',
  'over_pursuit',
  'poor_pursuit_angle',
  'missed_tackle_space',
  'box_count_mismatch',
  'personnel_mismatch',
  'presnap_tell',
  'tempo_or_substitution',
  'special_teams_leak',
  'penalty_prone',
  'other',
] as const
export type WeaknessType = (typeof WEAKNESS_TYPES)[number]

/**
 * One line each, written as what the SCOUT SEES rather than as a label.
 *
 * These go into the prompt verbatim. A definition that names a precondition
 * makes the model hunt for the precondition and answer "not visible" when it
 * is absent — the exact failure the coverage definitions in
 * defense-structure.ts had to have removed, so keep these to the observation.
 */
export const WEAKNESS_TYPE_LABELS: Record<WeaknessType, string> = {
  soft_coverage: 'Corners or safeties play with a cushion and concede what is underneath',
  coverage_bust: 'A receiver came open uncovered — someone did not pick up their assignment',
  no_deep_help: 'No safety over the top of a matchup, so that defender is on an island',
  slow_safety_rotation: 'The safety is late getting to his landmark after the snap',
  poor_zone_spacing: 'Holes between zone defenders — two defenders on one, nobody on another',
  beaten_in_man: 'A man defender loses his receiver at the release or the top of the route',
  overaggressive_rush: 'Rushers get upfield hard and run themselves out of the play',
  lost_contain: 'The edge is not set — the ball gets outside the force defender',
  interior_displaced: 'Interior linemen get moved off the ball at the point of attack',
  slow_recognition: 'Linebackers or secondary are late to read what the play actually is',
  wrong_gap_fit: 'A defender fits the wrong gap and leaves a running lane',
  over_pursuit: 'The defense flows hard to the ball and is exposed to cutback or counter',
  poor_pursuit_angle: 'Defenders take shallow or flat angles and cannot cut the ball off',
  missed_tackle_space: 'Tacklers miss in the open field, turning normal gains into long ones',
  box_count_mismatch: 'The box is too light to stop the run, or too heavy to cover behind it',
  personnel_mismatch: 'One specific player is outmatched by who lines up across from him',
  presnap_tell: 'Their alignment or movement gives the call away before the snap',
  tempo_or_substitution: 'They struggle to get lined up against tempo or personnel changes',
  special_teams_leak: 'A breakdown in the kicking game — coverage, protection or return',
  penalty_prone: 'A recurring foul that gives up yardage or a first down',
  other: 'A weakness that none of the ids above describes',
}

export const ATTACK_CATEGORY_LABELS: Record<AttackCategory, string> = {
  perimeter_run: 'Perimeter run',
  interior_run: 'Interior run',
  play_action: 'Play action',
  dropback_pass: 'Dropback pass',
  motion: 'Motion',
  tempo: 'Tempo',
  personnel_mismatch: 'Personnel mismatch',
  situational: 'Situational',
  special_teams: 'Special teams',
}
