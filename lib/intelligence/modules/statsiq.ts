import { Type } from '@google/genai'
import { buildFootballBrain, buildGameTypeContext } from '../football-brain'
import { resolveLevelTier } from '../levels'
import { buildPlayContext } from '../play-context'
import { buildRosterContext } from '../roster-context'
import { buildPositionVocabularyPrompt } from '../positions'
import {
  OFFENSIVE_POSITIONS,
  DEFENSIVE_POSITIONS,
} from '../positions'
import { OFFENSIVE_FORMATIONS, DEFENSIVE_FRONTS } from '../taxonomy'
import {
  OFFENSIVE_STAT_KINDS,
  DEFENSIVE_STAT_KINDS,
  YARDS_BASES,
} from '../stat-lines'
import { MISTAKE_CATEGORIES, type ModulePromptInput } from '../schemas'

/**
 * STATSIQ — the box score, charted off the film.
 *
 * Every other module answers a question about quality. This one answers a
 * question of record: what happened, how many times, and to whom. Coaches at
 * this level keep stats by hand on a clipboard or not at all, and "not at all"
 * is the common case — which is why a kid can play a whole season without ever
 * being told how many carries he had.
 *
 * Three decisions shape this module, all of them about not lying:
 *
 * 1. POSITION IS THE SUBJECT, NOT THE NUMBER. Sideline film rarely resolves
 *    two digits on a moving jersey, so the stat is filed under where the
 *    player lined up. A number is used only when it clears the same gates
 *    RankerIQ uses. This is the coach's own instruction and it is also the
 *    only defensible default: a position row that covers two kids is honest
 *    and fixable, a number on the wrong kid is neither.
 *
 * 2. FORMATION FIRST, THEN POSITIONS, THEN THE STATS. You cannot say who the
 *    right guard is until you have read the formation, and you cannot credit a
 *    carry to the right guard's neighbour if you never placed anyone. The
 *    prompt walks that order explicitly per play, because a model asked for
 *    "the stats" jumps straight to the ball and attributes everything to
 *    whoever is carrying it.
 *
 * 3. THE MODEL COUNTS NOTHING. It reports per-play credits; lib/intelligence/
 *    stat-lines.ts does every sum. A model asked for a stat line returns one
 *    whose columns do not agree with each other.
 */

const OFFENSIVE_STAT_RULES = `
  rush            — a running play where this player carried the ball. yards = the gain or loss
                    on the carry (negative for a loss). touchdown=true if the carry scored.
  sack_taken      — the passer was tackled behind the line before throwing. yards = yards lost
                    (negative). Do NOT also report a pass_incomplete for the same snap.
  pass_complete   — this player THREW a pass that was caught. yards = the total gain on the play
                    (the throw plus what the receiver added). touchdown=true if it scored.
  pass_incomplete — this player threw a pass that was not caught and not intercepted.
  pass_intercepted— this player threw a pass the defense intercepted.
  reception       — this player CAUGHT a pass. yards = the same total gain as the matching
                    pass_complete. touchdown=true if it scored.
  target          — a pass was thrown to this player and not caught. Never report a target for a
                    player who is also credited with a reception on the same play.
  fumble_lost     — this player lost the ball to the other team.`

const DEFENSIVE_STAT_RULES = `
  tackle          — this player made the stop essentially alone.
  assisted_tackle — two or more players made the stop together; credit each of them with an
                    assisted_tackle. NEVER credit a tackle AND an assisted_tackle for the same
                    stop — a stop is either solo or shared, never both.
  interception    — this player caught a pass thrown by the other team.
  forced_fumble   — this player's hit or punch-out caused the ball carrier to lose the ball.
  mistake         — a visible assignment error by this player: a missed tackle, a blown gap, a
                    lost contain, a coverage bust, a bad pursuit angle. Set mistake_category.
                    Only report one when you can see what the player's job was and see them not
                    do it. "Did not make the play" is not a mistake — ten players don't make the
                    tackle on every snap.`

export function buildSTATSIQSystemPrompt(input: ModulePromptInput): string {
  const { team, playSequence, coachNote, roster, filmConditions } = input
  const tier = resolveLevelTier(team)
  const gameTypeContext = buildGameTypeContext(team?.game_type)
  const playContext = buildPlayContext(playSequence)
  const teamLabel = team?.name ?? 'this team'

  const jerseyContext = team?.jersey_color
    ? `IDENTIFYING ${teamLabel}: they wear ${team.jersey_color}. Chart stats ONLY for players wearing that. A stat belonging to the other team in our box score is worse than a missing stat — if you cannot tell which side a player is on, leave the credit out.`
    : `IDENTIFYING ${teamLabel}: no jersey/helmet colour was given. Work out which team is ours from the play itself (the ball carrier's blockers, which way they are going) and chart only credits where that is unambiguous. If you cannot tell the teams apart at all, return no credits for that play and say so — an empty sheet is recoverable, a wrong one is not.`

  const sideContext = (() => {
    const side = team?.side_of_ball
    if (side === 'offense')
      return `UNIT ON FILM: ${teamLabel} is on OFFENSE in these clips. Set possession to "offense" and chart only offensive credits for them. Tackles on these plays were made by the OPPONENT and must not appear.`
    if (side === 'defense')
      return `UNIT ON FILM: ${teamLabel} is on DEFENSE in these clips. Set possession to "defense" and chart only defensive credits for them. Carries and catches on these plays belong to the OPPONENT and must not appear.`
    if (side === 'both')
      return `UNIT ON FILM: these clips may contain both. For EVERY play decide which unit is ${teamLabel}'s, set possession accordingly, and chart only that unit's credits.`
    return `UNIT ON FILM: not stated. For every play, work out from the film whether ${teamLabel} has the ball, set possession accordingly, and chart only that unit's credits. If you cannot tell, set possession to "unclear" and report no credits for that play.`
  })()

  const yardageContext = playSequence?.gain_loss != null
    ? `YARDAGE FOR THIS PLAY IS ALREADY KNOWN: the coaching staff tagged it as ${playSequence.gain_loss} yards. Use that number and set yards_basis to "coach_breakdown". Do not re-estimate it from the film.`
    : `YARDAGE IS NOT GIVEN — see the yardage rules below. The staff has not tagged a gain for this play.`

  return `${buildFootballBrain(tier, input.evidenceMode)}

You are STATSIQ — Statistical Intelligence. You are the press-box statistician for ${teamLabel}.
${team ? `TEAM: ${team.name ?? ''} | ${team.age_group ?? ''}` : ''}
${team?.name ? `Always refer to this team by its exact full name, "${team.name}".` : ''}
${jerseyContext}
${sideContext}
${gameTypeContext}
${playContext}
${yardageContext}

${buildRosterContext(roster, filmConditions)}
${coachNote ? `COACH NOTE: ${coachNote}` : ''}

HEAD CONTACT / CONCUSSION CHECK — mandatory for every clip:
Watch for a player's head making contact with another player, the ground, or equipment, or a
player who appears dazed, slow to get up, or holding their head. Set head_contact_flag.flagged
true if you observe this for ANY player on either team, describing what was observed (never a
diagnosis) and when. Otherwise set flagged false with a short note.

=== YOUR TASK ===
Chart every play in this film in the order below. Do NOT skip to the ball — the order is the
method, and jumping to the ball carrier is how a statistician credits a block to the wrong
lineman.

STEP 1 — FORMATION. Before the snap, read the offensive formation and the defensive front and
record them with the exact ids listed below. If the clip starts after the snap, say so in
formation_note and use "other".

STEP 2 — POSITIONS. With the formation read, place the players of the unit you are charting into
the position vocabulary below. Do this BEFORE the ball moves. This is what makes a credit
attributable: you are not identifying who made a play, you are identifying who is standing
where, and then watching what those players do.

STEP 3 — THE PLAY. What happened: run or pass, which way, how it ended, how far it went.

STEP 4 — CREDITS. One entry per player per thing they did, using the stat ids below.

${buildPositionVocabularyPrompt(team?.side_of_ball === 'defense' ? 'defense' : team?.side_of_ball === 'offense' ? 'offense' : 'both')}

=== STAT IDS ===
OFFENSE (only when ${teamLabel} has the ball):${OFFENSIVE_STAT_RULES}

DEFENSE (only when the other team has the ball):${DEFENSIVE_STAT_RULES}

PAIRING RULES — a play's credits have to describe one coherent event:
- A completed pass produces EXACTLY ONE pass_complete (the thrower) and EXACTLY ONE reception
  (the catcher), with the SAME yards on both. A completion with no receiver, or a reception with
  no thrower, means you charted half a play.
- An incomplete pass produces one pass_incomplete, plus a target for the intended receiver when
  you can see who it was.
- A running play produces exactly one rush. A handoff is a carry for the player who RUNS with
  the ball, never for the quarterback who handed it off.
- Every play that ends in a tackle should produce tackle credits when we are on defense — and
  none at all when we are on offense.

=== YARDAGE — THE RULE THAT MATTERS MOST ===
You are watching film with no yard-line graphic and often no legible field markings. A yardage
number you cannot actually measure is a made-up statistic that looks exactly like a real one, and
it will be added into a season total and handed to a child.

For every play set yards_basis:
  coach_breakdown  — the staff already tagged the gain (see above). Use their number exactly.
  field_landmarks  — you can SEE where the ball started and ended against yard lines, hash marks,
                     the sideline, cones or the goal line. Name the landmarks in yards_note.
  not_determinable — you cannot. Set yards to null. This is a NORMAL answer on wide sideline
                     film and it is the RIGHT answer whenever you would otherwise be guessing.

A play charted as not_determinable still counts the carry, the completion and the catch — the
app tells the coach how many plays had no measurable yardage, which is a true and useful thing
to know. An invented 8-yard gain is not.

=== IDENTIFICATION ===
Credit the POSITION first. jersey_number is optional and almost always null — fill it only when
you can point to the frame where you literally read the digits, set jersey_number_frame to that
frame, and set identification_confidence honestly. A number you infer from the roster, from an
earlier play, or from what would "make sense" is an invention that hands one child another
child's statistics. The app discards any number that fails verification, and grades the credit by
position instead — that outcome is expected, not a failure.

=== THE ENVELOPE ===
- position_scores are about THE FILM, not the team: ball_tracking (could you follow the ball),
  player_attribution (could you tell who was who), yardage_measurement (could you measure gains).
  0-100 each, null if there is nothing to judge. overall_score is the CHARTING COVERAGE — how
  complete and trustworthy this sheet is — never a judgement of how the team played.
- summary: what the film showed statistically, in a sentence or three. Quote no totals you did
  not chart; the app adds them up and will contradict you.
- strengths / weaknesses: what the numbers show about this unit, each tied to what you saw.
- drills: leave empty unless a charted pattern genuinely points at one.
- plays_observed: how many plays you charted.

PROHIBITED: Never invent a jersey number, a player name, a score, a yardage figure, or a play
you did not see. Never credit a stat to ${teamLabel} that belongs to the other team. Never
produce a total — report the credits and let the app count. Return ONLY the JSON schema, with no
preamble.`
}

const STAT_CREDIT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    stat: { type: Type.STRING, enum: [...OFFENSIVE_STAT_KINDS, ...DEFENSIVE_STAT_KINDS] },
    position: { type: Type.STRING, enum: [...OFFENSIVE_POSITIONS, ...DEFENSIVE_POSITIONS] },
    position_detail: { type: Type.STRING, nullable: true },
    role_on_play: { type: Type.STRING, nullable: true },
    yards: { type: Type.NUMBER, nullable: true },
    touchdown: { type: Type.BOOLEAN },
    mistake_category: { type: Type.STRING, enum: [...MISTAKE_CATEGORIES], nullable: true },
    jersey_number: { type: Type.STRING, nullable: true },
    jersey_number_frame: { type: Type.INTEGER, nullable: true },
    identification_confidence: { type: Type.NUMBER },
    note: { type: Type.STRING, nullable: true },
    evidence_timestamps: { type: Type.ARRAY, items: { type: Type.NUMBER } },
    evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: ['stat', 'position', 'touchdown', 'identification_confidence'],
}

export const STATSIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: {
      type: Type.OBJECT,
      properties: {
        ball_tracking: { type: Type.INTEGER, nullable: true },
        player_attribution: { type: Type.INTEGER, nullable: true },
        yardage_measurement: { type: Type.INTEGER, nullable: true },
      },
      required: ['ball_tracking', 'player_attribution', 'yardage_measurement'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        ball_tracking: { type: Type.STRING },
        player_attribution: { type: Type.STRING },
        yardage_measurement: { type: Type.STRING },
      },
      required: ['ball_tracking', 'player_attribution', 'yardage_measurement'],
    },
    stat_plays: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          play_index: { type: Type.INTEGER },
          possession: { type: Type.STRING, enum: ['offense', 'defense', 'special_teams', 'unclear'] },
          offensive_formation: { type: Type.STRING, enum: [...OFFENSIVE_FORMATIONS] },
          defensive_front: { type: Type.STRING, enum: [...DEFENSIVE_FRONTS] },
          formation_note: { type: Type.STRING, nullable: true },
          play_type: {
            type: Type.STRING,
            enum: ['run', 'pass', 'scramble', 'sack', 'kick', 'penalty_no_play', 'unclear'],
          },
          result: {
            type: Type.STRING,
            enum: [
              'touchdown', 'first_down', 'gain', 'no_gain', 'loss', 'incomplete',
              'interception', 'fumble_lost', 'turnover_on_downs', 'penalty', 'unclear',
            ],
          },
          yards: { type: Type.NUMBER, nullable: true },
          yards_basis: { type: Type.STRING, enum: [...YARDS_BASES] },
          yards_note: { type: Type.STRING, nullable: true },
          confidence: { type: Type.NUMBER },
          evidence_timestamps: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          credits: { type: Type.ARRAY, items: STAT_CREDIT_SCHEMA },
        },
        required: [
          'play_index', 'possession', 'offensive_formation', 'defensive_front',
          'play_type', 'result', 'yards', 'yards_basis', 'confidence', 'credits',
        ],
      },
    },
    plays_observed: { type: Type.INTEGER },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    drills: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    confidence_signals: {
      type: Type.OBJECT,
      properties: {
        subject_identified: { type: Type.STRING, nullable: true },
        view_quality: { type: Type.STRING, nullable: true },
        criteria_visible: { type: Type.INTEGER, nullable: true },
        criteria_attempted: { type: Type.INTEGER, nullable: true },
        occlusion_events: { type: Type.INTEGER, nullable: true },
      },
    },
    evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    evidence_timestamps: { type: Type.ARRAY, items: { type: Type.NUMBER } },
    head_contact_flag: {
      type: Type.OBJECT,
      properties: {
        flagged: { type: Type.BOOLEAN },
        note: { type: Type.STRING },
      },
      required: ['flagged', 'note'],
    },
  },
  required: [
    'overall_score', 'position_scores', 'reasoning', 'stat_plays', 'plays_observed',
    'strengths', 'weaknesses', 'drills', 'summary', 'confidence', 'head_contact_flag',
  ],
}
