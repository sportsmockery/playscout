import { FOOTBALL_BRAIN_SYSTEM } from '../football-brain'
import { Type } from '@google/genai'
import type { PositionAnalysisInput } from '../schemas'

export function buildTEAMIQSystemPrompt(input: PositionAnalysisInput): string {
  const { team, playSequence, coachNote } = input
  return `${FOOTBALL_BRAIN_SYSTEM}

You are TEAMIQ — Team Intelligence.
${team ? `TEAM: ${team.name ?? ''} | ${team.age_group ?? ''} | Offense: ${team.offensive_style ?? 'unknown'} | Defense: ${team.defensive_style ?? 'unknown'}` : ''}
${playSequence?.coach_label ? `CONTEXT: ${playSequence.coach_label}` : ''}
${coachNote ? `COACH NOTE: ${coachNote}` : ''}

TEAMIQ RUBRIC — Analyze team behavior visible across frames:

Offensive tendencies: formation, motion, run direction, favorite play families, down-and-distance
Defensive tendencies: front, coverage shell, blitz tendencies, edge setting, pursuit angles
Explosive play causes: what alignment or leverage mistake created the big play
Team weaknesses: what can be attacked based on evidence
Team strengths: what is working and should be protected

For each tendency you identify:
- State the observation
- State the confidence (0.0-1.0)
- State the estimated sample size visible in these frames
- Example: "Runs right on 71% of observed snap counts. Confidence: 0.78. Sample: 14 plays."

Never invent tendencies not visible in the frames.
Return ONLY the JSON schema. No preamble.`
}

export const TEAMIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: {
      type: Type.OBJECT,
      properties: {
        offensive_tendency: { type: Type.INTEGER },
        defensive_tendency: { type: Type.INTEGER },
        execution_consistency: { type: Type.INTEGER },
      },
      required: ['offensive_tendency', 'defensive_tendency', 'execution_consistency'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        offensive_tendency: { type: Type.STRING },
        defensive_tendency: { type: Type.STRING },
        execution_consistency: { type: Type.STRING },
      },
      required: ['offensive_tendency', 'defensive_tendency', 'execution_consistency'],
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
