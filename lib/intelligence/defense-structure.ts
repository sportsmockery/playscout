/**
 * What a defence is DOING on a snap — the layer a quarterback, an offensive
 * coordinator and a defensive coordinator all actually plan against.
 *
 * WHY THIS EXISTS. The scouting report answered "they rush upfield hard and
 * their linebackers chase the first thing they see". True, useful, and general.
 * The questions a coach asked next were: what coverage do they run, which
 * safety is the strong safety, what changes to the strong side, what changes
 * with the ball on a hash, and what do they show me before the snap. NONE of
 * those could be answered, because none of them were ever charted — the
 * evidence schema had fronts (6-2, 5-3, 4-4) but no secondary, no strength
 * declaration and no per-player alignment. A model asked those questions over
 * the old report would have invented every answer, which is the one thing this
 * product does not do.
 *
 * So the answers become evidence first. Everything here is a CLOSED vocabulary
 * for the same reason `taxonomy.ts` is: a free-text coverage label fragments
 * one real tendency across a season into rows that each hold a fraction of the
 * sample, and "Cover 3" / "cover three" / "single high zone" are then three
 * different defences.
 *
 * THE HONEST CONSTRAINT, stated here because it decides the design: coverage is
 * HARD to read on youth and high-school sideline film. The camera follows the
 * ball, so the secondary is often out of frame by the time the coverage
 * declares itself, and a tight shot can lose both safeties entirely. That is
 * why:
 *
 *   - every vocabulary below has an explicit "not visible" member, and the
 *     prompt is told to prefer it;
 *   - PRE-SNAP and POST-SNAP are separate questions. Pre-snap the defence is
 *     standing still and the whole formation is usually in frame; post-snap it
 *     is moving and the camera is not looking at it. Expect the pre-snap shell
 *     to be answerable far more often than the played coverage, and a rollup
 *     that reports 60 shells and 20 coverages is not broken;
 *   - nothing here is counted by the model. `aggregate-defense.ts` does every
 *     count, so a coverage percentage is the sum of its own snaps.
 */

/**
 * What the secondary SHOWS before the snap — how many deep safeties.
 *
 * Deliberately separate from the coverage played. A two-high shell is Cover 2,
 * Cover 4, Cover 6 or a disguised single-high that rotates after the snap, and
 * on this film the shell is readable when the rotation is not. For a
 * quarterback the shell is also the more useful fact: it is what he can see at
 * the line.
 */
export const COVERAGE_SHELLS = [
  'two_high',
  'one_high',
  'zero_high',
  'three_high',
  'not_visible',
] as const
export type CoverageShell = (typeof COVERAGE_SHELLS)[number]

export const COVERAGE_SHELL_DEFINITIONS: Record<CoverageShell, string> = {
  two_high: 'Two safeties deep and roughly split — Cover 2, 4 or 6 territory',
  one_high: 'One safety alone in the deep middle, reading the quarterback — Cover 1 or Cover 3 territory',
  // NOT "usually all-out pressure or goal line". That was my wording and a
  // coach corrected it off his own film: the opponent it was written against
  // plays zero-high as a BASE call, mixed with one-high, on ordinary downs in
  // the first possessions of a game. Attaching a precondition to a shell makes
  // the model look for the precondition and answer "not visible" when it is
  // absent, which suppresses exactly the read this is for.
  zero_high: 'No deep safety at all — the safety is covering a man or is in the box. A base call for some defences, not only a goal-line or all-out-pressure look',
  three_high: 'Three deep defenders pre-snap, seen in some youth prevent looks',
  not_visible: 'The safeties are out of frame or the clip starts too late to see the shell',
}

/**
 * What the defence actually PLAYED once the ball was snapped.
 *
 * `man_unknown` and `zone_unknown` exist because "the corners turned and ran
 * with receivers" is a real, useful observation that does not identify which
 * man coverage it was — and forcing a choice between Cover 1 and Cover 0 on
 * that evidence is how a guess enters a report as a fact.
 */
export const COVERAGES = [
  'cover_0',
  'cover_1',
  'cover_2',
  'cover_2_man',
  'cover_3',
  'cover_4_quarters',
  'cover_6',
  'man_unknown',
  'zone_unknown',
  'not_determinable',
] as const
export type Coverage = (typeof COVERAGES)[number]

export const COVERAGE_DEFINITIONS: Record<Coverage, string> = {
  // A coach's own definition, which is the operational one: "Cover 0 there is
  // no safety in the middle because he is man to man covering someone too."
  // Pressure often comes with it and is NOT what identifies it.
  cover_0: 'Man across the board with NO safety in the deep middle — that safety is covering a man instead of helping. Extra rushers often come with it but are not required',
  cover_1: 'Man underneath with ONE safety alone in the deep middle, reading the quarterback rather than covering a man',
  cover_2: 'Two deep safeties splitting the field, five underneath zones',
  cover_2_man: 'Two deep safeties, man underneath',
  cover_3: 'Three deep (two corners and a safety), four underneath zones',
  cover_4_quarters: 'Four deep defenders each playing a quarter of the field',
  cover_6: 'Quarters to one side, Cover 2 to the other — split-field',
  man_unknown: 'Clearly man — defenders turned and ran with receivers — but which one is unclear',
  zone_unknown: 'Clearly zone — defenders dropped to spots and watched the quarterback — but which one is unclear',
  not_determinable: 'The coverage never became visible on this clip',
}

/**
 * What the safeties DID between the snap and the throw. This is the single
 * most valuable thing a quarterback can be told, because it is the difference
 * between what he saw pre-snap and what he got.
 */
export const SAFETY_ROTATIONS = [
  'stayed_two_high',
  'rotated_to_middle',
  'rotated_to_field',
  'rotated_to_boundary',
  'rotated_to_strength',
  'rotated_away_from_strength',
  'both_came_down',
  'no_rotation_single_high',
  /**
   * The deep safety RUSHED. Added after a coach described play 1 of the
   * ground-truth game: one-high pre-snap, the free safety blitzes, so what was
   * actually played is Cover 0 — man with nobody left helping. The vocabulary
   * had no way to say that, so the one snap whose truth we knew could not be
   * represented even by a perfect read.
   */
  'safety_blitzed',
  /** A single-high safety who left the deep middle for coverage or a run fit. */
  'single_high_came_down',
  /** There was no deep safety to rotate — they played the snap without one. */
  'no_deep_help',
  'not_visible',
] as const
export type SafetyRotation = (typeof SAFETY_ROTATIONS)[number]

/**
 * Where the defence declared its strength — which side it set the front and
 * the extra defender to. Answering "what do they do to the strong side vs the
 * weak side" requires knowing which side they CALLED strong, not which side
 * the offence lined up heavy.
 */
export const STRENGTH_DECLARATIONS = [
  'to_tight_end',
  'to_field',
  'to_boundary',
  'to_trips',
  'to_passing_strength',
  'balanced',
  'not_determinable',
] as const
export type StrengthDeclaration = (typeof STRENGTH_DECLARATIONS)[number]

/** Where a defender lines up relative to the man he is covering. */
export const LEVERAGES = ['inside', 'outside', 'head_up', 'not_visible'] as const
export type Leverage = (typeof LEVERAGES)[number]

/** How many rushed, and from where. Not a blitz name — a count and a source. */
export const PRESSURE_LOOKS = [
  'three_man',
  'four_man',
  'five_man_edge',
  'five_man_interior',
  'six_plus',
  'delayed_or_green_dog',
  'showed_pressure_bailed',
  'not_determinable',
] as const
export type PressureLook = (typeof PRESSURE_LOOKS)[number]

/**
 * The kinds of thing a quarterback can actually LOOK AT before the snap.
 *
 * Closed on purpose and phrased as places to look rather than conclusions: the
 * tell is "the field safety walked to 8 yards", the meaning is a separate
 * field. A model allowed to write free-text tells produces coaching slogans.
 */
export const PRESNAP_TELL_KINDS = [
  'safety_depth',
  'safety_alignment_width',
  'safety_late_rotation',
  'corner_leverage',
  'corner_depth',
  'corner_press_or_off',
  'linebacker_depth',
  'linebacker_width',
  'linebacker_walk_up',
  'line_shade_or_stunt_look',
  'nickel_or_extra_db',
  'personnel_substitution',
  'alignment_response_to_motion',
  'sideline_signal_timing',
] as const
export type PresnapTellKind = (typeof PRESNAP_TELL_KINDS)[number]

/**
 * Where the ball was spotted. The model reports it; the coach's Hudl breakdown
 * ALSO carries it (`play_sequences.hash`), so the two can be compared — a free
 * corroboration of exactly the kind the rest of this module runs on.
 */
export const BALL_POSITIONS = ['left_hash', 'middle', 'right_hash', 'not_determinable'] as const
export type BallPosition = (typeof BALL_POSITIONS)[number]

/**
 * Which side is the WIDE side. With the ball on a hash the two sides of the
 * field are different widths, and a defence that treats them the same is
 * giving something away. From the OFFENCE's perspective, like every other
 * left/right in this codebase.
 */
export const FIELD_SIDES = ['left', 'right', 'even', 'not_determinable'] as const
export type FieldSide = (typeof FIELD_SIDES)[number]

/* ────────────────────────────────────────────────────────────────────────────
 * PER-DEFENDER CHARTING — all eleven, not just the safeties.
 *
 * WHY THIS REPLACED ASKING FOR A COVERAGE LABEL. On play 1 of the ground-truth
 * game the defence aligned ONE-HIGH and the free safety BLITZED, so what was
 * actually played was Cover 0 — man with nobody left helping. The module could
 * not represent that at all: the rotation vocabulary had no "the safety
 * rushed", and `pressure_look` counted rushers without saying one of them came
 * from the deep middle. A perfect read had nowhere to put the answer.
 *
 * The fix is the one this codebase already applies to every other number:
 * ask what each player DID, and compute the label. `stat-lines.ts` sums the
 * box score, `player-grades.ts` computes the grade, `scoring.ts` computes the
 * score — and here `deriveCoverage` computes the coverage. A model asked
 * "what coverage was that?" answers with a name it has to justify; a model
 * asked "what did the free safety do?" answers with something it can see.
 *
 * It also makes the pre-snap and post-snap answers independent BY
 * CONSTRUCTION. One-high with a blitzing safety is a one-high SHELL and a
 * Cover 0 COVERAGE, and both are true at once. That is precisely the case a
 * single holistic label cannot express.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Where a defender is standing before the snap. */
export const DEFENDER_ALIGNMENTS = [
  'on_line_outside_shade',
  'on_line_head_up',
  'on_line_inside_shade',
  'off_ball_box',
  'walked_up_edge',
  'over_slot',
  'press_wide',
  'off_wide',
  'deep_middle',
  'deep_half',
  'deep_third',
  'not_visible',
] as const
export type DefenderAlignment = (typeof DEFENDER_ALIGNMENTS)[number]

/**
 * What he did after it. `blitzed_from_depth` is the one that earned this whole
 * rewrite — a defensive back or deep safety who rushed, which removes help
 * that the pre-snap picture promised.
 */
export const DEFENDER_ACTIONS = [
  'rushed_passer',
  'blitzed_from_depth',
  'man_coverage',
  'zone_deep',
  'zone_underneath',
  'spy_quarterback',
  'run_fit',
  'chased_ball',
  'not_visible',
] as const
export type DefenderAction = (typeof DEFENDER_ACTIONS)[number]

export interface DefenderRow {
  /** A DEFENSIVE_POSITIONS id. */
  position: string
  alignment?: DefenderAlignment | null
  /** Yards off the line of scrimmage, when judgeable against the yard lines. */
  depth_yards?: number | null
  /** Which side of the formation he lined up on, from the OFFENCE's view. */
  side?: 'field' | 'boundary' | 'middle' | 'not_visible' | null
  action?: DefenderAction | null
  /** On man coverage, the OFFENSIVE position he carried. Null if unclear. */
  covering?: string | null
  note?: string | null
}

const DEEP_ALIGNMENTS: readonly string[] = ['deep_middle', 'deep_half', 'deep_third']
const RUSH_ACTIONS: readonly string[] = ['rushed_passer', 'blitzed_from_depth']
const SAFETY_POSITIONS: readonly string[] = ['fs', 'ss']

/** Yards off the ball at which an aligned defender counts as a deep safety. */
export const DEEP_SAFETY_DEPTH = 10

/**
 * The pre-snap shell, COUNTED rather than asked for.
 *
 * Counts SAFETIES aligned deep, not every deep defender: corners playing a
 * deep third are three-deep zone players, not a three-high shell, and counting
 * them turns every Cover 3 into `three_high`. A walked-up or rolled-down
 * safety is not deep and is not counted, which is the distinction that makes
 * a zero-high look readable at all.
 */
export function deriveShell(defenders: DefenderRow[]): CoverageShell {
  const visible = defenders.filter((d) => d.alignment && d.alignment !== 'not_visible')
  if (!visible.length) return 'not_visible'

  const deepSafeties = visible.filter((d) => {
    if (!SAFETY_POSITIONS.includes(d.position)) return false
    if (d.alignment && DEEP_ALIGNMENTS.includes(d.alignment)) return true
    return typeof d.depth_yards === 'number' && d.depth_yards >= DEEP_SAFETY_DEPTH
  }).length

  if (deepSafeties >= 3) return 'three_high'
  if (deepSafeties === 2) return 'two_high'
  if (deepSafeties === 1) return 'one_high'

  // Zero deep safeties is only meaningful if we actually SAW the safeties. A
  // clip where no safety was charted at all is a missing read, not a zero-high
  // shell — reporting the second would invent an aggressive call out of an
  // absent one.
  const anySafetyCharted = visible.some((d) => SAFETY_POSITIONS.includes(d.position))
  return anySafetyCharted ? 'zero_high' : 'not_visible'
}

export interface DerivedCoverage {
  coverage: Coverage
  /** Deep zone defenders left after the snap — the "help" a QB is looking for. */
  deepHelp: number
  manDefenders: number
  rushers: number
  /** True when a defender who aligned deep ended up rushing. */
  safetyBlitzed: boolean
}

/**
 * The coverage, DERIVED from what the eleven did.
 *
 * The rules are the coach's own: man with no deep help is Cover 0; man with
 * one deep safety reading the quarterback is Cover 1. Everything else follows
 * the same shape — count who is deep in zone, count who is in man, and name
 * the structure those two numbers describe.
 *
 * It refuses rather than guesses. Fewer than three defenders charted in
 * coverage is not enough of a picture to name a coverage from, whatever the
 * few say, because the difference between Cover 0 and Cover 1 is the presence
 * of ONE player and a partial chart cannot establish an absence.
 */
export function deriveCoverage(defenders: DefenderRow[]): DerivedCoverage {
  const acted = defenders.filter((d) => d.action && d.action !== 'not_visible')

  const deepHelp = acted.filter((d) => d.action === 'zone_deep').length
  const manDefenders = acted.filter((d) => d.action === 'man_coverage').length
  const underneathZone = acted.filter((d) => d.action === 'zone_underneath').length
  const rushers = acted.filter((d) => RUSH_ACTIONS.includes(d.action as string)).length
  const safetyBlitzed = acted.some(
    (d) =>
      d.action === 'blitzed_from_depth' ||
      (RUSH_ACTIONS.includes(d.action as string) && SAFETY_POSITIONS.includes(d.position))
  )

  const inCoverage = manDefenders + deepHelp + underneathZone
  const base = { deepHelp, manDefenders, rushers, safetyBlitzed }

  // An absence cannot be established from a handful of players.
  if (inCoverage < 3) return { ...base, coverage: 'not_determinable' }

  const mostlyMan = manDefenders >= 3 && manDefenders > underneathZone

  if (mostlyMan) {
    if (deepHelp === 0) return { ...base, coverage: 'cover_0' }
    if (deepHelp === 1) return { ...base, coverage: 'cover_1' }
    if (deepHelp === 2) return { ...base, coverage: 'cover_2_man' }
    return { ...base, coverage: 'man_unknown' }
  }

  if (underneathZone >= 2) {
    if (deepHelp === 4) return { ...base, coverage: 'cover_4_quarters' }
    if (deepHelp === 3) return { ...base, coverage: 'cover_3' }
    if (deepHelp === 2) return { ...base, coverage: 'cover_2' }
    return { ...base, coverage: 'zone_unknown' }
  }

  if (manDefenders > 0 && underneathZone > 0) return { ...base, coverage: 'not_determinable' }
  return { ...base, coverage: 'not_determinable' }
}

/**
 * What the safeties did, derived. Kept consistent with `deriveCoverage` so a
 * blitzing safety cannot be reported as a rotation on one line and as extra
 * pressure on another without the two agreeing.
 */
export function deriveSafetyRotation(defenders: DefenderRow[]): SafetyRotation {
  const safeties = defenders.filter(
    (d) => SAFETY_POSITIONS.includes(d.position) && d.action && d.action !== 'not_visible'
  )
  if (!safeties.length) return 'not_visible'

  if (safeties.some((d) => RUSH_ACTIONS.includes(d.action as string))) return 'safety_blitzed'

  // Rotation is a CHANGE, so it needs both ends. Reading it from where the
  // safeties finished alone called a single-high safety who never moved a
  // "rotation to the middle" — he was already there. What a quarterback needs
  // is whether the picture he saw pre-snap survived the snap.
  const alignedDeep = (d: DefenderRow) =>
    (d.alignment && DEEP_ALIGNMENTS.includes(d.alignment)) ||
    (typeof d.depth_yards === 'number' && d.depth_yards >= DEEP_SAFETY_DEPTH)

  const deepBefore = safeties.filter(alignedDeep).length
  const deepAfter = safeties.filter((d) => d.action === 'zone_deep').length

  if (deepBefore >= 2) {
    if (deepAfter >= 2) return 'stayed_two_high'
    if (deepAfter === 1) return 'rotated_to_middle'
    return 'both_came_down'
  }
  if (deepBefore === 1) {
    return deepAfter >= 1 ? 'no_rotation_single_high' : 'single_high_came_down'
  }
  return 'no_deep_help'
}

/** Rushers, counted from the chart rather than asked for as a category. */
export function derivePressureLook(defenders: DefenderRow[]): PressureLook {
  const acted = defenders.filter((d) => d.action && d.action !== 'not_visible')
  if (!acted.length) return 'not_determinable'
  const rushers = acted.filter((d) => RUSH_ACTIONS.includes(d.action as string))
  const count = rushers.length
  if (!count) return 'not_determinable'
  if (count <= 3) return 'three_man'
  if (count === 4) return 'four_man'
  if (count === 5) {
    // Edge or interior describes where the EXTRA rusher came from, not whether
    // anyone rushed off the edge — a four-man front always has edge rushers,
    // so asking "did any rusher align outside?" returned edge every time.
    // The extra man is the one who was not a down lineman.
    const extra = rushers.filter(
      (d) =>
        d.action === 'blitzed_from_depth' ||
        (d.alignment != null && !d.alignment.startsWith('on_line'))
    )
    if (!extra.length) return 'five_man_interior'
    const fromEdge = extra.some(
      (d) => d.alignment === 'walked_up_edge' || d.alignment === 'on_line_outside_shade'
    )
    return fromEdge ? 'five_man_edge' : 'five_man_interior'
  }
  return 'six_plus'
}

export interface PresnapTell {
  kind: PresnapTellKind
  /** What was visible, concretely. "The field safety walked down to 8 yards." */
  observation: string
  /** What followed it, when the same clip shows it. Never a guess. */
  followed_by?: string | null
  confidence?: number | null
}

/**
 * One defensive snap, charted. A SCOUTIQ clip is usually one play, so a batch
 * of 76 clips produces up to 76 of these — which is what turns "they play a
 * lot of two-high" into "two-high on 41 of 64 snaps".
 */
export interface DefensiveSnap {
  play_index?: number | null
  presnap_shell?: CoverageShell | null
  coverage_played?: Coverage | null
  safety_rotation?: SafetyRotation | null
  strength_declared?: StrengthDeclaration | null
  ball_position?: BallPosition | null
  field_side?: FieldSide | null
  /** Depth in yards of the safety to the wide side, when readable. */
  field_safety_depth?: number | null
  boundary_safety_depth?: number | null
  corner_leverage_field?: Leverage | null
  corner_leverage_boundary?: Leverage | null
  /** How many defenders were within about 5 yards of the ball pre-snap. */
  box_count?: number | null
  pressure_look?: PressureLook | null
  blitz_came_from?: string | null
  /** All eleven, when visible. The shell, coverage, rotation and pressure are
   *  DERIVED from these — see deriveCoverage. */
  defenders?: DefenderRow[] | null
  presnap_tells?: PresnapTell[] | null
  /** Which situation bucket this snap belongs to, from the play context. */
  situation?: string | null
  confidence?: number | null
  evidence_timestamps?: number[] | null
  note?: string | null
}

/**
 * Coerces a raw snap onto the vocabularies above.
 *
 * The response schema constrains these to enums, so an off-list value should
 * not arrive — but "should not" is not a guarantee worth a Gemini call. The
 * alternative designs are both worse: typing the parser with `z.enum` REJECTS
 * the whole analysis over one stray field, throwing away a clip the coach paid
 * to have read; casting trusts the string and lets `"cover 3 maybe"` into a
 * rollup where it becomes its own coverage with its own percentage.
 *
 * So an unrecognised answer becomes the ABSTENTION for that field, which every
 * count here already excludes. An unreadable coverage and an unparseable one
 * are the same fact for a coach: nobody knows what they played.
 */
function onto<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback
}

function finiteOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

function normalizeDefender(raw: Record<string, unknown>): DefenderRow | null {
  const position = typeof raw.position === 'string' ? raw.position : null
  // A row with no position cannot be counted, grouped or shown to a coach.
  if (!position) return null
  return {
    position,
    alignment: onto(raw.alignment, DEFENDER_ALIGNMENTS, 'not_visible'),
    depth_yards: finiteOrNull(raw.depth_yards),
    side: onto(raw.side, ['field', 'boundary', 'middle', 'not_visible'] as const, 'not_visible'),
    action: onto(raw.action, DEFENDER_ACTIONS, 'not_visible'),
    covering: typeof raw.covering === 'string' ? raw.covering : null,
    note: typeof raw.note === 'string' ? raw.note : null,
  }
}

export function normalizeDefensiveSnap(raw: Record<string, unknown>): DefensiveSnap {
  const tells = Array.isArray(raw.presnap_tells) ? raw.presnap_tells : []
  const defenders = (Array.isArray(raw.defenders) ? raw.defenders : [])
    .map((d) => normalizeDefender(d as Record<string, unknown>))
    .filter((d): d is DefenderRow => d !== null)

  // DERIVED from the eleven where they were charted, taken from the model's
  // own label only where they were not. A defence's coverage is what its
  // players did; asking for the name and trusting it is how a one-high shell
  // with a blitzing free safety got reported as two-high with no coverage at
  // all — the read that started this rewrite.
  const charted = defenders.length >= 3
  const derived = charted ? deriveCoverage(defenders) : null

  return {
    defenders,
    presnap_shell: charted
      ? deriveShell(defenders)
      : onto(raw.presnap_shell, COVERAGE_SHELLS, 'not_visible'),
    coverage_played: derived
      ? derived.coverage
      : onto(raw.coverage_played, COVERAGES, 'not_determinable'),
    safety_rotation: charted
      ? deriveSafetyRotation(defenders)
      : onto(raw.safety_rotation, SAFETY_ROTATIONS, 'not_visible'),
    strength_declared: onto(raw.strength_declared, STRENGTH_DECLARATIONS, 'not_determinable'),
    ball_position: onto(raw.ball_position, BALL_POSITIONS, 'not_determinable'),
    field_side: onto(raw.field_side, FIELD_SIDES, 'not_determinable'),
    field_safety_depth: finiteOrNull(raw.field_safety_depth),
    boundary_safety_depth: finiteOrNull(raw.boundary_safety_depth),
    corner_leverage_field: onto(raw.corner_leverage_field, LEVERAGES, 'not_visible'),
    corner_leverage_boundary: onto(raw.corner_leverage_boundary, LEVERAGES, 'not_visible'),
    box_count: finiteOrNull(raw.box_count),
    pressure_look: charted
      ? derivePressureLook(defenders)
      : onto(raw.pressure_look, PRESSURE_LOOKS, 'not_determinable'),
    blitz_came_from: typeof raw.blitz_came_from === 'string' ? raw.blitz_came_from : null,
    presnap_tells: (tells as Record<string, unknown>[])
      // A tell whose KIND is unrecognised is dropped rather than bucketed: the
      // kind is what the rollup groups by, so a stray one would open a group of
      // its own and read as a distinct tell the defence does not have.
      .filter((t) => typeof t?.observation === 'string' && (PRESNAP_TELL_KINDS as readonly string[]).includes(t?.kind as string))
      .map((t) => ({
        kind: t.kind as PresnapTellKind,
        observation: t.observation as string,
        followed_by: typeof t.followed_by === 'string' ? t.followed_by : null,
        confidence: finiteOrNull(t.confidence),
      })),
    confidence: finiteOrNull(raw.confidence),
    evidence_timestamps: Array.isArray(raw.evidence_timestamps)
      ? (raw.evidence_timestamps as unknown[]).filter((t): t is number => typeof t === 'number')
      : [],
    note: typeof raw.note === 'string' ? raw.note : null,
  }
}

/**
 * The prompt fragment. Deliberately closed questions with a stated preference
 * for abstaining — the measured lesson from StatsIQ is that a short prompt
 * asking answerable questions beats a long one asking for analysis, and that
 * the expensive failure is a confident wrong answer rather than a missing one.
 */
export function buildDefensiveStructurePrompt(opponentLabel: string): string {
  return `
=== DEFENSIVE STRUCTURE — only on plays where ${opponentLabel} is on DEFENSE ===
This is what a quarterback and a coordinator plan against, so it is charted per snap rather
than described. Answer only from what is visible. Every question below has a "not visible"
answer and using it is a correct answer — the camera follows the ball, so the secondary is
often out of frame, and a guessed coverage becomes a game plan built on fiction.

=== CHART ALL ELEVEN. THE COVERAGE IS COMPUTED FROM THEM, NOT NAMED BY YOU ===
Do NOT try to name the coverage. Report what each defender you can see DID, and the app works
out the coverage from the eleven. This exists because a defence's coverage IS its players'
actions: on the one snap whose truth we know, the defence aligned ONE-HIGH and the free safety
BLITZED — so the shell was one-high and the coverage played was Cover 0, both true at once. No
single label can say that, and a read that reached for one reported neither.

defenders — one entry per defensive player you can see. Aim for all eleven; report the ones you
can actually see and leave the rest out.
  position  — the position id from the vocabulary above (cb_left, fs, lb_middle, de_right, ...).
  alignment — where he STOOD before the snap:
              on_line_outside_shade / on_line_head_up / on_line_inside_shade — hand down or
                standing on the line of scrimmage, shaded outside, over, or inside his man
              off_ball_box       — linebacker depth, inside the box
              walked_up_edge     — a linebacker or safety who walked onto the line
              over_slot          — apex, between a slot receiver and the box
              press_wide / off_wide — a corner on a wide receiver, up on him or backed off
              deep_middle        — alone in the middle of the field, deep
              deep_half / deep_third — deep and responsible for a half or a third
  depth_yards — how far off the line he aligned, when you can judge it against the yard lines.
  side      — field (the wide side), boundary (the short side), or middle.
  action    — what he DID after the snap, and this is the load-bearing field:
              rushed_passer      — rushed from the line
              blitzed_from_depth — a linebacker, safety or corner who rushed from off the line.
                                   THIS IS THE ONE PEOPLE MISS. A deep safety who comes on a
                                   blitz takes the help away with him, and the difference
                                   between Cover 1 and Cover 0 is exactly that one player.
              man_coverage       — turned and ran with one receiver, eyes on that man
              zone_deep          — dropped deep and stayed there, eyes on the quarterback
              zone_underneath    — dropped to a short spot, eyes on the quarterback
              spy_quarterback    — mirrored the quarterback rather than a receiver
              run_fit            — filled a gap against the run
              chased_ball        — pursued the ball carrier, assignment not readable
  covering  — on man_coverage, the OFFENSIVE position he carried (wr_left, te_right, rb, ...).
  note      — anything a coach would want, in a few words.

ON A RUNNING PLAY, NOBODY COVERS ANYBODY. Everyone converts to a run fit within a step, so
man_coverage and zone_deep will be rare or absent and the played coverage is genuinely not
determinable — that is the right answer, not a failure. What IS readable on a run is the
ALIGNMENT: where every defender stood at the snap, and above all how many safeties were deep and
how deep each one was. Chart the alignment with the same care on a run as on a pass. It is the
only record of what the defence CALLED, and a coach scouting a defence needs that whether or not
the ball went in the air.

COVERAGE AND PRESSURE ARE TWO SEPARATE OBSERVATIONS, and charting the eleven is how that stays
true. Cover 0 and Cover 1 usually come with extra rushers, but that is
a CORRELATION, not a definition. Never adjust one player's action so the group fits a coverage
you have in mind, and never reason "the rush was only four, so nobody blitzed from depth".
Each defender's action is its own observation. You are not naming a coverage; you are
reporting what eleven people did.

READ EVERY POSITION BEFORE YOU FINISH: the deep middle, the corners, the linebackers, and anyone
who left coverage to blitz. If two of those pictures contradict each other, say so in the notes
and leave the players you could not resolve out, rather than averaging them into a defence
nobody played.

HOW TO WATCH IT, because this is a lot to ask of one viewing:
1. Freeze on the snap. Place everyone you can see: line, linebackers, corners, safeties.
2. Find the safeties FIRST and say how deep each one is. Deep and alone in the middle is a
   one-high shell; two of them split is two-high; none deep is zero-high. A safety walked down
   over a slot or into the box is NOT deep.
3. Run it forward and watch those same safeties. Did one rush? Did one drop and stay deep with
   his eyes on the quarterback? Did one turn and run with a receiver?
4. Then the corners: turn and run (man), or open to the quarterback and settle (zone)?
5. Then the linebackers: carry a man, drop to a spot, rush, or fill a gap?
6. Anyone you could not see, leave out. A missing player is fine. An invented one is not.

presnap_shell, coverage_played, safety_rotation and pressure_look are COMPUTED from the
defenders you chart. Fill them in as a fallback only when you could see too few players to chart
(under three) — and if you do, they are a guess and should usually be the "not visible" answer.

strength_declared — which side the defence SET to: the tight end, the wide side, the boundary,
  trips, or balanced. This is where they put the extra defender, not where the offence is heavy.

ball_position and field_side — which hash the ball is on, and which side is therefore the WIDE
  side, from the OFFENCE's perspective. With the ball on a hash the two sides are different
  widths and how a defence treats each is a tendency.

field_safety_depth / boundary_safety_depth — how deep each safety is aligned, in yards, when
  you can judge it against the yard lines. Null rather than a guess.

corner_leverage_field / corner_leverage_boundary — inside, outside or head_up on the receiver.

box_count — defenders within about 5 yards of the ball before the snap.

pressure_look — how many rushed and from where, including showed_pressure_bailed when they
  walked up and dropped out. Count the rushers. Do not adjust this to fit the coverage you
  named, and do not adjust the coverage to fit this.

presnap_tells — the things a quarterback could LOOK AT at the line. Each one is an observation
  ("the field safety walked down to 8 yards", "the boundary corner pressed only when the back
  was to his side"), optionally what followed it on THIS clip, and a confidence. Report the
  observation, not a slogan — "they tip their coverage" is not a tell, "the strong safety
  cheats inside the tight end on run downs" is.

Leave the whole block out on a play where ${opponentLabel} has the ball.`.trim()
}
