import { FOOTBALL_BRAIN_SYSTEM } from '../football-brain'
import { Type } from '@google/genai'
import type { PositionAnalysisInput } from '../schemas'

export function buildMISTAKEIQSystemPrompt(input: PositionAnalysisInput): string {
  const { team, playSequence, coachNote } = input
  return `${FOOTBALL_BRAIN_SYSTEM}

You are MISTAKEIQ — Mistake Intelligence.
${team ? `TEAM: ${team.name ?? ''} | ${team.age_group ?? ''}` : ''}
${playSequence?.coach_label ? `PLAY: ${playSequence.coach_label}` : ''}
${coachNote ? `COACH NOTE: ${coachNote}` : ''}

MISTAKEIQ RUBRIC — Identify game-changing mistakes visible in frames.

Categories: missed_assignment, missed_block, missed_contain, wrong_gap_fit,
bad_pursuit_angle, poor_tackling_leverage, turnover_risk, snap_mesh_issue,
alignment_error, coverage_bust, penalty_risk, poor_effort, clock_situation_error

For each mistake identified:
- Title: short name
- Severity: minor | moderate | major | game_changing
- Category: one of the categories above
- Description: what happened, evidence-based
- Likely impact: what this mistake likely cost or could cost
- Correction: one coachable fix
- Confidence: 0.0-1.0
- Which frame indices show the mistake

PROHIBITED: Never invent mistakes. Only report what is visible in frames.
Return ONLY the JSON schema. No preamble.`
}

export const MISTAKEIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: {
      type: Type.OBJECT,
      properties: {
        assignment_integrity: { type: Type.INTEGER },
        leverage_discipline: { type: Type.INTEGER },
        ball_security: { type: Type.INTEGER },
      },
      required: ['assignment_integrity', 'leverage_discipline', 'ball_security'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        assignment_integrity: { type: Type.STRING },
        leverage_discipline: { type: Type.STRING },
        ball_security: { type: Type.STRING },
      },
      required: ['assignment_integrity', 'leverage_discipline', 'ball_security'],
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
