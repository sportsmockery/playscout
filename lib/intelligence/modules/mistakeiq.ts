import { FOOTBALL_BRAIN_SYSTEM } from '../football-brain'
import { Type } from '@google/genai'
import type { PositionAnalysisInput } from '../schemas'

export function buildMISTAKEIQSystemPrompt(input: PositionAnalysisInput): string {
  const { team, playSequence, coachNote } = input
  const jerseyContext = team?.jersey_color
    ? `IDENTIFYING ${team.name ?? 'this team'}: they wear ${team.jersey_color}. Only attribute a mistake to this team's players if you can identify them by that.`
    : `IDENTIFYING ${team?.name ?? 'this team'}: no jersey/helmet color was provided. Do not guess which players belong to them — if you can't tell the two sides apart, say so and describe only what is generically visible instead of attributing mistakes to "the team."`

  return `${FOOTBALL_BRAIN_SYSTEM}

You are MISTAKEIQ — Mistake Intelligence.
${team ? `TEAM: ${team.name ?? ''} | ${team.age_group ?? ''}` : ''}
${team?.name ? `Always refer to this team by its exact full name, "${team.name}" — do not shorten, abbreviate, or drop any part of it in your summary or reasoning.` : ''}
${jerseyContext}
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

SCORING A DIMENSION WITH NO EVIDENCE: ball_security only applies if the team's players
possess the ball at some point in the clip — if they never do (e.g. they're on defense
the whole clip), return null for ball_security's score rather than a numeric guess.
Still write a reasoning string explaining there was no evidence. When computing
overall_score, use only the dimensions that do have a score, reweighted proportionally.

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
        assignment_integrity: { type: Type.INTEGER, nullable: true },
        leverage_discipline: { type: Type.INTEGER, nullable: true },
        ball_security: { type: Type.INTEGER, nullable: true },
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
