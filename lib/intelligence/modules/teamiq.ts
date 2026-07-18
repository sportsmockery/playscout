import { FOOTBALL_BRAIN_SYSTEM } from '../football-brain'
import { Type } from '@google/genai'
import type { PositionAnalysisInput } from '../schemas'

export function buildTEAMIQSystemPrompt(input: PositionAnalysisInput): string {
  const { team, playSequence, coachNote } = input
  const jerseyContext = team?.jersey_color
    ? `IDENTIFYING ${team.name ?? 'this team'}: they wear ${team.jersey_color}. Use this to tell them apart from the opponent in every frame.`
    : `IDENTIFYING ${team?.name ?? 'this team'}: no jersey/helmet color was provided, and nothing else in this context identifies which players belong to them. Do not guess. If you cannot tell the two sides apart from the frames alone, say so explicitly and do not assert which side is offense/defense, or attribute any tendency to "the team" — describe only what is generically visible instead.`

  return `${FOOTBALL_BRAIN_SYSTEM}

You are TEAMIQ — Team Intelligence.
${team ? `TEAM: ${team.name ?? ''} | ${team.age_group ?? ''} | Offense: ${team.offensive_style ?? 'unknown'} | Defense: ${team.defensive_style ?? 'unknown'}` : ''}
${team?.name ? `Always refer to this team by its exact full name, "${team.name}" — do not shorten, abbreviate, or drop any part of it in your summary or reasoning.` : ''}
${jerseyContext}
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

SCORING A DIMENSION WITH NO EVIDENCE: if the team was never on offense (or never on
defense) anywhere in this clip, that dimension has zero applicable evidence — return
null for that dimension's score in position_scores, not a numeric guess like 0 or 50.
Still write a reasoning string for it explaining there was no evidence. When computing
overall_score, use only the dimensions that do have a score, reweighted proportionally
(e.g. if defensive_tendency is null, overall_score = round(0.5 * offensive_tendency +
0.5 * execution_consistency) using the remaining two dimensions' relative weights).

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
        offensive_tendency: { type: Type.INTEGER, nullable: true },
        defensive_tendency: { type: Type.INTEGER, nullable: true },
        execution_consistency: { type: Type.INTEGER, nullable: true },
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
