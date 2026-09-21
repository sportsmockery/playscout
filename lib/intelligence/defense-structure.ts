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

export function normalizeDefensiveSnap(raw: Record<string, unknown>): DefensiveSnap {
  const tells = Array.isArray(raw.presnap_tells) ? raw.presnap_tells : []
  return {
    presnap_shell: onto(raw.presnap_shell, COVERAGE_SHELLS, 'not_visible'),
    coverage_played: onto(raw.coverage_played, COVERAGES, 'not_determinable'),
    safety_rotation: onto(raw.safety_rotation, SAFETY_ROTATIONS, 'not_visible'),
    strength_declared: onto(raw.strength_declared, STRENGTH_DECLARATIONS, 'not_determinable'),
    ball_position: onto(raw.ball_position, BALL_POSITIONS, 'not_determinable'),
    field_side: onto(raw.field_side, FIELD_SIDES, 'not_determinable'),
    field_safety_depth: finiteOrNull(raw.field_safety_depth),
    boundary_safety_depth: finiteOrNull(raw.boundary_safety_depth),
    corner_leverage_field: onto(raw.corner_leverage_field, LEVERAGES, 'not_visible'),
    corner_leverage_boundary: onto(raw.corner_leverage_boundary, LEVERAGES, 'not_visible'),
    box_count: finiteOrNull(raw.box_count),
    pressure_look: onto(raw.pressure_look, PRESSURE_LOOKS, 'not_determinable'),
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

presnap_shell — how many deep safeties are showing BEFORE the snap. Count the defenders
  standing deeper than about 10 yards: two_high, one_high, zero_high, three_high. This is
  usually the MOST answerable question here, because the defence is still and in frame.

coverage_played — what they actually played after the snap. Read it off the defenders in
  coverage, using the checklist below. If you can tell man from zone but not which one, answer
  man_unknown or zone_unknown — that is a real answer, not a failure. Answer not_determinable
  whenever the coverage left the frame.

  COVERAGE AND PRESSURE ARE TWO SEPARATE OBSERVATIONS. Never infer either from the other.
  Cover 0 and Cover 1 often come with extra rushers — that is a CORRELATION, not a definition.
  A defence can play Cover 0 behind a four-man rush and it is still Cover 0; it can send six and
  play zone behind it. Count the rush for pressure_look; read the coverage off the coverage
  players. If you catch yourself reasoning "they only rushed four, so it cannot be Cover 0",
  stop — that inference is the error this rule exists to prevent.

  READ EVERY POSITION BEFORE YOU NAME A COVERAGE. A coverage is what eleven players are doing:
  - THE DEEP MIDDLE, and this is the whole Cover 1 / Cover 0 distinction. Is one safety alone
    back there READING THE QUARTERBACK — square, eyes in the backfield, feet ready to break
    either way? That is Cover 1. Is there NO safety in the middle because he is carrying a
    receiver man-to-man? That is Cover 0. This is read off that safety's eyes and hips. It is
    never read off the rush count.
  - THE CORNERS. Did they turn and run with a receiver (man), or open to the quarterback and
    settle on a spot (zone)?
  - THE LINEBACKERS. Did one carry a back or tight end across the field (man), drop to a spot
    facing the quarterback (zone), or rush?
  - ANYONE WHO LEFT COVERAGE to blitz, and who picked up the man he left.
  If those pictures disagree with each other, answer not_determinable rather than averaging
  them into a coverage nobody played.

safety_rotation — what the safeties did between the snap and the throw or handoff. A defence
  that shows two-high and rotates to one-high is the single most useful thing to tell a
  quarterback, so look for it specifically.

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
