import { Type } from '@google/genai'
import { buildFootballBrain } from './football-brain'
import { resolveLevelTier } from './levels'
import { normalizeStatPosition } from './positions'
import type { ModulePromptInput } from './schemas'
import type { RawStatPlay, RawStatCredit } from './stat-lines'

/**
 * A second, independent read of the one fact a stat sheet cannot survive
 * getting wrong: what kind of play it was, and who had the ball.
 *
 * Observed in production, on the same 31-second clip, twice:
 *   read 1 — 55-yard rushing touchdown by the running back (confidence 0.95)
 *   read 2 — 50-yard passing touchdown, quarterback to the left receiver
 * The coach's answer was neither: a 50-yard quarterback keeper. Both readings
 * were internally coherent, both cited timestamps, and both reported near-total
 * confidence. Nothing in a single-pass pipeline can catch that, because the
 * model's own confidence is the thing that is broken.
 *
 * So the load-bearing facts get read twice, by a prompt that is deliberately
 * NOT the charting prompt: it asks a handful of closed questions and is never
 * shown what the first pass concluded — a verifier that can see the answer
 * agrees with it. Where the two reads agree, we have corroboration. Where they
 * disagree, we have proof of uncertainty, and the coach is asked instead of
 * being handed a confident guess.
 *
 * This costs a second model call per clip. A wrong carry on a child's season
 * costs more.
 */

export interface VerifiedPlay {
  play_index: number
  play_type: 'run' | 'pass' | 'other' | 'cannot_tell'
  ball_changed_hands: 'yes' | 'no' | 'cannot_tell'
  /** Who ended up with the ball — position id, or null if unreadable. */
  ball_ended_with: string | null
  /** Who threw it, on a pass. */
  thrown_by: string | null
  yards: number | null
  confidence: number
}

export function buildPlayVerificationPrompt(input: ModulePromptInput): string {
  const { team } = input
  const tier = resolveLevelTier(team)
  const jersey = team?.jersey_color
    ? `The team being charted wears ${team.jersey_color}.`
    : 'No jersey colour was given for the team being charted.'

  return `${buildFootballBrain(tier, input.evidenceMode)}

You are checking one thing, carefully, and nothing else.

${jersey}

For EVERY play in this clip, in order, answer these questions from what you can actually see:

1. play_type — was it a RUN or a PASS?
   A pass means the ball left a player's hand as a forward throw. A run means it did not.
   A quarterback who kept the ball and ran is a RUN. A sack is a RUN. If you cannot tell, say
   "cannot_tell" — that is a real answer and a useful one.

2. ball_changed_hands — after the snap, did the ball pass from the player who took the snap to
   another player (a handoff, pitch or toss)? "no" means whoever took the snap still had it.
   If the exchange is hidden by bodies or the camera, say "cannot_tell".

3. ball_ended_with — the position of the player who finished the play with the ball (the runner,
   or the receiver who caught it). Use the position vocabulary ids: qb, rb, fb, wingback_left,
   wingback_right, te_left, te_right, wr_left, wr_right, slot_left, slot_right. Null if you
   cannot tell.

4. thrown_by — on a pass, the position of the thrower. Null on a run or if you cannot tell.

5. yards — how far the ball advanced, if and only if you can measure it against yard lines, hash
   marks, the sideline or the goal line. Null otherwise. Do not estimate.

6. confidence — 0.0 to 1.0, honestly.

You are NOT charting statistics and you are NOT writing a report. Do not describe technique, do
not praise anyone, do not invent a narrative. Answer the six questions per play.

Being wrong here is worse than saying "cannot_tell", because another reading of this same film
will be compared against yours and a coach will be asked about anything the two disagree on.
An honest "cannot_tell" produces a good question. A confident wrong answer produces a wrong
statistic on a child's season.

Return ONLY the JSON schema. No preamble.`
}

export const PLAY_VERIFICATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    plays: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          play_index: { type: Type.INTEGER },
          play_type: { type: Type.STRING, enum: ['run', 'pass', 'other', 'cannot_tell'] },
          ball_changed_hands: { type: Type.STRING, enum: ['yes', 'no', 'cannot_tell'] },
          ball_ended_with: { type: Type.STRING, nullable: true },
          thrown_by: { type: Type.STRING, nullable: true },
          yards: { type: Type.NUMBER, nullable: true },
          confidence: { type: Type.NUMBER },
        },
        required: ['play_index', 'play_type', 'ball_changed_hands', 'confidence'],
      },
    },
  },
  required: ['plays'],
}

/** How far two yardage readings may differ before neither is trusted. */
const YARDS_TOLERANCE = 3

/** Charting says "pass"/"run"; the verifier says the same in its own vocabulary. */
function chartedKind(play: RawStatPlay): 'run' | 'pass' | 'other' {
  const t = (play.play_type ?? '').toLowerCase()
  if (t === 'pass') return 'pass'
  if (t === 'run' || t === 'scramble' || t === 'sack') return 'run'
  return 'other'
}

/** The credit that carries the play — the one whose attribution actually matters. */
function principalCredit(credits: RawStatCredit[]): RawStatCredit | undefined {
  return (
    credits.find((c) => c.stat === 'rush') ??
    credits.find((c) => c.stat === 'reception') ??
    credits.find((c) => c.stat === 'pass_complete')
  )
}

export interface Reconciliation {
  plays: RawStatPlay[]
  /** Plays the two reads could not agree about at all — nothing charted from them. */
  disputes: string[]
  /** 0-100: how much of what was checked the two reads agreed on. */
  agreement: number
}

/**
 * Merges the charting read with the verification read.
 *
 * Three outcomes per play, in descending order of how much survives:
 *   agree            — the credits stand and count.
 *   actor disagrees  — the credits stand but the PLAYER is left open, and the
 *                      coach is asked which of the two it was.
 *   play type        — the two reads do not even agree on what happened, so
 *     disagrees        nothing is charted. A sheet that says "I could not read
 *                      this play" is worth more than one that picks a story.
 *
 * Yardage is treated separately: two landmark readings that differ by more than
 * a few yards are two guesses, so the play keeps its credits and loses its
 * measurement rather than asserting a number neither read supports.
 */
export function reconcileReadings(
  charted: RawStatPlay[],
  verified: VerifiedPlay[]
): Reconciliation {
  const byIndex = new Map(verified.map((v) => [v.play_index, v]))
  const disputes: string[] = []
  let checks = 0
  let agreed = 0

  const plays = charted.map((play, i) => {
    const index = play.play_index ?? i + 1
    const check = byIndex.get(index)
    if (!check) {
      // The verifier did not see a play here at all. That is itself a
      // disagreement about whether anything happened.
      disputes.push(
        `Play ${index}: the second read of this film did not find a play here, so nothing from it was counted.`
      )
      checks += 1
      return { ...play, credits: [] }
    }

    const credits = play.credits ?? []
    const kind = chartedKind(play)

    // 1. What kind of play was it? Everything else depends on this.
    if (check.play_type !== 'cannot_tell' && kind !== 'other') {
      checks += 1
      if (check.play_type !== kind) {
        disputes.push(
          `Play ${index}: one read of the film says this was a ${kind}, the other says a ${check.play_type}. Nothing was counted from it — enter it yourself below.`
        )
        return { ...play, credits: [] }
      }
      agreed += 1
    }

    // 2. Who had the ball? A disagreement here is a question, not a discard —
    //    the play is known, only the player is in doubt.
    const principal = principalCredit(credits)
    const claimed = principal ? normalizeStatPosition(principal.position, 'offense') : null
    const seen = check.ball_ended_with
      ? normalizeStatPosition(check.ball_ended_with, 'offense')
      : null

    let nextCredits = credits
    if (principal && claimed && seen) {
      checks += 1
      if (claimed !== seen) {
        nextCredits = credits.map((c) =>
          c === principal
            ? {
                ...c,
                unresolved: true,
                question:
                  kind === 'pass'
                    ? 'Who caught this pass?'
                    : 'Who carried the ball on this play?',
                candidates: [claimed, seen],
              }
            : c
        )
      } else {
        agreed += 1
      }
    }

    // 3. A handoff the verifier did not see is the quarterback-keeper case
    //    that started all of this.
    if (kind === 'run' && principal && check.ball_changed_hands !== 'cannot_tell') {
      checks += 1
      const chartedHandoff = claimed !== 'qb'
      const sawHandoff = check.ball_changed_hands === 'yes'
      if (chartedHandoff !== sawHandoff) {
        nextCredits = nextCredits.map((c) =>
          c.stat === 'rush'
            ? {
                ...c,
                unresolved: true,
                question: 'Who carried the ball — did the quarterback keep it, or hand it off?',
                candidates: ['qb', claimed ?? 'rb'].filter((v, j, all) => all.indexOf(v) === j),
              }
            : c
        )
      } else {
        agreed += 1
      }
    }

    // 4. Two measurements that disagree are two estimates.
    let nextPlay: RawStatPlay = { ...play, credits: nextCredits }
    if (play.yards != null && check.yards != null) {
      checks += 1
      if (Math.abs(play.yards - check.yards) > YARDS_TOLERANCE) {
        disputes.push(
          `Play ${index}: the two reads measured this as ${play.yards} and ${check.yards} yards, so no yardage was counted. Type the real number in if you know it.`
        )
        nextPlay = {
          ...nextPlay,
          yards: null,
          yards_basis: 'not_determinable',
          credits: nextCredits.map((c) => ({ ...c, yards: null })),
        }
      } else {
        agreed += 1
      }
    }

    return nextPlay
  })

  return {
    plays,
    disputes,
    // With nothing checkable, claim nothing: an unverified sheet is not a
    // corroborated one.
    agreement: checks === 0 ? 0 : Math.round((agreed / checks) * 100),
  }
}

/** Defensive parse — a failed verification must not fail the analysis. */
export function parseVerification(raw: string): VerifiedPlay[] {
  try {
    const parsed = JSON.parse(raw) as { plays?: VerifiedPlay[] }
    return Array.isArray(parsed.plays) ? parsed.plays : []
  } catch {
    return []
  }
}
