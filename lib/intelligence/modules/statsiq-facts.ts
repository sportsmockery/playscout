import { Type } from '@google/genai'
import { buildFootballBrain, buildGameTypeContext } from '../football-brain'
import { resolveLevelTier } from '../levels'
import { buildPlayContext } from '../play-context'
import { buildRosterContext } from '../roster-context'
import { LEFT_RIGHT_RULE } from '../positions'
import { PLAY_FACTS_SCHEMA } from '../stat-facts'
import type { ModulePromptInput } from '../schemas'

/**
 * STATSIQ charting as closed questions.
 *
 * The narrative prompt this replaces (modules/statsiq.ts) renders to ~25,700
 * characters over 358 lines, and asks the model to chart a play: read the
 * formation, place the players, decide what happened, then emit a free list of
 * stat credits that obey a page of pairing rules. Measured against two clips
 * whose truth the coach supplied, it got the play right once in nine runs. The
 * six-question verification prompt — ~8,500 characters — was right every time
 * it answered.
 *
 * This one renders to ~12,100 characters over 157 lines. That is less than half
 * the prompt it replaces and still half again the size of the one measured
 * reliable, so length alone is not the claim being made here — the claim is
 * that every question below is closed and none of them asks for a deduction.
 * Whether that is enough is a measurement, not an argument. See below.
 *
 * So this asks questions instead. Every field below has a small closed answer
 * set, every question is about something visible, and NOTHING here asks the
 * model to apply a rule: no pairing, no solo-vs-assisted arithmetic, no "if the
 * ball did not change hands then the carry belongs to". stat-facts.ts does all
 * of that from the answers.
 *
 * Three things were deliberately kept from the long prompt, because each one
 * was added in response to a measured failure and removing it would be
 * re-running an experiment that already has an answer:
 *
 *  - THE BALL-IN-FLIGHT TEST. The most common error on this film by a distance;
 *    it is the first question here for the same reason it is first there.
 *  - TRACK THE CARRIER BACK TO THE SNAP. A 55-yard keeper came back as "left
 *    wide receiver" because the camera found him near a sideline at the end.
 *  - THE FIELD IS MARKED. Removing this wording is what made the sheet print no
 *    yardage at all; `field_landmarks` is the expected answer, not the
 *    exception.
 *
 * What is NOT here, and why: the pairing rules, the carry deduction, the
 * solo/assisted constraint, the "never produce a total" warning, the
 * identification doctrine beyond its three gates, and the per-play envelope.
 * Each of those is now either impossible to express or computed.
 */
export function buildSTATSIQFactsPrompt(input: ModulePromptInput): string {
  const { team, playSequence, coachNote, roster, filmConditions } = input
  const tier = resolveLevelTier(team)
  const teamLabel = team?.name ?? 'this team'

  const jersey = team?.jersey_color
    ? `${teamLabel} wears ${team.jersey_color} in this film. Answer only about them — a stat belonging to the other team is worse than a missing stat.`
    : `No jersey colour was given for ${teamLabel}. Work out which team is ours from the play itself, and answer "unclear" for possession rather than guessing.`

  // The coach has told us which unit is on this film, and that answer beats
  // anything the model infers from the picture.
  //
  // MEASURED: the first version of this said "possession is 'ours' on a normal
  // play", and on the 55-yard keeper the model answered "theirs" — deciding
  // from the film that the scoring team must be the opponent — and then charted
  // three of OUR defenders for mistakes on a touchdown our own offense scored.
  // The play itself was read correctly (run, touchdown, 50 yards) and the sheet
  // still came out empty. A hedge is not an instruction.
  const side = (() => {
    switch (team?.side_of_ball) {
      case 'offense':
        return `${teamLabel} IS ON OFFENSE IN THIS FILM. Answer possession "ours" on every play unless you can actually see the other team snap the ball. The team advancing the ball is OURS even if that surprises you, and the tackles on these plays were made by the OPPONENT — leave tacklers empty and answer no mistakes.`
      case 'defense':
        return `${teamLabel} IS ON DEFENSE IN THIS FILM. Answer possession "theirs" on every play unless you can actually see our team snap the ball. The carries and catches on these plays belong to the OPPONENT and must not be answered — answer only the tacklers, the takeaways and the mistakes.`
      default:
        return `Decide per play whether ${teamLabel} has the ball, and answer "unclear" rather than guessing.`
    }
  })()

  const knownYards =
    playSequence?.gain_loss != null
      ? `YARDS ARE ALREADY KNOWN for this play: the staff tagged it as ${playSequence.gain_loss}. Answer that number and set yards_basis to "coach_breakdown".`
      : null

  return `${buildFootballBrain(tier, input.evidenceMode)}

You are STATSIQ. You are answering a fixed list of questions about each play in this film. You
are NOT writing a report, NOT grading anyone, and NOT counting anything — every total on the
coach's sheet is added up from your answers by the app.

${jersey}
${side}
${team?.offensive_style ? `OUR OFFENSE RUNS: ${team.offensive_style}. Use this to know where the ball is LIKELY to go, never to decide where it went. What you see outranks it.` : ''}
${buildGameTypeContext(team?.game_type)}
${buildPlayContext(playSequence)}
${knownYards ?? ''}
${buildRosterContext(roster, filmConditions, { allowUnverifiedNumbers: true })}
${coachNote ? `COACH NOTE: ${coachNote}` : ''}

Answer every question for every play, in order. A question you cannot answer from the film has
an answer for that — null, or "cannot_tell". Use it. A null answer becomes a one-tap question
for the coach; a wrong answer becomes a statistic on the wrong child's season.

=== 0. possession — WHO HAS THE BALL ===
"ours" means ${teamLabel} is the unit with the ball on this play and you answer the offensive
questions. "theirs" means the other team has it and you answer the defensive ones. Read the
statement above about which unit is on this film before you answer: it comes from the coach who
filmed it, and it outranks what the picture suggests to you.

=== 1. play_type — RUN or PASS? ===
THE TEST IS THE BALL IN FLIGHT. A pass happened only if you can see the ball leave a hand and
travel through the air, separate from every player, before someone catches it or it hits the
ground. If you never see the ball airborne and alone, it was NOT a pass — answer "run".

This is the error that matters most on this film. A play-action fake, a bootleg, a quarterback
carrying the ball out to the edge with it held away from his body, and a throwing motion that
never releases ALL look like passes and are runs. A sack is a run. Never infer a pass from the
shape of the play, from receivers running routes, from an arm motion, or from where the ball
ends up.

=== 2. Who had the ball ===
snap_taken_by     — the position of the player who took the snap.
ball_changed_hands— after the snap, did the ball pass from that player to another (handoff,
                    pitch, toss)? "no" means whoever took the snap still had it. If bodies or
                    the camera hide the exchange, answer "cannot_tell" — do not resolve a mesh
                    point you could not see. A fake and a handoff look identical at the mesh;
                    that is what running them is for.
ball_ended_with   — the position of the player who finished the play with the ball.

POSITION MEANS WHERE HE LINED UP, NOT WHERE THE CAMERA FOUND HIM. On a long run the camera
follows the carrier thirty yards downfield and near a sideline; naming him from there is how a
quarterback keeper came back as "wide receiver". Find him at the end, track him BACKWARD to the
snap, and answer with the spot he lined up in. If you cannot follow him back, answer null.

${LEFT_RIGHT_RULE}

=== 3. On a pass ===
thrown_by         — the position of the thrower.
pass_outcome      — complete, incomplete, or intercepted.
intended_receiver — who the ball was thrown to, on an incompletion.

=== 4. How it ended ===
touchdown         — did this play score?
turnover          — none, fumble_lost (we lost the ball), interception (we took theirs).

=== 5. When THEY have the ball ===
tacklers          — the positions of OUR defenders who made the stop.
tackle_shared     — true if two or more of them made it together, false if one made it alone.
interception_by / forced_fumble_by — the position of our player who did it.
mistakes          — a visible assignment error by one of our players, with its category. Only
                    when you can see what the player's job was and see him not do it. "Did not
                    make the play" is not a mistake — ten players don't make the tackle on
                    every snap.

=== 6. yards ===
This was shot on a MARKED field: a stripe every 5 yards, hash marks, sidelines, two goal lines.
Those stripes are the measuring instrument and they are readable on sideline film. Find the line
the ball is on at the snap, find the line where the play ended (the goal line, if it scored),
and count between them.

yards_basis:
  coach_breakdown  — the staff already tagged the gain. Use their number.
  field_landmarks  — you read it off the field. THIS IS THE EXPECTED ANSWER. Name the landmarks
                     at both ends in yards_note ("snapped at the 40, scored, 40 yards").
  not_determinable — no line is readable at all: an unlined practice field, a crop with no
                     stripe in frame, or a snap that happens off camera. Answer yards null.

The camera panning does not hide the lines — they pan too, so read each end separately. A
missing broadcast overlay is not missing information; painted stripes do that job. Do not answer
not_determinable for a long gain, for a play the camera followed, or for a run into the end zone.

=== 7. penalty ===
penalty_on        — us, them, offsetting, or none.
penalty_by        — the position of the player flagged, if you can see who it was.
penalty_type, penalty_timing (pre_snap / during_play / dead_ball), penalty_yards (the rules
number: 5, 10, 15 — not a distance you measured).
penalty_enforcement — accepted, declined, offsetting, or unclear. The tell is what happens next:
                    the ball moved back and the down was replayed (accepted), or the result
                    stood (declined). Answer "unclear" rather than assuming.

Answer these for every flag you see, whoever it was on. The app applies the rule — an accepted
foul before or during the play deletes that play's statistics, a dead-ball foul does not — so
answer the questions and keep answering the rest of the play's as normal.

=== 8. numbers ===
For each player you can name, you may add their jersey number — but only when you can point to a
specific moment where the digits on that jersey were legible to you. Put that in
jersey_number_frame; no frame means you did not read it. Partly-read digits are nothing: "probably
30" is nothing, "3 or 8" is nothing, "#3X" is nothing. Never take a number from the position, the
roster, another player, or an earlier play. No number is the normal answer on wide sideline film,
and the stat still counts under the position.

=== THE FILM ITSELF ===
Also answer once for the whole clip:
- head_contact_flag: did you see a player's head contact another player, the ground or equipment,
  or a player dazed, slow up, or holding their head? Describe what you saw, never a diagnosis.
- ball_tracking / player_attribution / yardage_measurement (0-100): how well could you follow the
  ball, tell the players apart, and measure the gains ON THIS FILM. These rate the FILM, not the
  team, and the app shows them as charting coverage.
- summary: one to three sentences on what the film showed. Quote no totals — the app adds them
  up and will contradict you.

Return ONLY the JSON schema, with no preamble.`
}

export const STATSIQ_FACTS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    plays: { type: Type.ARRAY, items: PLAY_FACTS_SCHEMA },
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
    overall_score: { type: Type.INTEGER },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    drills: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
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
    'plays',
    'position_scores',
    'reasoning',
    'overall_score',
    'strengths',
    'weaknesses',
    'drills',
    'summary',
    'confidence',
    'head_contact_flag',
  ],
}
