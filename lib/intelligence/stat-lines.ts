import {
  normalizeStatPosition,
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

export const STAT_KINDS = [...OFFENSIVE_STAT_KINDS, ...DEFENSIVE_STAT_KINDS] as const
export type StatKind = (typeof STAT_KINDS)[number]

export function sideOfStat(stat: string): 'offense' | 'defense' | null {
  if ((OFFENSIVE_STAT_KINDS as readonly string[]).includes(stat)) return 'offense'
  if ((DEFENSIVE_STAT_KINDS as readonly string[]).includes(stat)) return 'defense'
  return null
}

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

/** What the model reports for one player on one play, before any resolution. */
export interface RawStatCredit {
  stat: string
  position: string
  position_detail?: string | null
  role_on_play?: string | null
  yards?: number | null
  touchdown?: boolean | null
  mistake_category?: string | null
  jersey_number?: string | null
  jersey_number_frame?: number | null
  identification_confidence?: number | null
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
  confidence?: number | null
  evidence_timestamps?: number[] | null
  evidence_frames?: number[] | null
  credits?: RawStatCredit[] | null
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
  yardsBasis: YardsBasis
  touchdown: boolean
  mistakeCategory: string | null
  playerId: string | null
  jerseyNumber: string | null
  numberRejectedReason: string | null
  identifier: string
  identifiedBy: 'roster' | 'number' | 'position'
  note: string | null
  evidenceTimestamps: number[]
  evidenceFrames: number[]
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
  playerId: string | null
  jerseyNumber: string | null
  /** Distinct plays this row was credited on — not snaps played. */
  playsCredited: number
  offense: OffensiveStats
  defense: DefensiveStats
  unmeasured: UnmeasuredCounts
}

export interface TeamStatTotals {
  plays: number
  offensivePlays: number
  defensivePlays: number
  offense: OffensiveStats
  defense: DefensiveStats
  unmeasured: UnmeasuredCounts
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

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toBasis(raw: unknown): YardsBasis {
  return (YARDS_BASES as readonly string[]).includes(raw as string)
    ? (raw as YardsBasis)
    : 'not_determinable'
}

export interface ResolveOptions extends IdentityOptions {
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
): { credits: StatCredit[]; warnings: string[] } {
  const credits: StatCredit[] = []
  const warnings: string[] = []
  const roster = opts.roster ?? []
  const declared =
    opts.declaredSide === 'offense' || opts.declaredSide === 'defense' ? opts.declaredSide : null

  let droppedOpponentCredits = 0
  let droppedUnclearPlays = 0

  ;(plays ?? []).forEach((play, i) => {
    const playIndex = num(play.play_index) ?? i + 1
    const rawPossession = (play.possession ?? '').toLowerCase()
    const possession =
      rawPossession === 'offense' || rawPossession === 'defense'
        ? (rawPossession as 'offense' | 'defense')
        : declared

    const playBasis = toBasis(play.yards_basis)

    if (!possession) {
      // Special teams and plays where the model could not tell which unit was
      // ours. Counting these would file a stat under a position on a unit we
      // cannot confirm was on the field.
      if ((play.credits ?? []).length) droppedUnclearPlays += 1
      return
    }

    for (const raw of play.credits ?? []) {
      const stat = String(raw.stat ?? '') as StatKind
      const statSide = sideOfStat(stat)
      if (!statSide) continue

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
        { allowNumbers: opts.allowNumbers }
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
      const yards = playBasis === 'not_determinable' ? null : num(raw.yards)

      credits.push({
        playIndex,
        side: statSide,
        stat,
        positionId: safePosition,
        positionLabel: positionLabel(safePosition),
        positionDetail: raw.position_detail?.trim() || null,
        roleOnPlay: raw.role_on_play?.trim() || null,
        yards,
        yardsBasis: playBasis,
        touchdown: raw.touchdown === true,
        mistakeCategory: stat === 'mistake' ? raw.mistake_category ?? null : null,
        playerId: identity.playerId,
        jerseyNumber: identity.jerseyNumber,
        numberRejectedReason: identity.numberRejectedReason,
        identifier: identity.jerseyNumber ? identity.identifier : positionLabel(safePosition),
        identifiedBy: identity.playerId ? 'roster' : identity.jerseyNumber ? 'number' : 'position',
        note,
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

  return { credits: reconcile(credits, opts.breakdownGain ?? null, warnings), warnings }
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
  if (c.playerId) return `player:${c.playerId}`
  if (c.jerseyNumber) return `jersey:${c.jerseyNumber}`
  return `position:${c.side}:${c.positionId}`
}

/** Tally resolved credits into per-position lines and team totals. */
export function computeStatLines(credits: StatCredit[]): StatTally {
  const byKey = new Map<string, { line: StatLine; plays: Set<number> }>()
  const offensePlays = new Set<number>()
  const defensePlays = new Set<number>()

  for (const c of credits) {
    const key = lineKey(c)
    let entry = byKey.get(key)
    if (!entry) {
      entry = {
        line: {
          key,
          identifier: c.identifier,
          positionId: c.positionId,
          positionLabel: c.positionLabel,
          positions: [],
          side: c.side,
          identifiedBy: c.identifiedBy,
          playerId: c.playerId,
          jerseyNumber: c.jerseyNumber,
          playsCredited: 0,
          offense: emptyOffense(),
          defense: emptyDefense(),
          unmeasured: emptyUnmeasured(),
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

  const team = totalsFrom(lines, offensePlays.size, defensePlays.size)

  return {
    lines: sortLines(lines),
    team,
    credits,
    warnings: consistencyWarnings(lines, team),
  }
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

function totalsFrom(lines: StatLine[], offensivePlays: number, defensivePlays: number): TeamStatTotals {
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
export function consistencyWarnings(lines: StatLine[], team: TeamStatTotals): string[] {
  const out: string[] = []
  const o = team.offense

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

  const byPosition = lines.filter((l) => l.identifiedBy === 'position').length
  if (byPosition && byPosition === lines.length) {
    out.push(
      'Every line is by position rather than by player — no jersey number was legible and verified on this film.'
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
  const { credits, warnings } = resolveStatCredits(plays, opts)
  const tally = computeStatLines(credits)
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
export function aggregateStatCredits(clipCredits: StatCredit[][]): StatTally {
  // Play indexes restart at 1 in every clip; offset them so "plays counted"
  // isn't one clip's worth for the whole batch.
  let offset = 0
  const all: StatCredit[] = []
  for (const credits of clipCredits) {
    const max = credits.reduce((m, c) => Math.max(m, c.playIndex), 0)
    for (const c of credits) all.push({ ...c, playIndex: c.playIndex + offset })
    offset += max
  }
  return computeStatLines(all)
}
