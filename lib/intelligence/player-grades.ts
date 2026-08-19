import type { PlayerGrade } from './schemas'

/**
 * RankerIQ's grading math.
 *
 * The model reads the film and reports what it SAW for each player —
 * execution, how hard the job was, and how much the rep mattered to the play.
 * The final grade is computed here rather than left to the model, for one
 * reason: ranking only means something if a 78 in clip 3 means the same thing
 * as a 78 in clip 40. A model asked for a holistic number invents a fresh
 * scale on every call, so cross-clip ranks become noise.
 *
 * Position is deliberately NOT a numeric multiplier. "Grade varies by
 * position" is handled in the prompt — what good execution LOOKS like for a
 * left tackle vs. a free safety — because a coefficient would rank a great
 * center below a mediocre quarterback by fiat, which is not how film is
 * graded.
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

/**
 * Ties a graded rep to a roster player by jersey number.
 *
 * Only matches on a legible number the model actually read, and only when
 * exactly one player wears it — a duplicate number (common on youth teams
 * that run separate offensive and defensive jerseys) is left unmatched rather
 * than attributed to the wrong kid. Attaching a grade to the wrong player is
 * worse than attaching it to none.
 */
export function matchRosterPlayer(
  jerseyNumber: string | null | undefined,
  roster: RosterEntry[]
): string | null {
  if (!jerseyNumber) return null
  const normalized = String(jerseyNumber).replace(/[^0-9]/g, '')
  if (!normalized) return null

  const matches = roster.filter(
    (p) => p.jersey_number != null && String(p.jersey_number).replace(/[^0-9]/g, '') === normalized
  )
  return matches.length === 1 ? matches[0].id : null
}

/**
 * Normalizes every graded rep in a clip: recomputes the grade from the
 * observed factors, assigns the letter, matches the roster, and ranks the
 * list best-first. Ties break toward the harder assignment, since two players
 * who executed identically are not equally impressive if one had the tougher
 * job.
 */
export function rankPlayerGrades(grades: PlayerGrade[], roster: RosterEntry[] = []): PlayerGrade[] {
  const scored = grades.map((g) => {
    const grade = gradeFromFactors({
      execution: g.execution,
      difficulty: g.difficulty,
      impact: g.impact,
    })
    return {
      ...g,
      grade,
      letter: letterFor(grade),
      player_id: matchRosterPlayer(g.jersey_number, roster),
    }
  })

  scored.sort((a, b) => b.grade - a.grade || b.difficulty - a.difficulty)
  return scored.map((g, i) => ({ ...g, rank: i + 1 }))
}
