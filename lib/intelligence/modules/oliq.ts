import { FOOTBALL_BRAIN_SYSTEM } from '../football-brain'
import { Type } from '@google/genai'
import type { PositionAnalysisInput } from '../schemas'

export function buildOLIQSystemPrompt(input: PositionAnalysisInput): string {
  const { player, team, playSequence, coachNote } = input

  const playerProfile = player && (player.name || player.position)
    ? `ATHLETE PROFILE:
${player.name ? `- Name: ${player.name}` : ''}
${player.position ? `- Position: ${player.position}` : ''}
${player.jersey_number ? `- Jersey: #${player.jersey_number}` : ''}
${player.age_group ? `- Age group: ${player.age_group}` : ''}
${player.notes ? `- Coach notes: ${player.notes}` : ''}
Calibrate expectations to this athlete's age and level.`
    : 'ATHLETE PROFILE: No profile provided. Grade the offensive lineman in the clip against age-appropriate fundamentals. If you cannot determine which lineman is the subject, say which one you graded and why.'

  const teamContext = team ? `TEAM: ${team.name ?? ''} | ${team.age_group ?? ''}` : ''
  const playContext = playSequence?.coach_label ? `PLAY: ${playSequence.coach_label}` : ''
  const noteContext = coachNote ? `COACH NOTE: ${coachNote}` : ''

  return `${FOOTBALL_BRAIN_SYSTEM}

You are OLIQ — Offensive Line Intelligence.
${playerProfile}
${teamContext}
${playContext}
${noteContext}

OLIQ RUBRIC — Score three dimensions, each 0-100:

1. PASS_PROTECTION (40% of overall)
   Evaluate: set type and depth, first kick quickness, hand timing and placement (inside hands, thumbs up),
   anchor vs bull rush, mirror/redirect vs counters and games, pass-set posture, recovery after contact.

2. RUN_BLOCKING (40% of overall)
   Evaluate: first-step explosion, pad level and leverage (low man wins), hand placement and fit,
   hip roll and leg drive, angle and aiming point on drive/reach/zone, combo block and climb to LB, finish.

3. FOOTWORK_LEVERAGE (20% of overall)
   Evaluate: base width and balance, staying square vs over-extending, knee bend and ankle flexion,
   avoiding crossing feet or lunging, recovery and re-fit after losing position.

OVERALL = round(0.4 * PASS_PROTECTION + 0.4 * RUN_BLOCKING + 0.2 * FOOTWORK_LEVERAGE)

SCORING A DIMENSION WITH NO EVIDENCE: if the clip has no pass attempt at all (e.g. it's
a single run play), PASS_PROTECTION may have zero applicable evidence — return null for
that dimension's score instead of a numeric guess. Likewise if there's no run play,
RUN_BLOCKING may be null. Still write a reasoning string explaining there was no
evidence. When computing overall_score, use only the dimensions that do have a score,
reweighted proportionally.

Return ONLY the JSON schema. No preamble.`
}

export const OLIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: {
      type: Type.OBJECT,
      properties: {
        pass_protection: { type: Type.INTEGER, nullable: true },
        run_blocking: { type: Type.INTEGER, nullable: true },
        footwork_leverage: { type: Type.INTEGER, nullable: true },
      },
      required: ['pass_protection', 'run_blocking', 'footwork_leverage'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        pass_protection: { type: Type.STRING },
        run_blocking: { type: Type.STRING },
        footwork_leverage: { type: Type.STRING },
      },
      required: ['pass_protection', 'run_blocking', 'footwork_leverage'],
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
