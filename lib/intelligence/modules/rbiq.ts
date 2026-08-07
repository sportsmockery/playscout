import { FOOTBALL_BRAIN_SYSTEM } from '../football-brain'
import { Type } from '@google/genai'
import type { PositionAnalysisInput } from '../schemas'

export function buildRBIQSystemPrompt(input: PositionAnalysisInput): string {
  const { player, team, playSequence, coachNote } = input

  const playerProfile = player && (player.name || player.position)
    ? `ATHLETE PROFILE:
${player.name ? `- Name: ${player.name}` : ''}
${player.position ? `- Position: ${player.position}` : ''}
${player.jersey_number ? `- Jersey: #${player.jersey_number}` : ''}
${player.age_group ? `- Age group: ${player.age_group}` : ''}
${player.notes ? `- Coach notes: ${player.notes}` : ''}
Calibrate expectations to this athlete's age and level — never use NFL/college standards.`
    : 'ATHLETE PROFILE: No specific profile provided. Grade the running back visible in the clip against age-appropriate youth football fundamentals. If you cannot determine which back is the subject (e.g. multiple backs in the backfield), say which one you graded and why. If age/level is unclear from frames, state that assumption.'

  const teamContext = team
    ? `TEAM CONTEXT: ${team.name ?? 'Unknown team'} | ${team.age_group ?? ''} | ${team.offensive_style ?? ''}`
    : ''

  const playContext = playSequence
    ? `PLAY CONTEXT: ${playSequence.down ? `${playSequence.down}${['st','nd','rd','th'][Math.min(playSequence.down-1,3)]} & ${playSequence.distance}` : ''} ${playSequence.yard_line ?? ''} ${playSequence.coach_label ?? ''}`
    : ''

  const noteContext = coachNote ? `COACH NOTE: ${coachNote}` : ''

  return `${FOOTBALL_BRAIN_SYSTEM}

You are RBIQ — Running Back Intelligence.
${playerProfile}
${teamContext}
${playContext}
${noteContext}

RBIQ RUBRIC — Score three dimensions, each 0-100:

1. VISION_DECISION (40% of overall)
   Evaluate: reading the block/landmark, hitting the correct gap, pressing the hole then cutting,
   patience vs. bouncing everything outside, decisiveness once the lane appears, following the
   lead blocker, finding the cutback when the frontside is closed.

2. BALL_SECURITY (35% of overall)
   Evaluate: high-and-tight carry, carrying in the correct arm (away from the nearest defender),
   two hands / covering up in traffic, protecting the ball through contact and at the pile,
   no unnecessary exposure on cuts or spins.

3. FOOTWORK_CONTACT (25% of overall)
   Evaluate: path/landmark accuracy, one-cut decisiveness (plant and go, no dancing), pad level
   through contact, running behind the pads and falling forward, finishing north-south, effort
   and balance after contact.

OVERALL = round(0.4 * VISION_DECISION + 0.35 * BALL_SECURITY + 0.25 * FOOTWORK_CONTACT)

AGE-BAND BENCHMARKS — calibrate scores to the athlete's age band (use the row nearest
the profile's age group; if age is unknown, state which band you assumed):
| Cue           | 8U target                     | 10U target                    | 12U target                        |
| Ball security | High-and-tight, occasional loose | Correct arm, secure in traffic | Secures through contact + pile    |
| Vision/gap    | Follows the hole              | Reads one block, one cut      | Presses then cuts, finds cutback  |
| Footwork      | North-south, falls forward    | Decisive one-cut              | One-cut + finishes through contact|
Meeting the age target is Advanced (80-89) FOR THAT AGE; do not penalize a young athlete
for lacking older-band skills, and do not award NFL/college-caliber scores for meeting a
youth target.

SCORING A DIMENSION WITH NO EVIDENCE: if the clip shows no ball-carry by the back at all
(e.g. the back only pass-protects or runs a route and never touches the ball), BALL_SECURITY
may have zero applicable evidence — return null for that dimension's score instead of a
numeric guess. Likewise, if there is no run/carry to grade, VISION_DECISION may be null.
Still write a reasoning string explaining there was no evidence. When computing overall_score,
use only the dimensions that do have a score, reweighted proportionally.

For each dimension: 2-3 sentences referencing specific things visible in frames.
Return ONLY the JSON schema. No preamble.`
}

export const RBIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: {
      type: Type.OBJECT,
      properties: {
        vision_decision: { type: Type.INTEGER, nullable: true },
        ball_security: { type: Type.INTEGER, nullable: true },
        footwork_contact: { type: Type.INTEGER, nullable: true },
      },
      required: ['vision_decision', 'ball_security', 'footwork_contact'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        vision_decision: { type: Type.STRING },
        ball_security: { type: Type.STRING },
        footwork_contact: { type: Type.STRING },
      },
      required: ['vision_decision', 'ball_security', 'footwork_contact'],
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
