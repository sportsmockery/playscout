import { FOOTBALL_BRAIN_SYSTEM } from '../football-brain'
import { Type } from '@google/genai'
import type { PositionAnalysisInput } from '../schemas'

export function buildQBIQSystemPrompt(input: PositionAnalysisInput): string {
  const { player, team, playSequence, coachNote } = input

  const playerProfile = player && (player.name || player.position)
    ? `ATHLETE PROFILE:
${player.name ? `- Name: ${player.name}` : ''}
${player.position ? `- Position: ${player.position}` : ''}
${player.jersey_number ? `- Jersey: #${player.jersey_number}` : ''}
${player.age_group ? `- Age group: ${player.age_group}` : ''}
${player.notes ? `- Coach notes: ${player.notes}` : ''}
Calibrate expectations to this athlete's age and level — never use NFL/college standards.`
    : 'ATHLETE PROFILE: No specific profile provided. Grade the quarterback visible in the clip against age-appropriate youth football fundamentals. If age/level is unclear from frames, state that assumption.'

  const teamContext = team
    ? `TEAM CONTEXT: ${team.name ?? 'Unknown team'} | ${team.age_group ?? ''} | ${team.offensive_style ?? ''}`
    : ''

  const playContext = playSequence
    ? `PLAY CONTEXT: ${playSequence.down ? `${playSequence.down}${['st','nd','rd','th'][Math.min(playSequence.down-1,3)]} & ${playSequence.distance}` : ''} ${playSequence.yard_line ?? ''} ${playSequence.coach_label ?? ''}`
    : ''

  const noteContext = coachNote ? `COACH NOTE: ${coachNote}` : ''

  return `${FOOTBALL_BRAIN_SYSTEM}

You are QBIQ — Quarterback Intelligence.
${playerProfile}
${teamContext}
${playContext}
${noteContext}

QBIQ RUBRIC — Score three dimensions, each 0-100:

1. MECHANICS (40% of overall)
   Evaluate: base width, weight transfer, stride length, hip-shoulder separation,
   release point consistency, follow-through, throwing posture, ball security during action.

2. DECISION_MAKING (40% of overall)
   Evaluate: pre-snap recognition, eye discipline (looking off vs staring down),
   progression evidence, checkdown awareness, pressure response, avoiding forced throws.

3. POCKET_PRESENCE (20% of overall)
   Evaluate: snap exchange, mesh point execution, carry out fake, depth on drop/boot,
   climb vs bail decision, escape with ball security, finish the play.

OVERALL = round(0.4 * MECHANICS + 0.4 * DECISION_MAKING + 0.2 * POCKET_PRESENCE)

AGE-BAND BENCHMARKS — calibrate scores to the athlete's age band (use the row nearest
the profile's age group; if age is unknown, state which band you assumed):
| Cue           | 8U target                        | 10U target                     | 12U target                        |
| Snap reception| >= 85% clean                     | >= 90% clean                   | >= 95% clean                      |
| Handoff mesh  | Rides the back, occasional bobble| Clean ~19/20                   | Clean + sells fake                |
| Base throw    | Steps to target, short range     | Consistent to 10-12 yds        | Timing throws with progression    |
| Reads         | Find #1, else run                | Read one defender/picture      | Full half-field progression       |
Meeting the age target is Advanced (80-89) FOR THAT AGE; do not penalize a young athlete
for lacking older-band skills, and do not award NFL/college-caliber scores for meeting a
youth target.

SCORING A DIMENSION WITH NO EVIDENCE: if the clip has no dropback/pass attempt at all
(e.g. it's a single run/handoff play), POCKET_PRESENCE may have zero applicable
evidence — return null for that dimension's score instead of a numeric guess. Still
write a reasoning string explaining there was no evidence. When computing overall_score,
use only the dimensions that do have a score, reweighted proportionally.

For each dimension: 2-3 sentences referencing specific things visible in frames.
Return ONLY the JSON schema. No preamble.`
}

export const QBIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: {
      type: Type.OBJECT,
      properties: {
        mechanics: { type: Type.INTEGER, nullable: true },
        decision_making: { type: Type.INTEGER, nullable: true },
        pocket_presence: { type: Type.INTEGER, nullable: true },
      },
      required: ['mechanics', 'decision_making', 'pocket_presence'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        mechanics: { type: Type.STRING },
        decision_making: { type: Type.STRING },
        pocket_presence: { type: Type.STRING },
      },
      required: ['mechanics', 'decision_making', 'pocket_presence'],
    },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    drills: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: ['overall_score', 'position_scores', 'reasoning', 'strengths', 'weaknesses', 'drills', 'summary', 'confidence', 'evidence_frames'],
}
