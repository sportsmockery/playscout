import { Type } from '@google/genai'
import { LEFT_RIGHT_RULE } from './positions'

/**
 * ScoutIQ possession check — a separate, focused read of the PRE-SNAP picture
 * that decides who has the ball before the main scouting read runs.
 *
 * Why it exists. On a whole-game cut-up (Warriors lost 13-0 to the Knights)
 * the main read put the scouted team on offense on 52 of 72 plays and charted
 * 5 touchdowns for a team that scored none. Both teams ran Double Wing, the main
 * read samples the clip at 2fps in LOW resolution, and it was answering
 * possession as one question among dozens. So when the opponent was the
 * offense, their plays were filed as the scouted team's tendencies.
 *
 * This pass asks only the questions that decide possession, at a resolution
 * where jersey colours are legible, and its answer is handed to the main read
 * as a fact rather than left for the main read to infer. It also records who
 * ended up with the ball, by number only when the digits were readable.
 */

export type PossessionSide = 'scouted' | 'other' | 'unclear'
export type PlayKind = 'scrimmage' | 'kickoff' | 'punt' | 'extra_point' | 'no_play' | 'unclear'

export interface PossessionCheck {
  play_kind: PlayKind
  /** Which team lined up on OFFENSE at the snap. */
  offense: PossessionSide
  offense_jersey: string
  defense_jersey: string
  /** What in the picture decided it, so a coach can check it. */
  how_determined: string
  confidence: number
  ball_carrier: {
    team: PossessionSide
    /** Where he lined up before the snap: "tailback", "right wingback", ... */
    position: string
    /** Digits only, and only when legible. Empty otherwise. */
    jersey_number: string
  } | null
  /**
   * Did this play end in a touchdown? Asked here, independently of the main
   * read, because the main read charted seven touchdowns for a team that was
   * shut out: it calls a long run a score. A touchdown is counted only when
   * this read says yes too.
   */
  touchdown?: 'yes' | 'no' | 'unclear'
  /**
   * Was the ball THROWN forward on this snap? Asked here because the main read
   * samples at 2fps in low resolution and filed obvious passes as runs — a
   * coach watching the same film said "they pass a lot" while the plan read
   * "zero passes on 28 snaps". A throw is a sub-second event; this read sees
   * it at 4fps, high resolution, with full-resolution stills.
   */
  pass?: {
    thrown: 'yes' | 'no' | 'unclear'
    result: 'complete' | 'incomplete' | 'intercepted' | 'unclear'
  }
}

const PLAY_KINDS: readonly PlayKind[] = ['scrimmage', 'kickoff', 'punt', 'extra_point', 'no_play', 'unclear']

/**
 * Plain strings and no enums, on purpose: this runs beside the SCOUTIQ schema,
 * which sits close to Gemini's grammar-size limit, and a small closed answer is
 * normalised in code anyway.
 *
 * Note what is NOT asked: which team is which. The model reports colours only,
 * and possession is decided in code by matching them to the scouted team's
 * colour. Told "the scouted team wears black — is the offense the scouted
 * team?", the first version answered yes on 57 of 64 plays of a game the
 * scouted team lost 13-0, had them kicking off 8 times out of 9, and reported
 * confidence 1.0 on every one. A blind read cannot lean toward a team it was
 * never told about.
 */
export const POSSESSION_CHECK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    play_kind: { type: Type.STRING },
    offense_jersey: { type: Type.STRING },
    defense_jersey: { type: Type.STRING },
    how_determined: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    ball_carrier_side: { type: Type.STRING },
    ball_carrier_position: { type: Type.STRING },
    ball_carrier_number: { type: Type.STRING },
    touchdown: { type: Type.STRING },
    ball_thrown: { type: Type.STRING },
    pass_result: { type: Type.STRING },
  },
  required: [
    'play_kind', 'offense_jersey', 'defense_jersey', 'how_determined', 'confidence',
    'ball_carrier_side', 'ball_carrier_position', 'ball_carrier_number', 'touchdown',
    'ball_thrown', 'pass_result',
  ],
}

export function buildPossessionCheckPrompt(): string {
  return `You are reading ONE football clip to answer one thing: what colour jerseys the team with the ball is wearing.
You are not told which team is which, and it does not matter. Report only what you see.

You are given, before the clip itself: STILL frames from the start of the play at the film's full
resolution, and ZOOMED 2x crops of the middle of the field from the same moments. Use the zoomed
stills to read jersey colours. Use the clip to see who ends up with the ball.

Work from the PRE-SNAP picture, in this order:
1. Find the moment just before the ball is snapped (or kicked).
2. Find the BALL on the ground. Look at how far each team's players stand from it:
   - The OFFENSE is packed tight around the ball: a center over it, a quarterback right behind him,
     backs and wings within a few yards. Nobody on offense is far behind the ball except a lone
     deep back or a split-out receiver.
   - The DEFENSE stands much FARTHER BACK from the ball: linemen across from the center, then
     linebackers several yards off the ball, and deep players well behind them.
   The tight cluster with nobody deep is the offense; the team spread out and back from the ball
   is the defense. On a kickoff or punt, the OFFENSE is the KICKING team.
   Do NOT decide it from which way the play goes, who scores, which sideline is closer, or which
   team fills more of the frame. Both teams may run the same formation.
3. offense_jersey: the main colour of the JERSEY BODY worn by the offense ("white", "black").
   Not the numbers, pants, helmets or socks. Then defense_jersey the same way.
   If you cannot see the pre-snap picture, or cannot tell the two colours apart, write "unclear".
4. play_kind: scrimmage, kickoff, punt, extra_point, no_play (warm-ups, handshake line, huddle only)
   or unclear.
5. After the snap, who ends up with the ball (handoff, pitch, keep, catch, return)?
   ball_carrier_side: offense, defense (an interception, a fumble recovery, or the RETURNER on a
   kick) or unclear.
   ball_carrier_position: where that player lined up BEFORE the snap, in plain words
   ("tailback", "fullback", "quarterback", "right wingback", "kick returner"). ${LEFT_RIGHT_RULE}
   ball_carrier_number: the jersey number ONLY if you can clearly read the digits; otherwise "".
   Never guess a number.
6. touchdown: "yes" ONLY if you SEE the ball carrier cross the goal line into the painted end zone
   (or a referee signal a touchdown with both arms up). A long run that ends at a tackle, goes out
   of bounds, or leaves the frame before the goal line is "no" or "unclear". Never infer a score
   from a long gain, a celebration, or the next clip being a kickoff.
7. ball_thrown: "yes" if the ball LEAVES THE QUARTERBACK'S (or any player's) HAND IN THE AIR, forward,
   to another player — even after a fake handoff, even a short throw or a pitch-and-throw trick play.
   Watch the quarterback after the snap: a handoff or pitch keeps the ball low and close; a throw
   goes up and travels through the air. Youth teams that line up in run formations throw from them
   all the time — the formation tells you nothing. "no" if nobody threw it. "unclear" if the
   moment after the snap is not visible.
   pass_result: if thrown, "complete" (caught by the passer's team), "incomplete" (hit the ground),
   "intercepted" (caught by the defense) or "unclear". If not thrown, "unclear".
8. how_determined: one sentence naming what you saw ("white jerseys over the ball with a QB under
   center and two wingbacks; black jerseys spread across from them").
9. confidence: 0.0-1.0 that offense_jersey is right. Use the whole range — a clear pre-snap
   picture is high, a frame that starts after the snap or a crowded pile is low.

Return ONLY the JSON.`
}

const COLOURS: Record<string, string> = {
  black: 'black', white: 'white', orange: 'orange', red: 'red', scarlet: 'red', crimson: 'red',
  maroon: 'maroon', burgundy: 'maroon', blue: 'blue', navy: 'navy', royal: 'blue', green: 'green',
  yellow: 'yellow', gold: 'gold', purple: 'purple', grey: 'grey', gray: 'grey', silver: 'grey', pink: 'pink',
}

/** The first colour word in a description — "black jerseys with orange numbers" → "black". */
export function primaryColour(text: string | null | undefined): string | null {
  const words = (text ?? '').toLowerCase().match(/[a-z]+/g) ?? []
  for (const w of words) if (COLOURS[w]) return COLOURS[w]
  return null
}

/** Which team wore the offense's colour, decided in code from the blind read. */
export function sideFromColours(offenseJersey: string, defenseJersey: string, scoutedColor: string): PossessionSide {
  const scouted = primaryColour(scoutedColor)
  const offense = primaryColour(offenseJersey)
  const defense = primaryColour(defenseJersey)
  if (!scouted || !offense || !defense || offense === defense) return 'unclear'
  if (offense === scouted) return 'scouted'
  if (defense === scouted) return 'other'
  return 'unclear'
}

export function parsePossessionCheck(raw: unknown, scoutedColor: string): PossessionCheck | null {
  const r = (raw ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const kind = str(r.play_kind).toLowerCase()
  const number = str(r.ball_carrier_number).replace(/[^0-9]/g, '').slice(0, 2)
  const offenseJersey = str(r.offense_jersey)
  const defenseJersey = str(r.defense_jersey)
  const offense = sideFromColours(offenseJersey, defenseJersey, scoutedColor)
  const flip: Record<PossessionSide, PossessionSide> = { scouted: 'other', other: 'scouted', unclear: 'unclear' }
  const carrierSide = str(r.ball_carrier_side).toLowerCase()
  const carrierTeam: PossessionSide =
    carrierSide === 'offense' ? offense : carrierSide === 'defense' ? flip[offense] : 'unclear'
  const carrierPosition = str(r.ball_carrier_position)
  const td = str(r.touchdown).toLowerCase()
  const thrown = str(r.ball_thrown).toLowerCase()
  const passResult = str(r.pass_result).toLowerCase()
  return {
    play_kind: (PLAY_KINDS as readonly string[]).includes(kind) ? (kind as PlayKind) : 'unclear',
    offense,
    offense_jersey: offenseJersey,
    defense_jersey: defenseJersey,
    how_determined: str(r.how_determined),
    confidence: typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? r.confidence : 0,
    ball_carrier:
      carrierTeam !== 'unclear' || carrierPosition || number
        ? { team: carrierTeam, position: carrierPosition, jersey_number: number }
        : null,
    touchdown: td === 'yes' || td === 'no' ? td : 'unclear',
    pass: {
      thrown: thrown === 'yes' || thrown === 'no' ? thrown : 'unclear',
      result: (['complete', 'incomplete', 'intercepted'] as const).find((x) => x === passResult) ?? 'unclear',
    },
  }
}

/** Below this the check is not trusted to override the main read. */
export const MIN_POSSESSION_CONFIDENCE = 0.6

/**
 * The possession the main read must use, or null when the check did not settle
 * it (a kick, no play, unclear, or low confidence) — then the main read keeps
 * answering for itself, as it always has.
 */
export function settledPossession(check: PossessionCheck | null): 'offense' | 'defense' | null {
  if (!check || check.play_kind !== 'scrimmage') return null
  if (check.confidence < MIN_POSSESSION_CONFIDENCE) return null
  if (check.offense === 'scouted') return 'offense'
  if (check.offense === 'other') return 'defense'
  return null
}

/** The block appended to the main SCOUTIQ prompt when the check settled possession. */
export function buildPossessionFactBlock(check: PossessionCheck, opponentName: string): string {
  const settled = settledPossession(check)
  if (!settled) return ''
  const carrier = check.ball_carrier
  const carrierLine =
    carrier && carrier.team === 'scouted'
      ? `The ${opponentName} player who ended up with the ball lined up at ${carrier.position || 'an unidentified spot'}${carrier.jersey_number ? ` and wears #${carrier.jersey_number}` : ''}.`
      : ''
  const throwLine =
    check.pass?.thrown === 'yes'
      ? `The ball was THROWN on this play (a separate high-resolution check saw it leave the passer's hand${
          check.pass.result !== 'unclear' ? `; ${check.pass.result}` : ''
        }). Chart it as a pass — any backfield action before the throw makes it play_action_pass.`
      : ''
  return `
=== POSSESSION — ALREADY DETERMINED, DO NOT RE-DECIDE IT ===
A separate pre-snap check established who had the ball: the offense wore ${check.offense_jersey || 'one colour'}, the defense
wore ${check.defense_jersey || 'the other'} (${check.how_determined}).
${settled === 'offense'
    ? `${opponentName} are on OFFENSE in this clip. Set opponent_possession to "offense". Chart offensive_snaps, stop_points and key_players for ${opponentName}'s offense; leave defensive_snaps, attack_points and target_players empty.`
    : `${opponentName} are on DEFENSE in this clip. Set opponent_possession to "defense". Chart defensive_snaps, attack_points and target_players for ${opponentName}'s defense; leave offensive_snaps, stop_points and key_players empty. The team with the ball is the OTHER team — never file its plays as ${opponentName}'s.`}
${carrierLine}
${throwLine}`.trim()
}
