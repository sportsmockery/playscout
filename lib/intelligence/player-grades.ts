import type { PlayerGrade } from './schemas'

/**
 * RankerIQ's grading math and player identity resolution.
 *
 * The model reads the film and reports what it SAW for each player —
 * execution, how hard the job was, and how much the rep mattered. The final
 * grade is computed here rather than left to the model, for one reason:
 * ranking only means something if a 78 in clip 3 means the same thing as a 78
 * in clip 40. A model asked for a holistic number invents a fresh scale on
 * every call, so cross-clip ranks become noise.
 *
 * Position is deliberately NOT a numeric multiplier. "Grade varies by
 * position" is handled in the prompt — what good execution LOOKS like for a
 * left tackle vs. a free safety — because a coefficient would rank a great
 * center below a mediocre quarterback by fiat.
 */

/** How much the rep mattered to the outcome of the play. */
export const IMPACT_LEVELS = ['decisive', 'high', 'moderate', 'low', 'none'] as const
export type ImpactLevel = (typeof IMPACT_LEVELS)[number]

/**
 * How far a rep's grade is allowed to travel from the baseline. A decisive
 * rep — the pulling guard who springs the run, the corner who gets beaten
 * deep — is what a coach rewinds for, so it moves the grade most. A rep with
 * no bearing on the play can't earn or lose much no matter how it looked.
 */
const IMPACT_WEIGHT: Record<ImpactLevel, number> = {
  decisive: 1.25,
  high: 1.1,
  moderate: 1.0,
  low: 0.8,
  none: 0.6,
}

/** The "did your job, nothing more" anchor every adjustment moves away from. */
export const BASELINE_GRADE = 70

/**
 * A reported jersey number below this confidence is treated as unreadable.
 * Sideline youth film usually cannot resolve digits at all, so the model
 * saying "probably 30" is not evidence — it's a guess that would hand a real
 * kid another player's grade.
 */
export const MIN_NUMBER_CONFIDENCE = 0.7

/**
 * Difficulty (1 easy → 5 very hard) tilts the result in the direction the rep
 * already went. Winning a hard assignment is worth more than winning an easy
 * one; losing an easy assignment is worse than losing a hard one. Applied as a
 * multiplier on the deviation, so it never flips a bad rep into a good grade.
 */
function difficultyMultiplier(difficulty: number, executedWell: boolean): number {
  const d = clamp(difficulty, 1, 5)
  const steps = d - 3 // -2 … +2
  return executedWell ? 1 + steps * 0.09 : 1 - steps * 0.09
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export interface GradeFactors {
  /** 0-100: how well the assignment was physically executed. */
  execution: number
  /** 1-5: how hard the assigned job was on this play. */
  difficulty: number
  /** How much this rep mattered to the play's outcome. */
  impact: ImpactLevel | string
}

/**
 * Blends the observed factors into the 0-100 grade the app ranks on, using
 * the same scale as every other module (90+ elite … <60 beginner).
 */
export function gradeFromFactors({ execution, difficulty, impact }: GradeFactors): number {
  const exec = clamp(Number.isFinite(execution) ? execution : BASELINE_GRADE, 0, 100)
  const deviation = exec - BASELINE_GRADE
  const weight = IMPACT_WEIGHT[impact as ImpactLevel] ?? IMPACT_WEIGHT.moderate
  const adjusted = deviation * weight * difficultyMultiplier(difficulty, deviation >= 0)
  return Math.round(clamp(BASELINE_GRADE + adjusted, 0, 100))
}

/** Coach-facing letter for a numeric grade — the language film rooms use. */
export function letterFor(grade: number): string {
  if (grade >= 93) return 'A'
  if (grade >= 90) return 'A-'
  if (grade >= 87) return 'B+'
  if (grade >= 83) return 'B'
  if (grade >= 80) return 'B-'
  if (grade >= 77) return 'C+'
  if (grade >= 73) return 'C'
  if (grade >= 70) return 'C-'
  if (grade >= 67) return 'D+'
  if (grade >= 60) return 'D'
  return 'F'
}

export interface RosterEntry {
  id: string
  jersey_number?: number | string | null
  first_name?: string | null
  last_name?: string | null
}

function digitsOf(value: string | number | null | undefined): string | null {
  if (value == null) return null
  const digits = String(value).replace(/[^0-9]/g, '')
  return digits.length ? String(Number(digits)) : null
}

/**
 * Ties a graded rep to a roster player by jersey number.
 *
 * Only matches on a legible number the model actually read, and only when
 * exactly one player wears it — a duplicate number (common on youth teams
 * that run separate offensive and defensive jerseys) is left unmatched rather
 * than attributed to the wrong kid.
 */
export function matchRosterPlayer(
  jerseyNumber: string | null | undefined,
  roster: RosterEntry[]
): string | null {
  const normalized = digitsOf(jerseyNumber)
  if (!normalized) return null
  const matches = roster.filter((p) => digitsOf(p.jersey_number) === normalized)
  return matches.length === 1 ? matches[0].id : null
}

function rosterName(playerId: string | null, roster: RosterEntry[]): string | null {
  if (!playerId) return null
  const p = roster.find((r) => r.id === playerId)
  if (!p) return null
  const first = p.first_name?.trim()
  const last = p.last_name?.trim()
  const name = [first ? `${first[0]}.` : null, last].filter(Boolean).join(' ').trim()
  return name || null
}

/**
 * A coach-findable label for a player whose number we don't trust: their
 * position and alignment, with any number scrubbed out. "#30" that we just
 * rejected must not survive anywhere in the label.
 */
function roleLabel(grade: PlayerGrade): string {
  const stripNumbers = (s: string) => s.replace(/#\s*\d+/g, '').replace(/\s{2,}/g, ' ').trim()
  const fromIdentifier = stripNumbers(grade.identifier ?? '')
  const fromPosition = stripNumbers(grade.position ?? '')
  // Prefer the descriptive identifier when it says more than the position code
  // ("backside safety, near hash" beats "FS").
  if (fromIdentifier && fromIdentifier.replace(/[^a-z]/gi, '').length > 1) return fromIdentifier
  if (fromPosition) return fromPosition
  return 'Unidentified player'
}

export interface IdentityOptions {
  /**
   * False on scrimmage/practice film. Pinnies and practice jerseys carry
   * numbers that belong to other players — or no number at all — so a number
   * matching the roster there proves nothing about who is wearing it.
   */
  allowNumbers?: boolean
}

export interface ResolvedIdentity {
  jerseyNumber: string | null
  playerId: string | null
  identifier: string
  /** Why a reported number was discarded — surfaced in the UI, not hidden. */
  numberRejectedReason: string | null
}

/**
 * Decides what we are willing to CLAIM about who this is.
 *
 * The prompt asks the model to report a number only when it can read the
 * digits, but models comply imperfectly and a fabricated number is the single
 * most damaging output this module can produce — it hands a real kid another
 * player's grade. So every reported number has to clear these gates before we
 * repeat it to a coach:
 *
 *   0. the film is game film — see IdentityOptions.allowNumbers
 *   1. the team has a roster on file to check the number against
 *   2. the model cited the frame where it read the digits
 *   3. its own identification confidence is at least MIN_NUMBER_CONFIDENCE
 *   4. the number actually exists on that roster
 *
 * Gate 1 is deliberately strict: with no roster there is nothing to verify
 * against, and an unverifiable number is precisely what put one kid's grade on
 * another. Grading by role costs the coach a label; getting it wrong costs
 * them trust in every number on the page.
 *
 * Anything that fails is downgraded to a role label — never dropped, because
 * the grade itself is still useful. A rejected number is also scrubbed from
 * the model's note, since "#30 kept his eyes downfield" is the same false
 * claim in prose form.
 */
export function resolvePlayerIdentity(
  grade: PlayerGrade,
  roster: RosterEntry[] = [],
  opts: IdentityOptions = {}
): ResolvedIdentity {
  const reported = digitsOf(grade.jersey_number)
  const allowNumbers = opts.allowNumbers ?? true

  if (!reported) {
    return { jerseyNumber: null, playerId: null, identifier: roleLabel(grade), numberRejectedReason: null }
  }

  let reason: string | null = null
  if (!allowNumbers) {
    reason = 'scrimmage film — jerseys may not match the roster'
  } else if (roster.length === 0) {
    // Without a roster there is nothing to check a number against, and an
    // unverifiable number is exactly what put another kid's grade on a real
    // player. Grade by role and tell the coach what would unlock names.
    reason = 'no roster on file to verify numbers against'
  } else if (grade.jersey_number_frame == null) {
    reason = 'no frame cited for the number'
  } else if ((grade.identification_confidence ?? 0) < MIN_NUMBER_CONFIDENCE) {
    reason = 'number not legible enough to trust'
  } else if (!roster.some((p) => digitsOf(p.jersey_number) === reported)) {
    reason = `no #${reported} on this roster`
  }

  if (reason) {
    return { jerseyNumber: null, playerId: null, identifier: roleLabel(grade), numberRejectedReason: reason }
  }

  const playerId = matchRosterPlayer(reported, roster)
  const name = rosterName(playerId, roster)
  return {
    jerseyNumber: reported,
    playerId,
    identifier: name ? `#${reported} ${name}` : `#${reported}`,
    numberRejectedReason: null,
  }
}

/** Removes a number we refused to stand behind from the coach-facing note. */
function scrubNumberFromNote(note: string, rejected: string, replacement: string): string {
  return note
    .replace(new RegExp(`#\\s*0*${rejected}\\b`, 'g'), replacement)
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Normalizes every graded rep in a clip: resolves identity, recomputes the
 * grade from the observed factors, assigns the letter, and ranks best-first.
 * Ties break toward the harder assignment, since two players who executed
 * identically are not equally impressive if one had the tougher job.
 */
export function rankPlayerGrades(
  grades: PlayerGrade[],
  roster: RosterEntry[] = [],
  opts: IdentityOptions = {}
): PlayerGrade[] {
  const scored = grades.map((g) => {
    const identity = resolvePlayerIdentity(g, roster, opts)
    const grade = gradeFromFactors({
      execution: g.execution,
      difficulty: g.difficulty,
      impact: g.impact,
    })

    const rejected = identity.numberRejectedReason ? digitsOf(g.jersey_number) : null
    const note = rejected ? scrubNumberFromNote(g.note ?? '', rejected, identity.identifier) : g.note

    return {
      ...g,
      grade,
      letter: letterFor(grade),
      identifier: identity.identifier,
      jersey_number: identity.jerseyNumber,
      player_id: identity.playerId,
      number_rejected_reason: identity.numberRejectedReason,
      note,
    }
  })

  scored.sort((a, b) => b.grade - a.grade || b.difficulty - a.difficulty)
  return scored.map((g, i) => ({ ...g, rank: i + 1 }))
}
