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
}

const PLAY_KINDS: readonly PlayKind[] = ['scrimmage', 'kickoff', 'punt', 'extra_point', 'no_play', 'unclear']
const SIDES: readonly PossessionSide[] = ['scouted', 'other', 'unclear']

/**
 * Plain strings and no enums, on purpose: this runs beside the SCOUTIQ schema,
 * which sits close to Gemini's grammar-size limit, and a small closed answer is
 * normalised in code anyway.
 */
export const POSSESSION_CHECK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    play_kind: { type: Type.STRING },
    offense: { type: Type.STRING },
    offense_jersey: { type: Type.STRING },
    defense_jersey: { type: Type.STRING },
    how_determined: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    ball_carrier_team: { type: Type.STRING },
    ball_carrier_position: { type: Type.STRING },
    ball_carrier_number: { type: Type.STRING },
  },
  required: [
    'play_kind', 'offense', 'offense_jersey', 'defense_jersey', 'how_determined', 'confidence',
    'ball_carrier_team', 'ball_carrier_position', 'ball_carrier_number',
  ],
}

export function buildPossessionCheckPrompt(opponentName: string, jerseyColor: string): string {
  return `You are checking ONE thing on this football clip before anyone scouts it: which team has the ball.

The team being scouted is ${opponentName}, wearing ${jerseyColor}. Call them "scouted". The other team is "other".

You are given, before the clip itself: STILL frames from the start of the play at the film's full
resolution, and ZOOMED 2x crops of the middle of the field from the same moments. Use the zoomed
stills to read jersey colours — a person can tell the teams apart at a glance there, and so should you.
Use the clip to see who ends up with the ball.

Work from the PRE-SNAP picture, in this order:
1. Find the moment just before the ball is snapped (or kicked).
2. Find the BALL on the ground and the CENTER over it. The team with the center, a quarterback
   behind him and backs in the backfield is the OFFENSE. The team facing them across the ball,
   spread out with linebackers and deep players, is the DEFENSE. This is the only thing that decides it.
3. Look at the OFFENSE's jerseys and write what colour you see (offense_jersey). Do the same for the
   DEFENSE (defense_jersey). Describe what you actually see, not what you were told.
4. offense = "scouted" if the offense is wearing ${jerseyColor}; "other" if the offense is the other
   team; "unclear" if you cannot see the pre-snap picture or cannot tell the colours apart.
   Do NOT decide it from which way the play goes, which team scores, which sideline is closer, or
   which team the clip seems to be about. Both teams may run the same formation; only the jerseys
   on the side with the ball tell you who it is.
5. play_kind: scrimmage, kickoff, punt, extra_point, no_play (warm-ups, handshake line, huddle only)
   or unclear. On a kickoff or punt, offense is the KICKING team.
6. After the snap, who ends up with the ball (handoff, pitch, keep or catch)?
   ball_carrier_team: scouted, other or unclear.
   ball_carrier_position: where that player lined up BEFORE the snap, in plain words
   ("tailback", "fullback", "quarterback", "right wingback", "left end"). ${LEFT_RIGHT_RULE}
   ball_carrier_number: the jersey number ONLY if you can clearly read the digits; otherwise "".
   Never guess a number.
7. how_determined: one sentence naming what you saw ("black jerseys over the ball with a QB under
   center and two wingbacks; white jerseys spread across from them").
8. confidence: 0.0-1.0 that offense is right.

Return ONLY the JSON.`
}

export function parsePossessionCheck(raw: unknown): PossessionCheck | null {
  const r = (raw ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const side = (v: unknown): PossessionSide =>
    (SIDES as readonly string[]).includes(str(v).toLowerCase()) ? (str(v).toLowerCase() as PossessionSide) : 'unclear'
  const kind = str(r.play_kind).toLowerCase()
  const number = str(r.ball_carrier_number).replace(/[^0-9]/g, '').slice(0, 2)
  const carrierTeam = side(r.ball_carrier_team)
  const carrierPosition = str(r.ball_carrier_position)
  return {
    play_kind: (PLAY_KINDS as readonly string[]).includes(kind) ? (kind as PlayKind) : 'unclear',
    offense: side(r.offense),
    offense_jersey: str(r.offense_jersey),
    defense_jersey: str(r.defense_jersey),
    how_determined: str(r.how_determined),
    confidence: typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? r.confidence : 0,
    ball_carrier:
      carrierTeam !== 'unclear' || carrierPosition || number
        ? { team: carrierTeam, position: carrierPosition, jersey_number: number }
        : null,
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
  return `
=== POSSESSION — ALREADY DETERMINED, DO NOT RE-DECIDE IT ===
A separate pre-snap check established who had the ball: the offense wore ${check.offense_jersey || 'one colour'}, the defense
wore ${check.defense_jersey || 'the other'} (${check.how_determined}).
${settled === 'offense'
    ? `${opponentName} are on OFFENSE in this clip. Set opponent_possession to "offense". Chart offensive_snaps, stop_points and key_players for ${opponentName}'s offense; leave defensive_snaps, attack_points and target_players empty.`
    : `${opponentName} are on DEFENSE in this clip. Set opponent_possession to "defense". Chart defensive_snaps, attack_points and target_players for ${opponentName}'s defense; leave offensive_snaps, stop_points and key_players empty. The team with the ball is the OTHER team — never file its plays as ${opponentName}'s.`}
${carrierLine}`.trim()
}
