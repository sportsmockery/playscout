import { Type } from '@google/genai'
import { buildFootballBrain } from './football-brain'
import { resolveLevelTier } from './levels'
import { normalizeStatPosition, isOffensivePosition, LEFT_RIGHT_RULE } from './positions'
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

   THE TEST IS THE BALL IN FLIGHT. A pass happened only if you can see the ball leave a hand and
   travel through the air, separate from every player, before another player catches it or it
   hits the ground. If you never see the ball airborne and alone, IT WAS NOT A PASS.

   This is the error this check exists to catch, and it is the most common one on this film: a
   play-action fake, a bootleg, a quarterback carrying the ball out to the edge with it held away
   from his body, or a throwing motion that never releases, all LOOK like passes and are RUNS. A
   quarterback who kept the ball and ran is a RUN no matter how much the play began like a pass.
   A sack is a RUN.

   Do not infer a pass from the shape of the play, from a receiver running a route, from a
   quarterback's arm motion, or from where the ball carrier ends up. Only from the ball in the
   air. If you cannot find that moment, answer "cannot_tell" or "run" — never "pass".

2. ball_changed_hands — after the snap, did the ball pass from the player who took the snap to
   another player (a handoff, pitch or toss)? "no" means whoever took the snap still had it.
   If the exchange is hidden by bodies or the camera, say "cannot_tell".

   MEASURED: elaborating this question with fake-detection guidance made question 1 worse — the
   check started answering "no handoff, therefore he threw it" and flipped a rushing touchdown to
   a pass on three runs out of three. Keep this question short. The charting prompt carries the
   mesh-point reasoning; this one only has to corroborate.

3. ball_ended_with — the position of the player who finished the play with the ball (the runner,
   or the receiver who caught it). Use these ids: qb, rb, fb, wingback_left, wingback_right,
   te_left, te_right, wr_left, wr_right, slot_left, slot_right. Null if you cannot tell.

   ${LEFT_RIGHT_RULE}

   Work it out deliberately before you answer: which way is this offence moving, and is the
   player on their left hand or their right? A receiver on the near sideline is on their RIGHT
   when they attack to your right, and on their LEFT when they attack to your left. Getting this
   backwards names a different child.

4. thrown_by — on a pass, the position of the thrower. Null on a run or if you cannot tell.

5. yards — how far the ball advanced, measured off the field. This was shot on a MARKED field:
   a stripe every 5 yards, hash marks, sidelines, two goal lines. Find the yard line the ball was
   on at the snap, find the line where the play ended (the goal line, if it scored), and count.
   The camera panning does not stop you — the lines pan with it, so read each end separately.
   Null ONLY if no line is readable in this clip at all. Do not estimate without lines, and do not
   refuse a line you can see.

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

/**
 * How far two yardage readings may differ before neither is trusted.
 *
 * Proportional, not flat. Both reads measure off the same painted stripes, and
 * the error in reading a stripe scales with the distance being read: 53 against
 * 57 on a 55-yard touchdown is two people rounding the same run to the nearest
 * line, while 1 against 5 on a short gain is a real disagreement about what
 * happened. A flat 3 yards treated those identically and would have thrown away
 * the measurement on exactly the long runs a coach most wants a number for.
 */
const YARDS_TOLERANCE_MIN = 3
const YARDS_TOLERANCE_FRACTION = 0.12

function yardsTolerance(a: number, b: number): number {
  return Math.max(YARDS_TOLERANCE_MIN, Math.abs(a) * YARDS_TOLERANCE_FRACTION, Math.abs(b) * YARDS_TOLERANCE_FRACTION)
}

/** Charting says "pass"/"run"; the verifier says the same in its own vocabulary. */
function chartedKind(play: RawStatPlay): 'run' | 'pass' | 'other' {
  const t = (play.play_type ?? '').toLowerCase()
  if (t === 'pass') return 'pass'
  if (t === 'run' || t === 'scramble' || t === 'sack') return 'run'
  return 'other'
}

/**
 * Would the check's play-type veto fire anywhere in this film?
 *
 * Asked BEFORE paying for a second verification: on a film where both reads
 * already agree there is nothing to corroborate, and the overwhelming majority
 * of plays agree. Only a disputed play is worth another look at the video.
 */
export function hasPlayTypeDispute(charted: RawStatPlay[], verified: VerifiedPlay[]): boolean {
  const byIndex = new Map(verified.map((v) => [v.play_index, v]))
  return charted.some((play, i) => {
    const check = byIndex.get(play.play_index ?? i + 1)
    if (!check || check.play_type === 'cannot_tell') return false
    const kind = chartedKind(play)
    return kind !== 'other' && check.play_type !== kind
  })
}

/**
 * Do two independent runs of the verification prompt tell the same story about
 * what kind of plays these were?
 *
 * This is the whole of policy C. MEASURED, 11 scored runs over two clips whose
 * truth the coach supplied, scoring three policies off identical reads:
 *
 *                                     clip A (pass)   clip B (run)
 *   check always wins (shipped)          7/7              3/4
 *   charting always wins                 1/7              4/4
 *   check wins only if corroborated      7/7              4/4
 *
 * Neither single policy is right on both clips: the check answered "pass" 7/7
 * on the clip that IS a pass, rescuing a sheet whose charting read was right
 * once in four — and answered "pass" on 3 of 8 runs of the clip that is a RUN,
 * destroying a correct read each time. What separates those two cases is not
 * the check's verdict but its CONSISTENCY, and a second run is what exposes it.
 */
export function verificationsAgreeOnPlayType(a: VerifiedPlay[], b: VerifiedPlay[]): boolean {
  if (a.length !== b.length) return false
  const byIndex = new Map(b.map((v) => [v.play_index, v]))
  return a.every((v) => byIndex.get(v.play_index)?.play_type === v.play_type)
}

/** The credit that carries the play — the one whose attribution actually matters. */
function principalCredit(credits: RawStatCredit[]): RawStatCredit | undefined {
  return (
    credits.find((c) => c.stat === 'rush') ??
    credits.find((c) => c.stat === 'reception') ??
    // An incompletion and an interception have a receiver the ball was meant
    // for, and the two reads disagreed about who he was — wr_left against
    // wr_right — on a sheet this function scored 100/100 because neither
    // `target` nor `pass_intercepted` was listed here and the actor check
    // never ran.
    credits.find((c) => c.stat === 'target') ??
    credits.find((c) => c.stat === 'pass_complete') ??
    credits.find((c) => c.stat === 'pass_intercepted')
  )
}

/**
 * Rebuilds a play from the CHECKING read when the charting read contradicted it
 * on possession.
 *
 * Discarding was the first answer and it left the coach with an empty sheet
 * over a play both reads plainly saw. The measurements say which read to keep:
 * across nine runs on two clips with known answers, the charting pass got the
 * play right ONCE, while the verification pass was right every time it answered
 * — and on the decisive test, with the team's real jersey colour set, it
 * returned the identical answer three times out of three (pass, qb, wr_left,
 * 14 yards) while charting called it an interception three times out of three.
 *
 * So where the two disagree about who finished with the ball, the closed-question
 * read supplies the play and the coach is told it did. This is deliberately
 * narrow — it only fires on a contradicted turnover, only on a pass, and only
 * when the check named both a thrower and a catcher confidently — because it is
 * a workaround for a charting prompt that needs fixing, not a replacement for it.
 */
const MIN_REBUILD_CONFIDENCE = 0.8

function rebuildFromCheck(check: VerifiedPlay, charted: RawStatPlay): RawStatCredit[] {
  if ((check.confidence ?? 0) < MIN_REBUILD_CONFIDENCE) return []
  const finishedWith = check.ball_ended_with
    ? normalizeStatPosition(check.ball_ended_with, 'offense')
    : null
  if (!finishedWith || !isOffensivePosition(finishedWith)) return []

  // WHO is rebuilt; HOW FAR is not. Play type, thrower and catcher came back
  // identical on every run of both clips, but the same read's yardage swung
  // 13 → 14 → 23 on one of them, and here there is no second measurement to
  // check it against — the charting read's account of this play is the one just
  // rejected. Counting a single uncorroborated figure observed to move ten
  // yards is the exact habit `yards_basis` exists to break, so the play counts
  // and the gain is left for the coach, highlighted in "Fix a stat".
  const note =
    'Read from the verification pass, which disagreed with the charting pass about what happened. Its yardage was not corroborated, so add the gain yourself.'

  // The one fact carried across from the rejected read. Two reads disagreeing
  // about run-versus-pass are not disagreeing about whether the ball crossed
  // the goal line, and a touchdown is the most consequential thing on a sheet
  // to lose silently. The dispute line tells the coach it came from the other
  // read so they can strike it.
  const touchdown = (charted.result ?? '').toLowerCase() === 'touchdown'

  // A rebuild happens BECAUSE the two reads disagreed, which is already
  // evidence that this play was read badly. So the check supplies WHAT
  // happened and never WHO the ball ended with.
  //
  // Measured, on the clip whose receiver the coach named (the RIGHT wide
  // receiver): the check answered wr_left on three runs out of four even after
  // its prompt was given the left/right rule. Crediting the catch to it named
  // the wrong child 75% of the time — worse than the question it replaced,
  // because a question costs a keypress and a wrong name costs a season. Play
  // type over the same runs was 4/4, which is the split this encodes: the
  // closed-question read is reliable about the EVENT and unreliable about the
  // PERSON.
  const chartedPlayer = (charted.credits ?? []).find(
    (c) => c.stat === 'reception' || c.stat === 'target' || c.stat === 'rush'
  )?.position
  const alternative = chartedPlayer ? normalizeStatPosition(chartedPlayer, 'offense') : null
  const candidates: string[] = [finishedWith, alternative].filter(
    (p, i, all) => !!p && all.indexOf(p) === i
  ) as string[]
  const asking = {
    unresolved: true,
    question: check.play_type === 'pass' ? 'Who caught this pass?' : 'Who carried the ball?',
    candidates,
  }

  if (check.play_type === 'pass') {
    // The THROWER is asserted: it was qb on every run of both clips and on the
    // coach's answer, and a pass thrown by someone other than the quarterback
    // is rare enough to be worth charting when two reads agree on it.
    const thrower = check.thrown_by ? normalizeStatPosition(check.thrown_by, 'offense') : null
    if (!thrower || !isOffensivePosition(thrower)) return []
    return [
      { stat: 'pass_complete', position: thrower, yards: null, touchdown, note },
      { stat: 'reception', position: finishedWith, yards: null, touchdown, note, ...asking },
    ]
  }

  if (check.play_type === 'run') {
    return [{ stat: 'rush', position: finishedWith, yards: null, touchdown, note, ...asking }]
  }

  return []
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
export interface ReconcileOptions {
  /**
   * Who wins when the two reads disagree about run versus pass.
   *
   * `check` is the shipped behaviour: the closed-question read supplies the
   * play. It was justified by measurement on film where the charting read was
   * wrong and the check was right.
   *
   * `charting` keeps the charted play and its yardage and parks only the
   * PLAYER, on the grounds that a disagreement is evidence about the person
   * rather than about the event. It exists because the same measurement, run
   * again, found the opposite failure: on a clip that is a run, the check
   * answered `pass` on 3 of 8 runs and this rule overwrote a correct charting
   * read every time, turning `rush 1/50yd` into `pass 1/1, 0yd`.
   *
   * Neither is right everywhere, which is the point — see the eval.
   */
  playTypeVeto?: 'check' | 'charting'
}

export function reconcileReadings(
  charted: RawStatPlay[],
  verified: VerifiedPlay[],
  opts: ReconcileOptions = {}
): Reconciliation {
  const playTypeVeto = opts.playTypeVeto ?? 'check'
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
        // The charting read keeps the play; only the player is parked.
        //
        // A disagreement about run-versus-pass is still evidence that somebody
        // misread this snap, so the principal actor is a question either way.
        // What differs is whether the EVENT is taken from the read that lost:
        // here it is not, so the gain survives too.
        if (playTypeVeto === 'charting') {
          disputes.push(
            `Play ${index}: the charting read called this a ${kind} and the check read a ${check.play_type}. The charting account is what is counted — check the player.`
          )
          const contested = principalCredit(credits)
          return {
            ...play,
            credits: credits.map((c) =>
              c === contested
                ? {
                    ...c,
                    unresolved: true,
                    question:
                      kind === 'pass' ? 'Who caught this pass?' : 'Who carried the ball on this play?',
                    candidates: [
                      normalizeStatPosition(c.position, 'offense'),
                      check.ball_ended_with
                        ? normalizeStatPosition(check.ball_ended_with, 'offense')
                        : null,
                    ].filter((p, j, all) => !!p && all.indexOf(p) === j) as string[],
                  }
                : c
            ),
          }
        }

        // Discarding was the first answer, and the measurements retired it.
        // Across nine runs on two clips with known answers the charting read
        // was right ONCE; the closed-question read was right every time it
        // answered. Throwing both away over a disagreement between them threw
        // away the reliable one too, and handed the coach an empty sheet over a
        // play they had just watched.
        const rebuilt = rebuildFromCheck(check, play)
        if (rebuilt.length) {
          disputes.push(
            `Play ${index}: the charting read called this a ${kind}; the check read a ${check.play_type} and named the players. The check's account is what is counted — confirm it, and add the gain.`
          )
          return {
            ...play,
            play_type: check.play_type,
            yards: null,
            yards_basis: 'not_determinable',
            credits: rebuilt,
          }
        }
        disputes.push(
          `Play ${index}: one read of the film says this was a ${kind}, the other says a ${check.play_type}, and the check could not name the players either. Nothing was counted — enter it yourself below.`
        )
        return { ...play, credits: [] }
      }
      agreed += 1
    }

    // 1b. Did WE still have the ball at the end?
    //
    // Measured on real film, three runs out of three: the charting pass called
    // a completed 23-yard pass an INTERCEPTION (twice) and a sack-fumble
    // (once), while the verification pass said every time that the quarterback
    // threw it and one of OUR receivers finished with it. The play-type check
    // above could not catch the interceptions, because a completion and an
    // interception are both "pass" — so a turnover the film did not contain
    // went onto a quarterback's season with nothing objecting.
    //
    // The verifier's position vocabulary is our own unit's, so naming an
    // offensive position as the player who finished with the ball is a direct
    // statement that we kept it. That contradicts a charted turnover, and a
    // turnover is far too expensive a claim to keep on a coin flip.
    //
    // Only checkable in this direction: the verifier has no vocabulary for
    // "a defender took it", so it cannot confirm a turnover, only contradict one.
    // Every charted outcome that says the ball did NOT finish in our hands.
    //
    // It started as turnovers only, and measurement widened it: on the third
    // run of the 4th-down clip the charting read called the same completion
    // INCOMPLETE while the check named the receiver who caught it. An
    // incompletion is not a turnover, so nothing objected, and a completed
    // pass was charted 0-for-1. All three claims are contradicted by the same
    // evidence — the check naming one of OUR players as finishing with the
    // ball — so all three belong to the same check.
    const lostIt = credits.find(
      (c) =>
        c.stat === 'pass_intercepted' ||
        c.stat === 'fumble_lost' ||
        c.stat === 'pass_incomplete'
    )
    const finishedWith = check.ball_ended_with
      ? normalizeStatPosition(check.ball_ended_with, 'offense')
      : null
    if (lostIt && finishedWith && isOffensivePosition(finishedWith) && check.play_type !== 'cannot_tell') {
      checks += 1
      const rebuilt = rebuildFromCheck(check, play)
      if (rebuilt.length) {
        disputes.push(
          `Play ${index}: the charting read said we did not finish with the ball (${(lostIt.stat ?? '').replace(/_/g, ' ')}); the check saw it completed to our own ${finishedWith.replace(/_/g, ' ')}. The check's account is what is counted here — confirm it, and add the gain, which nothing corroborated.`
        )
        return { ...play, play_type: 'pass', result: 'gain', yards: null,
          yards_basis: 'not_determinable', credits: rebuilt }
      }
      disputes.push(
        `Play ${index}: one read charted the ball as lost (${(lostIt.stat ?? '').replace(/_/g, ' ')}), the other saw our own ${finishedWith.replace(/_/g, ' ')} finish with it. Nothing was counted — that claim is too costly to record on a disagreement.`
      )
      return { ...play, credits: [] }
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
      if (Math.abs(play.yards - check.yards) > yardsTolerance(play.yards, check.yards)) {
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

/**
 * The mesh point, which two independent reads cannot settle between them.
 *
 * Cross-verification works by making two reads disagree. It cannot help where
 * both reads make the SAME mistake, and there is one place on football film
 * where they reliably do: the moment the quarterback and a back come together
 * on an option, veer, read or wing-T give. A fake and a real handoff are the
 * same picture — that is the entire point of running them — so a model asked
 * "did the ball change hands?" answers from what the play LOOKS like, and a
 * second model asked the same question looks at the same thing and says the
 * same.
 *
 * Measured on this product's own film, on one clip whose truth the coach gave
 * us (a quarterback keeper for a touchdown off a fullback dive fake):
 *   - charting read:      handoff, carry to the running back
 *   - verification read:  handoff, ball ended with the running back
 *   - agreement score:    100
 * Two reads, full corroboration, wrong answer. Four further runs put the carry
 * on a back three times. The prompt already spends a page on the mesh point and
 * says outright to expect the keeper; it did not help, and a sixth paragraph
 * will not either.
 *
 * So on a team whose coach has told us they run a mesh scheme, the carrier is
 * not asserted. It is asked, in the queue built for exactly this, and answered
 * in one keypress by the person who called the play. The play, the yardage and
 * the touchdown all still count for the team — only the name waits.
 *
 * This fires on the coach's own declared scheme and nothing else: a team that
 * never option-reads never sees one of these questions.
 */
const MESH_POSITIONS = new Set(['qb', 'rb', 'fb', 'wingback_left', 'wingback_right'])

/**
 * Schemes built on a quarterback/back mesh, as a coach writes them in team
 * settings. Matched on substrings of their own words rather than a dropdown,
 * because the field is free text and already full of real answers.
 */
const QB_MESH_MARKERS = [
  'veer',
  'option',
  'triple',
  'midline',
  'wishbone',
  'flexbone',
  'wing-t',
  'wing t',
  'double wing',
  'single wing',
  'zone read',
  'read option',
  'rpo',
  'mesh',
  'qb keep',
  'quarterback keep',
  'keeper',
  'bootleg',
]

export function schemeHasQbMesh(offensiveStyle?: string | null): boolean {
  if (!offensiveStyle) return false
  const text = offensiveStyle.toLowerCase()
  return QB_MESH_MARKERS.some((marker) => text.includes(marker))
}

/**
 * Parks the carrier of every mesh-scheme run as a question instead of asserting
 * it. Runs whether or not the verification pass succeeded — it is not a
 * disagreement rule, it is the one claim we already know corroboration cannot
 * reach.
 */
export function flagMeshPointCarries(
  plays: RawStatPlay[],
  opts: { qbMeshScheme: boolean }
): RawStatPlay[] {
  if (!opts.qbMeshScheme) return plays

  return plays.map((play) => {
    if (chartedKind(play) !== 'run') return play
    const credits = play.credits ?? []
    if (!credits.length) return play

    return {
      ...play,
      credits: credits.map((credit) => {
        // A question already on this credit is a reconciliation finding and
        // says more than this one does — leave it.
        if (credit.stat !== 'rush' || credit.unresolved) return credit
        const position = normalizeStatPosition(credit.position, 'offense')
        if (!position || !MESH_POSITIONS.has(position)) return credit

        return {
          ...credit,
          unresolved: true,
          question: 'Who carried it — did the quarterback keep, or was it a handoff?',
          // Asked in BOTH directions. The errors we have measured all ran away
          // from the quarterback, but the only clip whose truth we know IS a
          // keeper, so "the model under-calls keepers" is not something that
          // sample can establish. Asking only when it charted a back would bake
          // in the opposite bias on no evidence at all.
          candidates:
            position === 'qb'
              ? ['qb', 'rb', 'fb']
              : ['qb', position],
        }
      }),
    }
  })
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
