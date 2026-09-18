import {
  normalizeStatPosition,
  positionGroup,
  positionLabel,
  isDefensivePosition,
  isOffensivePosition,
  type StatPosition,
} from './positions'
import {
  resolvePlayerIdentity,
  scrubNumberFromNote,
  type RosterEntry,
  type IdentityOptions,
} from './player-grades'

/**
 * StatsIQ's arithmetic: raw observations off the film in, a box score out.
 *
 * The model is never asked for a stat line. It reports what it SAW on each
 * play — who did what, and how far the ball went — and every number a coach
 * reads is added up here. This is the same argument player-grades.ts makes
 * about grades, and it is stronger for statistics: a model asked for "rushing
 * yards: 84" produces a number that does not equal the sum of its own carries,
 * and a box score whose columns disagree with each other is worse than no box
 * score, because it looks authoritative.
 *
 * Three properties follow from counting here rather than there:
 *   1. The totals are reproducible — the same credits always add to the same
 *      line, across one clip or forty.
 *   2. Every number is traceable — each one is the sum of specific credits,
 *      each carrying the timestamp it was seen at.
 *   3. Yardage that could not actually be measured is VISIBLE as unmeasured
 *      rather than quietly estimated into the total. See YardsBasis.
 */

/** What one player did on one play. Each kind maps to exactly one tally rule. */
export const OFFENSIVE_STAT_KINDS = [
  'rush',
  'sack_taken',
  'pass_complete',
  'pass_incomplete',
  'pass_intercepted',
  'reception',
  'target',
  'fumble_lost',
] as const

export const DEFENSIVE_STAT_KINDS = [
  'tackle',
  'assisted_tackle',
  'interception',
  'forced_fumble',
  'mistake',
] as const

/**
 * A flag belongs to whichever of our units was on the field, so unlike every
 * other kind it does not imply a side — it takes the side of the play.
 */
export const SHARED_STAT_KINDS = ['penalty'] as const

export const STAT_KINDS = [
  ...OFFENSIVE_STAT_KINDS,
  ...DEFENSIVE_STAT_KINDS,
  ...SHARED_STAT_KINDS,
] as const
export type StatKind = (typeof STAT_KINDS)[number]

export function sideOfStat(stat: string): 'offense' | 'defense' | null {
  if ((OFFENSIVE_STAT_KINDS as readonly string[]).includes(stat)) return 'offense'
  if ((DEFENSIVE_STAT_KINDS as readonly string[]).includes(stat)) return 'defense'
  return null
}

/** The fouls a youth-through-varsity crew actually writes down. */
export const PENALTY_TYPES = [
  'false_start', 'offside', 'encroachment', 'neutral_zone_infraction', 'delay_of_game',
  'illegal_formation', 'illegal_motion', 'illegal_shift', 'illegal_procedure',
  'substitution_infraction', 'too_many_men',
  'holding', 'illegal_block', 'block_in_the_back', 'clipping', 'chop_block',
  'illegal_use_of_hands', 'ineligible_downfield', 'illegal_forward_pass',
  'pass_interference', 'illegal_contact',
  'facemask', 'horse_collar', 'roughing_the_passer', 'roughing_the_kicker',
  'targeting', 'personal_foul', 'unsportsmanlike_conduct',
  'other',
] as const
export type PenaltyType = (typeof PENALTY_TYPES)[number]

/** What the other team did with the flag — which decides whether it counts. */
export const PENALTY_ENFORCEMENTS = ['accepted', 'declined', 'offsetting', 'unclear'] as const
export type PenaltyEnforcement = (typeof PENALTY_ENFORCEMENTS)[number]

/**
 * When the foul happened, which is what decides whether the play it touched
 * still produced statistics.
 */
export const PENALTY_TIMINGS = ['pre_snap', 'during_play', 'dead_ball'] as const
export type PenaltyTiming = (typeof PENALTY_TIMINGS)[number]

/**
 * Where a yardage number came from. This is the field that keeps the box score
 * honest.
 *
 * Youth and high-school film has no yard-line graphic and often no legible
 * field markings at all. A model asked "how many yards?" will always answer,
 * and the answer will look exactly like a measured one. So yardage is only
 * counted when its basis is recorded:
 *
 *   coach_breakdown  — the staff tagged the gain on the play. Fact; wins.
 *   field_landmarks  — read off yard lines/hash marks visible in the clip.
 *   not_determinable — the film does not show enough to measure. Yards are
 *                      dropped and the play is counted as unmeasured, so
 *                      "7 carries, 22 yards" reads as "22 yards from the 4
 *                      carries we could measure" instead of a wrong total.
 */
export const YARDS_BASES = ['coach_breakdown', 'field_landmarks', 'not_determinable'] as const
export type YardsBasis = (typeof YARDS_BASES)[number]

/**
 * A credit can also carry yardage that was never measured at all because it
 * did not have to be: 10 for holding, 5 for offside. `rule_assessed` is not
 * offered to the model — a play's gain is never rule-assessed — so it exists
 * only on the credit, where it stops penalty yards from being thrown away on
 * film whose gains could not be measured.
 */
export const CREDIT_YARDS_BASES = [...YARDS_BASES, 'rule_assessed'] as const
export type CreditYardsBasis = (typeof CREDIT_YARDS_BASES)[number]

/** What the model reports for one player on one play, before any resolution. */
export interface RawStatCredit {
  stat: string
  position: string
  position_detail?: string | null
  role_on_play?: string | null
  yards?: number | null
  touchdown?: boolean | null
  mistake_category?: string | null
  penalty_type?: string | null
  jersey_number?: string | null
  jersey_number_frame?: number | null
  identification_confidence?: number | null
  /**
   * Set by the model when it knows something happened but cannot see who did
   * it. The credit is then parked as a question instead of being guessed —
   * see RESOLUTION_STATUSES.
   */
  unresolved?: boolean | null
  question?: string | null
  candidates?: string[] | null
  note?: string | null
  evidence_timestamps?: number[] | null
  evidence_frames?: number[] | null
}

/** What the model reports for one play. */
export interface RawStatPlay {
  play_index?: number | null
  possession?: string | null
  offensive_formation?: string | null
  defensive_front?: string | null
  formation_note?: string | null
  play_type?: string | null
  result?: string | null
  yards?: number | null
  yards_basis?: string | null
  yards_note?: string | null
  /** Which team was flagged, if either. */
  penalty_on?: string | null
  penalty_type?: string | null
  penalty_enforcement?: string | null
  penalty_timing?: string | null
  /** Yards the penalty assessed — a rules number, not a measurement. */
  penalty_yards?: number | null
  confidence?: number | null
  evidence_timestamps?: number[] | null
  evidence_frames?: number[] | null
  credits?: RawStatCredit[] | null
}

/**
 * Whether a credit is settled enough to be counted.
 *
 * `unresolved` is the one that matters: the play happened, the yardage is
 * usually known, and the only missing fact is who did it. It is excluded from
 * every total and surfaced as a question instead — a guessed carry a coach has
 * to find and fix later is worse than a number that says "waiting on you".
 */
export const RESOLUTION_STATUSES = ['confirmed', 'unresolved', 'coach_entered'] as const
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number]

export function countsTowardTotals(status: ResolutionStatus | undefined): boolean {
  return status !== 'unresolved'
}

/** A credit after identity resolution and normalization — the stored form. */
export interface StatCredit {
  playIndex: number
  side: 'offense' | 'defense'
  stat: StatKind
  positionId: StatPosition
  positionLabel: string
  positionDetail: string | null
  roleOnPlay: string | null
  yards: number | null
  yardsBasis: CreditYardsBasis
  touchdown: boolean
  mistakeCategory: string | null
  penaltyType: string | null
  playerId: string | null
  jerseyNumber: string | null
  /** True only when a roster existed and this number was on it. */
  numberVerified: boolean
  numberRejectedReason: string | null
  identifier: string
  identifiedBy: 'roster' | 'number' | 'position'
  note: string | null
  evidenceTimestamps: number[]
  evidenceFrames: number[]
  /** Defaults to 'confirmed' for credits charted before questions existed. */
  resolutionStatus?: ResolutionStatus
  /** What the model needs to know, in language a coach answers from memory. */
  question?: string | null
  /** The positions it was choosing between — the one-tap answers. */
  candidates?: string[] | null
}

export interface OffensiveStats {
  carries: number
  rush_yards: number
  rush_td: number
  pass_attempts: number
  pass_completions: number
  pass_yards: number
  pass_td: number
  interceptions_thrown: number
  targets: number
  receptions: number
  receiving_yards: number
  receiving_td: number
  fumbles_lost: number
}

export interface DefensiveStats {
  tackles: number
  assisted_tackles: number
  total_tackles: number
  interceptions: number
  forced_fumbles: number
  mistakes: number
}

/** Plays whose yardage the film could not measure, by stat family. */
export interface UnmeasuredCounts {
  rush: number
  pass: number
  receiving: number
}

export interface StatLine {
  key: string
  identifier: string
  positionId: StatPosition
  positionLabel: string
  /** Every position id this row was credited at, in order of first appearance. */
  positions: StatPosition[]
  side: 'offense' | 'defense'
  identifiedBy: 'roster' | 'number' | 'position'
  /** False on a number read off the film with no roster to check it against. */
  numberVerified: boolean
  playerId: string | null
  jerseyNumber: string | null
  /** Distinct plays this row was credited on — not snaps played. */
  playsCredited: number
  offense: OffensiveStats
  defense: DefensiveStats
  /** Accepted penalties charged to this row, and the yards they cost. */
  penalties: number
  penaltyYards: number
  unmeasured: UnmeasuredCounts
}

export interface TeamStatTotals {
  plays: number
  offensivePlays: number
  defensivePlays: number
  offense: OffensiveStats
  defense: DefensiveStats
  unmeasured: UnmeasuredCounts
  /** Accepted penalties against us, and the yards they cost. */
  penalties: number
  penaltyYards: number
  /**
   * Plays an accepted penalty wiped off the books. They produced no
   * statistics — which is why the play count and the carry count can
   * legitimately disagree, and why the sheet says so out loud.
   */
  nullifiedPlays: number
  /**
   * Stats the film could not attribute to a player, waiting on the coach.
   *
   * These DO count in the team figures above and do NOT appear on any player
   * line, because "unresolved" is a question about WHO, never about WHAT: the
   * snap happened, the yards happened, the touchdown happened, and only the
   * name is missing. Leaving them out of the team totals as well meant a
   * charted 55-yard touchdown showed up as a team with no carries — the sheet
   * disowning a play it had just described.
   */
  pendingQuestions: number
  /**
   * Distinct plays carrying at least one unattributed credit. The count of
   * plays the coach can put a name to, rather than of questions — one play can
   * hold several.
   */
  unattributedPlays: number
  /** Completions ÷ attempts, null when nothing was thrown. */
  completionPct: number | null
  /** Rush yards ÷ carries, over measured carries only. */
  yardsPerCarry: number | null
  totalYards: number
}

export interface StatTally {
  lines: StatLine[]
  team: TeamStatTotals
  credits: StatCredit[]
  /**
   * Where the film's own account of itself does not add up. Shown to the
   * coach rather than silently reconciled — a box score that quietly fixes
   * its own contradictions is a box score you cannot audit.
   */
  warnings: string[]
}

export function emptyOffense(): OffensiveStats {
  return {
    carries: 0, rush_yards: 0, rush_td: 0,
    pass_attempts: 0, pass_completions: 0, pass_yards: 0, pass_td: 0, interceptions_thrown: 0,
    targets: 0, receptions: 0, receiving_yards: 0, receiving_td: 0,
    fumbles_lost: 0,
  }
}

export function emptyDefense(): DefensiveStats {
  return { tackles: 0, assisted_tackles: 0, total_tackles: 0, interceptions: 0, forced_fumbles: 0, mistakes: 0 }
}

function emptyUnmeasured(): UnmeasuredCounts {
  return { rush: 0, pass: 0, receiving: 0 }
}

/** An empty accumulator — a real row identifies itself, the team's does not. */
function blankLine(): StatLine {
  return {
    key: 'unattributed',
    identifier: 'Unattributed',
    positionId: 'other_offense',
    positionLabel: 'Unattributed',
    positions: [],
    side: 'offense',
    identifiedBy: 'position',
    numberVerified: false,
    playerId: null,
    jerseyNumber: null,
    playsCredited: 0,
    offense: emptyOffense(),
    defense: emptyDefense(),
    penalties: 0,
    penaltyYards: 0,
    unmeasured: emptyUnmeasured(),
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toBasis(raw: unknown): YardsBasis {
  return (YARDS_BASES as readonly string[]).includes(raw as string)
    ? (raw as YardsBasis)
    : 'not_determinable'
}

/**
 * Did an accepted penalty wipe this play off the books?
 *
 * This is the rule that keeps a stat sheet honest about penalties, and it is
 * the one every hand-kept scorebook gets wrong: a play called back does not
 * produce statistics. The 40-yard touchdown run that came back on a hold is
 * not 40 yards, not a carry, and not a touchdown — it did not happen. Counting
 * it inflates a back's season by exactly the plays his line cost him.
 *
 * Timing is what separates the two cases, so the model reports when the foul
 * happened and the rule is applied here:
 *   pre_snap    — there was no play to begin with.
 *   during_play — the play is wiped.
 *   dead_ball   — the foul came after the whistle and is enforced on the NEXT
 *                 snap; the play it followed still counts in full.
 * Offsetting fouls replay the down, so nothing counts there either.
 */
export function playIsNullified(play: RawStatPlay): boolean {
  const enforcement = play.penalty_enforcement
  if (enforcement !== 'accepted' && enforcement !== 'offsetting') return false
  if (play.penalty_timing === 'dead_ball') return false
  return true
}

/**
 * Only an ACCEPTED penalty is charged in a box score. A declined flag cost the
 * team nothing and is not a team penalty; offsetting fouls cancel and the down
 * is replayed. Both are still recorded on the play itself, so the play log can
 * show a coach the flag they remember without it landing in the totals.
 */
function penaltyIsCharged(play: RawStatPlay): boolean {
  return play.penalty_enforcement === 'accepted' && play.penalty_on === 'us'
}

/**
 * A fallback question, so an abstention is never a dead end.
 *
 * If the model marks a credit unresolved but writes a vague question — or
 * none — the coach still gets something they can answer in one read. The
 * question is always about WHO, because that is the only field abstention
 * applies to: the play and the yardage were visible, the player was not.
 */
function defaultQuestion(stat: StatKind): string {
  switch (stat) {
    case 'rush':
    case 'sack_taken':
      return 'Who carried the ball on this play?'
    case 'pass_complete':
    case 'pass_incomplete':
    case 'pass_intercepted':
      return 'Who threw this pass?'
    case 'reception':
    case 'target':
      return 'Who was this pass thrown to?'
    case 'tackle':
    case 'assisted_tackle':
      return 'Who made this tackle?'
    case 'interception':
      return 'Who intercepted this pass?'
    case 'forced_fumble':
      return 'Who forced this fumble?'
    case 'penalty':
      return 'Who was flagged on this play?'
    default:
      return 'Which player should this go to?'
  }
}

export interface ResolveOptions extends IdentityOptions {
  /**
   * StatsIQ passes `allowUnverifiedNumbers: true` (inherited from
   * IdentityOptions): a number the camera actually showed is printed even with
   * no roster behind it, marked unverified, because a count is something the
   * coach who was at the game can check in a second.
   */
  roster?: RosterEntry[]
  /**
   * What the coach said their team was doing, used only when the model could
   * not tell from the film. Never overrides a possession the film showed.
   */
  declaredSide?: 'offense' | 'defense' | 'both' | 'unknown' | null
  /**
   * The gain the coaching staff recorded for this clip's play, when the clip
   * is a single tagged play. Treated as fact — see reconcile() below.
   */
  breakdownGain?: number | null
}

/**
 * Turns the model's per-play report into canonical credits.
 *
 * Three things happen here and nowhere else:
 *
 *  1. SIDE GATING. A stat is kept only if it belongs to the unit that was on
 *     the field for our team. On a play where we have the ball, a "tackle" can
 *     only have been made by the OPPONENT — crediting it to one of our
 *     positions would put an opponent's play in our box score, which is the
 *     same failure film-subject.ts exists to prevent one level up.
 *  2. IDENTITY. Every jersey number goes through the same gates RankerIQ uses
 *     (roster on file, frame cited, confidence, number exists). A number that
 *     fails is dropped and the credit is filed under its position, which is
 *     the normal and expected outcome on wide film.
 *  3. YARDAGE BASIS. Yards survive only with a basis that means something.
 */
export function resolveStatCredits(
  plays: RawStatPlay[] | null | undefined,
  opts: ResolveOptions = {}
): { credits: StatCredit[]; warnings: string[]; nullifiedPlays: number } {
  const credits: StatCredit[] = []
  const warnings: string[] = []
  const roster = opts.roster ?? []
  const declared =
    opts.declaredSide === 'offense' || opts.declaredSide === 'defense' ? opts.declaredSide : null

  let droppedOpponentCredits = 0
  let droppedUnclearPlays = 0
  let nullifiedPlays = 0

  ;(plays ?? []).forEach((play, i) => {
    const playIndex = num(play.play_index) ?? i + 1
    const rawPossession = (play.possession ?? '').toLowerCase()
    const possession =
      rawPossession === 'offense' || rawPossession === 'defense'
        ? (rawPossession as 'offense' | 'defense')
        : declared

    const playBasis = toBasis(play.yards_basis)
    const nullified = playIsNullified(play)
    const chargePenalty = penaltyIsCharged(play)

    if (!possession) {
      // Special teams and plays where the model could not tell which unit was
      // ours. Counting these would file a stat under a position on a unit we
      // cannot confirm was on the field.
      if ((play.credits ?? []).length) droppedUnclearPlays += 1
      return
    }

    if (nullified) nullifiedPlays += 1

    for (const raw of play.credits ?? []) {
      const stat = String(raw.stat ?? '') as StatKind
      const isPenalty = stat === 'penalty'
      // A flag belongs to whichever of our units was on the field, so it takes
      // the play's side rather than implying one.
      const statSide: 'offense' | 'defense' | null = isPenalty ? possession : sideOfStat(stat)
      if (!statSide) continue

      // A play called back produced no statistics — but the flag that called
      // it back is itself a statistic, and the only one that survives.
      if (nullified && !isPenalty) continue
      if (isPenalty && !chargePenalty) continue

      if (statSide !== possession) {
        droppedOpponentCredits += 1
        continue
      }

      const positionId = normalizeStatPosition(raw.position, statSide)
      // A position that belongs to the other unit is the same error one field
      // over — a "cb_left" credited on a play we were on offense for.
      const positionMatchesSide =
        statSide === 'offense' ? !isDefensivePosition(positionId) : !isOffensivePosition(positionId)
      const safePosition = positionMatchesSide
        ? positionId
        : normalizeStatPosition(null, statSide)

      const identity = resolvePlayerIdentity(
        {
          identifier: raw.position_detail || positionLabel(safePosition),
          position: positionLabel(safePosition),
          jersey_number: raw.jersey_number ?? null,
          jersey_number_frame: raw.jersey_number_frame ?? null,
          identification_confidence: raw.identification_confidence ?? null,
        },
        roster,
        {
          allowNumbers: opts.allowNumbers,
          // Defaulted here rather than left to the caller: this is StatsIQ's
          // rule about its own output, and a second caller that forgot the
          // flag would quietly revert to grading-strength identity.
          allowUnverifiedNumbers: opts.allowUnverifiedNumbers ?? true,
        }
      )

      const rejectedDigits = identity.numberRejectedReason
        ? String(raw.jersey_number ?? '').replace(/[^0-9]/g, '')
        : null
      const note = raw.note
        ? rejectedDigits
          ? scrubNumberFromNote(raw.note, String(Number(rejectedDigits)), positionLabel(safePosition))
          : raw.note
        : null

      // A credit may carry its own yardage basis via the play it belongs to;
      // there is one measurement per play, so the play's basis governs.
      //
      // Penalty yardage is the exception and is never gated: 10 for holding is
      // a rules number, not something read off the field, so it survives on a
      // play whose gain could not be measured at all.
      const yards = isPenalty
        ? num(raw.yards) ?? num(play.penalty_yards)
        : playBasis === 'not_determinable'
          ? null
          : num(raw.yards)

      credits.push({
        playIndex,
        side: statSide,
        stat,
        positionId: safePosition,
        positionLabel: positionLabel(safePosition),
        positionDetail: raw.position_detail?.trim() || null,
        roleOnPlay: raw.role_on_play?.trim() || null,
        yards,
        yardsBasis: isPenalty ? 'rule_assessed' : playBasis,
        touchdown: raw.touchdown === true,
        mistakeCategory: stat === 'mistake' ? raw.mistake_category ?? null : null,
        penaltyType: isPenalty ? raw.penalty_type ?? play.penalty_type ?? null : null,
        playerId: identity.playerId,
        jerseyNumber: identity.jerseyNumber,
        numberVerified: identity.jerseyNumber != null && roster.length > 0,
        numberRejectedReason: identity.numberRejectedReason,
        identifier: identity.jerseyNumber ? identity.identifier : positionLabel(safePosition),
        identifiedBy: identity.playerId ? 'roster' : identity.jerseyNumber ? 'number' : 'position',
        note,
        resolutionStatus: raw.unresolved === true ? 'unresolved' : 'confirmed',
        question: raw.unresolved === true ? raw.question?.trim() || defaultQuestion(stat) : null,
        candidates:
          raw.unresolved === true
            ? (raw.candidates ?? [])
                .map((c) => normalizeStatPosition(c, statSide))
                .filter((c, i, all) => all.indexOf(c) === i)
            : null,
        evidenceTimestamps: (raw.evidence_timestamps ?? []).filter((t) => num(t) != null),
        evidenceFrames: (raw.evidence_frames ?? []).filter((f) => num(f) != null),
      })
    }
  })

  if (droppedOpponentCredits) {
    warnings.push(
      `${droppedOpponentCredits} stat${droppedOpponentCredits === 1 ? '' : 's'} were reported for the unit that wasn't ours on that play and were not counted.`
    )
  }
  if (droppedUnclearPlays) {
    warnings.push(
      `${droppedUnclearPlays} play${droppedUnclearPlays === 1 ? '' : 's'} could not be assigned to our offense or defense, so nothing from ${droppedUnclearPlays === 1 ? 'it' : 'them'} was counted.`
    )
  }

  if (nullifiedPlays) {
    warnings.push(
      `${nullifiedPlays} play${nullifiedPlays === 1 ? ' was' : 's were'} called back by an accepted penalty and carr${nullifiedPlays === 1 ? 'ies' : 'y'} no stats — a run brought back on a hold is not a carry and not yards.`
    )
  }

  return { credits: reconcile(credits, opts.breakdownGain ?? null, warnings), warnings, nullifiedPlays }
}

/**
 * The coaching staff's own breakdown outranks the film read.
 *
 * When a clip is one tagged play and the staff recorded the gain, that number
 * is what the play gained — they were there, with a yard line to look at. The
 * model's estimate replaces it only when there is no tag. A disagreement is
 * reported rather than hidden, because a big one usually means the model was
 * watching a different play than the one that was tagged.
 */
function reconcile(credits: StatCredit[], breakdownGain: number | null, warnings: string[]): StatCredit[] {
  if (breakdownGain == null || !credits.length) return credits

  const playIndexes = new Set(credits.map((c) => c.playIndex))
  if (playIndexes.size !== 1) return credits // multi-play clip: no single gain to apply

  const YARD_BEARING: StatKind[] = ['rush', 'pass_complete', 'reception']
  const disagreed = credits.some(
    (c) =>
      YARD_BEARING.includes(c.stat) &&
      c.yards != null &&
      Math.abs(c.yards - breakdownGain) > 3
  )
  if (disagreed) {
    warnings.push(
      `The staff tagged this play as ${breakdownGain} yards, which is what was counted — the film read differed by more than 3 yards.`
    )
  }

  return credits.map((c) =>
    YARD_BEARING.includes(c.stat)
      ? { ...c, yards: breakdownGain, yardsBasis: 'coach_breakdown' as const }
      : c
  )
}

/**
 * Which stat line a credit belongs to: a matched roster player first, then a
 * verified jersey number, then the position.
 *
 * A position row can legitimately cover more than one player — two backs both
 * aligned at `rb` across a game — which is why StatLine carries identifiedBy
 * and the UI has to say so. It is still the right default: on film where no
 * number is legible, "Left Guard: 6 knockdowns" is true and useful, while a
 * guessed name is false and harmful.
 */
function lineKey(c: StatCredit): string {
  // The side is always part of the key: a box score has an offensive half and
  // a defensive half, and a two-way player — most of a youth roster — belongs
  // in both with different numbers, not in one row that adds carries to
  // tackles.
  if (c.playerId) return `player:${c.playerId}:${c.side}`
  if (c.jerseyNumber) return `jersey:${c.jerseyNumber}:${c.side}`
  return `position:${c.side}:${c.positionId}`
}

function positionKey(c: StatCredit): string {
  return `position:${c.side}:${c.positionId}`
}

/**
 * Throws out a jersey number that contradicts itself.
 *
 * A number nobody could check against a roster holds a row together only while
 * the plays agree about roughly where that player lines up. A back who also
 * takes a snap at wingback is one child; a number that appears at left tackle
 * on one play and split wide on the next is a misread of two different
 * children, and merging their stats is exactly the harm the number was
 * supposed to avoid.
 *
 * So an unverified number survives only while its credits stay inside one
 * position group. A roster-MATCHED number is exempt: there the roster is
 * ground truth, and a two-way kid really does play several spots.
 */
function abandonInconsistentNumbers(credits: StatCredit[]): {
  credits: StatCredit[]
  abandoned: string[]
} {
  const byNumber = new Map<string, StatCredit[]>()
  for (const c of credits) {
    if (!c.jerseyNumber || c.playerId || c.numberVerified) continue
    byNumber.set(c.jerseyNumber, [...(byNumber.get(c.jerseyNumber) ?? []), c])
  }

  const bad = new Set<string>()
  for (const [number, group] of byNumber) {
    const groups = new Set(group.map((c) => positionGroup(c.positionId)))
    if (groups.size > 1) bad.add(number)
  }
  if (!bad.size) return { credits, abandoned: [] }

  return {
    credits: credits.map((c) =>
      c.jerseyNumber && bad.has(c.jerseyNumber) && !c.playerId && !c.numberVerified
        ? {
            ...c,
            jerseyNumber: null,
            identifier: c.positionLabel,
            identifiedBy: 'position' as const,
            numberRejectedReason:
              c.numberRejectedReason ??
              'the same number was read at positions too far apart to be one player',
            note: c.note
              ? scrubNumberFromNote(c.note, c.jerseyNumber, c.positionLabel)
              : c.note,
          }
        : c
    ),
    abandoned: [...bad],
  }
}

/** Tally resolved credits into per-position lines and team totals. */
export function computeStatLines(rawCredits: StatCredit[], nullifiedPlays = 0): StatTally {
  const { credits, abandoned } = abandonInconsistentNumbers(rawCredits)

  // An unresolved credit is a question about WHO, not about WHAT. It stays in
  // `credits` so the UI can ask it, it never lands on a player's line — and it
  // still counts for the TEAM, because the play it describes happened.
  //
  // This distinction was missing at first, and the result was perverse: the
  // more honest the module got about attribution, the emptier the box score
  // became. An option team whose every carry is a coin flip between the
  // quarterback and the dive back would have read "0 carries, 0 yards, 12
  // questions" — a sheet denying the game took place. A press box does the
  // opposite: team rushing counts every carry, and an unattributed one simply
  // has no name beside it yet.
  const counted = credits.filter((c) => countsTowardTotals(c.resolutionStatus))
  const unattributedCredits = credits.filter((c) => !countsTowardTotals(c.resolutionStatus))
  const pendingQuestions = unattributedCredits.length

  const byKey = new Map<string, { line: StatLine; plays: Set<number> }>()
  const offensePlays = new Set<number>()
  const defensePlays = new Set<number>()

  for (const c of counted) {
    const key = c.jerseyNumber || c.playerId ? lineKey(c) : positionKey(c)
    let entry = byKey.get(key)
    if (!entry) {
      entry = {
        line: {
          ...blankLine(),
          key,
          identifier: c.identifier,
          positionId: c.positionId,
          positionLabel: c.positionLabel,
          side: c.side,
          identifiedBy: c.identifiedBy,
          numberVerified: c.numberVerified,
          playerId: c.playerId,
          jerseyNumber: c.jerseyNumber,
        },
        plays: new Set<number>(),
      }
      byKey.set(key, entry)
    }

    const { line, plays } = entry
    if (!line.positions.includes(c.positionId)) line.positions.push(c.positionId)
    plays.add(c.playIndex)
    ;(c.side === 'offense' ? offensePlays : defensePlays).add(c.playIndex)

    applyCredit(line, c)
  }

  const lines = [...byKey.values()].map(({ line, plays }) => ({
    ...line,
    playsCredited: plays.size,
  }))

  // One throwaway line holding everything nobody can be named for yet. It is
  // summed into the team totals and then discarded — it is never returned, so
  // no player row, rollup or season view can ever inherit an unattributed stat.
  const unattributed = blankLine()
  const unattributedPlays = new Set<number>()
  for (const c of unattributedCredits) {
    applyCredit(unattributed, c)
    unattributedPlays.add(c.playIndex)
    ;(c.side === 'offense' ? offensePlays : defensePlays).add(c.playIndex)
  }

  const team = {
    ...totalsFrom([...lines, unattributed], offensePlays.size, defensePlays.size, nullifiedPlays),
    pendingQuestions,
    unattributedPlays: unattributedPlays.size,
  }

  const warnings = consistencyWarnings(lines, team)
  for (const number of abandoned) {
    warnings.unshift(
      `#${number} was read at positions too far apart to be one player, so those stats were filed by position instead.`
    )
  }

  return { lines: sortLines(lines), team, credits, warnings }
}

/**
 * The tally rules, one per stat kind. Every number in the product traces to a
 * line in this function.
 */
function applyCredit(line: StatLine, c: StatCredit) {
  const o = line.offense
  const d = line.defense
  const measured = c.yards != null && c.yardsBasis !== 'not_determinable'

  switch (c.stat) {
    case 'rush':
      o.carries += 1
      if (measured) o.rush_yards += c.yards as number
      else line.unmeasured.rush += 1
      if (c.touchdown) o.rush_td += 1
      break

    case 'sack_taken':
      // NFHS and NCAA (unlike the NFL) charge sack yardage to the passer as a
      // rushing loss, and count the sack as a rushing attempt — not as a pass
      // attempt. Youth and high-school film is scored to that rule.
      o.carries += 1
      if (measured) o.rush_yards += Math.min(0, c.yards as number)
      else line.unmeasured.rush += 1
      break

    case 'pass_complete':
      o.pass_attempts += 1
      o.pass_completions += 1
      if (measured) o.pass_yards += c.yards as number
      else line.unmeasured.pass += 1
      if (c.touchdown) o.pass_td += 1
      break

    case 'pass_incomplete':
      o.pass_attempts += 1
      break

    case 'pass_intercepted':
      o.pass_attempts += 1
      o.interceptions_thrown += 1
      break

    case 'reception':
      o.targets += 1
      o.receptions += 1
      if (measured) o.receiving_yards += c.yards as number
      else line.unmeasured.receiving += 1
      if (c.touchdown) o.receiving_td += 1
      break

    case 'target':
      o.targets += 1
      break

    case 'fumble_lost':
      o.fumbles_lost += 1
      break

    case 'tackle':
      d.tackles += 1
      d.total_tackles += 1
      break

    case 'assisted_tackle':
      d.assisted_tackles += 1
      d.total_tackles += 1
      break

    case 'interception':
      d.interceptions += 1
      break

    case 'forced_fumble':
      d.forced_fumbles += 1
      break

    case 'mistake':
      d.mistakes += 1
      break

    case 'penalty':
      // Only accepted penalties reach here — see penaltyIsCharged. They sit
      // outside the offensive and defensive blocks because a penalty is not a
      // football play: it is charged to whichever unit was on the field, and a
      // guard's hold and a corner's pass interference belong in the same
      // column.
      line.penalties += 1
      if (c.yards != null) line.penaltyYards += Math.abs(c.yards)
      break
  }
}

function addOffense(a: OffensiveStats, b: OffensiveStats): OffensiveStats {
  return {
    carries: a.carries + b.carries,
    rush_yards: a.rush_yards + b.rush_yards,
    rush_td: a.rush_td + b.rush_td,
    pass_attempts: a.pass_attempts + b.pass_attempts,
    pass_completions: a.pass_completions + b.pass_completions,
    pass_yards: a.pass_yards + b.pass_yards,
    pass_td: a.pass_td + b.pass_td,
    interceptions_thrown: a.interceptions_thrown + b.interceptions_thrown,
    targets: a.targets + b.targets,
    receptions: a.receptions + b.receptions,
    receiving_yards: a.receiving_yards + b.receiving_yards,
    receiving_td: a.receiving_td + b.receiving_td,
    fumbles_lost: a.fumbles_lost + b.fumbles_lost,
  }
}

function addDefense(a: DefensiveStats, b: DefensiveStats): DefensiveStats {
  return {
    tackles: a.tackles + b.tackles,
    assisted_tackles: a.assisted_tackles + b.assisted_tackles,
    total_tackles: a.total_tackles + b.total_tackles,
    interceptions: a.interceptions + b.interceptions,
    forced_fumbles: a.forced_fumbles + b.forced_fumbles,
    mistakes: a.mistakes + b.mistakes,
  }
}

function totalsFrom(
  lines: StatLine[],
  offensivePlays: number,
  defensivePlays: number,
  nullifiedPlays: number
): Omit<TeamStatTotals, 'pendingQuestions' | 'unattributedPlays'> {
  const offense = lines.reduce((acc, l) => addOffense(acc, l.offense), emptyOffense())
  const defense = lines.reduce((acc, l) => addDefense(acc, l.defense), emptyDefense())
  const unmeasured = lines.reduce(
    (acc, l) => ({
      rush: acc.rush + l.unmeasured.rush,
      pass: acc.pass + l.unmeasured.pass,
      receiving: acc.receiving + l.unmeasured.receiving,
    }),
    emptyUnmeasured()
  )

  const measuredCarries = offense.carries - unmeasured.rush

  return {
    plays: offensivePlays + defensivePlays,
    offensivePlays,
    defensivePlays,
    offense,
    defense,
    unmeasured,
    penalties: lines.reduce((sum, l) => sum + l.penalties, 0),
    penaltyYards: lines.reduce((sum, l) => sum + l.penaltyYards, 0),
    nullifiedPlays,
    completionPct: offense.pass_attempts
      ? Math.round((offense.pass_completions / offense.pass_attempts) * 1000) / 10
      : null,
    yardsPerCarry: measuredCarries > 0 ? Math.round((offense.rush_yards / measuredCarries) * 10) / 10 : null,
    totalYards: offense.rush_yards + offense.pass_yards,
  }
}

/**
 * Cross-checks the box score against itself.
 *
 * Every one of these is a contradiction the film cannot actually contain: a
 * reception with no completion behind it means one of the two was invented or
 * one was missed. Surfacing them is what lets a coach decide whether to trust
 * the sheet, and what makes a systematically bad prompt visible instead of
 * plausible.
 */
export function consistencyWarnings(
  lines: StatLine[],
  team: Omit<TeamStatTotals, 'pendingQuestions' | 'unattributedPlays'> & {
    pendingQuestions?: number
    unattributedPlays?: number
  }
): string[] {
  const out: string[] = []
  const o = team.offense

  if (team.pendingQuestions) {
    const n = team.pendingQuestions
    out.unshift(
      `${n} stat${n === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} in the team totals but on nobody's line yet — the film showed the play, not who made it. Answer ${n === 1 ? 'it' : 'them'} below and ${n === 1 ? 'it moves' : 'they move'} onto a player.`
    )
  }

  if (o.receptions !== o.pass_completions) {
    out.push(
      `${o.pass_completions} completion${o.pass_completions === 1 ? '' : 's'} but ${o.receptions} reception${o.receptions === 1 ? '' : 's'} — a catch is missing a thrower or the other way round.`
    )
  }
  if (o.receiving_yards !== o.pass_yards) {
    out.push(
      `Receiving yards (${o.receiving_yards}) and passing yards (${o.pass_yards}) should match and don't.`
    )
  }
  if (o.receiving_td !== o.pass_td) {
    out.push(`Passing touchdowns (${o.pass_td}) and receiving touchdowns (${o.receiving_td}) should match and don't.`)
  }
  if (o.pass_completions > o.pass_attempts) {
    out.push(`More completions (${o.pass_completions}) than attempts (${o.pass_attempts}).`)
  }
  if (o.receptions > o.targets) {
    out.push(`More receptions (${o.receptions}) than targets (${o.targets}).`)
  }

  const unmeasured = team.unmeasured.rush + team.unmeasured.pass + team.unmeasured.receiving
  if (unmeasured > 0) {
    out.push(
      `${unmeasured} play${unmeasured === 1 ? '' : 's'} had no measurable yardage on this film, so yards are counted only from the plays that did. Attach your breakdown on the film's Plays screen to fill those in.`
    )
  }

  const unverified = lines.filter((l) => l.jerseyNumber && !l.numberVerified).length
  if (unverified) {
    out.push(
      `${unverified} line${unverified === 1 ? '' : 's'} use a jersey number read off the film with no roster to check it against. Add your roster and these get names — and a misread number gets caught.`
    )
  }

  const byPosition = lines.filter((l) => l.identifiedBy === 'position').length
  if (byPosition && byPosition === lines.length) {
    out.push(
      'Every line is by position rather than by player — no jersey number was legible on this film.'
    )
  }

  return out
}

/** Offense first, then by how much of the ball they touched; defense by tackles. */
function sortLines(lines: StatLine[]): StatLine[] {
  const touches = (l: StatLine) =>
    l.side === 'offense'
      ? l.offense.carries + l.offense.pass_attempts + l.offense.targets
      : l.defense.total_tackles + l.defense.interceptions + l.defense.forced_fumbles

  return [...lines].sort((a, b) => {
    if (a.side !== b.side) return a.side === 'offense' ? -1 : 1
    return touches(b) - touches(a) || a.identifier.localeCompare(b.identifier)
  })
}

/**
 * One clip's plays → the whole tally. The entry point analyze-position calls.
 */
export function tallyStatPlays(
  plays: RawStatPlay[] | null | undefined,
  opts: ResolveOptions = {}
): StatTally {
  const { credits, warnings, nullifiedPlays } = resolveStatCredits(plays, opts)
  const tally = computeStatLines(credits, nullifiedPlays)
  return { ...tally, warnings: [...warnings, ...tally.warnings] }
}

/**
 * A whole batch → one box score, by re-running the identical tally over every
 * clip's stored credits.
 *
 * A game is what a coach actually wants a box score for, and one clip is one
 * play. Re-tallying the CREDITS rather than adding up per-clip lines is what
 * makes the season total and the single-play total the same arithmetic — a
 * second summation path would be a second set of rounding and merging rules to
 * disagree with the first.
 */
export function aggregateStatCredits(
  clipCredits: StatCredit[][],
  /**
   * Plays each clip lost to an accepted penalty. Carried in rather than
   * recomputed because a nullified play leaves no credits behind to count —
   * that is the whole point of it.
   */
  nullifiedPerClip: number[] = []
): StatTally {
  // Play indexes restart at 1 in every clip; offset them so "plays counted"
  // isn't one clip's worth for the whole batch.
  let offset = 0
  const all: StatCredit[] = []
  for (const credits of clipCredits) {
    const max = credits.reduce((m, c) => Math.max(m, c.playIndex), 0)
    for (const c of credits) all.push({ ...c, playIndex: c.playIndex + offset })
    offset += max
  }
  return computeStatLines(all, nullifiedPerClip.reduce((sum, n) => sum + (n || 0), 0))
}
