import { buildFootballBrain, buildGameTypeContext } from '../football-brain'
import { resolveLevelTier } from '../levels'
import { Type } from '@google/genai'
import type { ModulePromptInput } from '../schemas'

export function buildMISTAKEIQSystemPrompt(input: ModulePromptInput): string {
  const { team, playSequence, coachNote } = input
  const tier = resolveLevelTier(team)
  const jerseyContext = team?.jersey_color
    ? `IDENTIFYING ${team.name ?? 'this team'}: they wear ${team.jersey_color}. Only attribute a mistake to this team's players if you can identify them by that.`
    : `IDENTIFYING ${team?.name ?? 'this team'}: no jersey/helmet color was provided. Do not guess which players belong to them — if you can't tell the two sides apart, say so and describe only what is generically visible instead of attributing mistakes to "the team."`
  const gameTypeContext = buildGameTypeContext(team?.game_type)

  return `${buildFootballBrain(tier, input.evidenceMode)}

You are MISTAKEIQ — Mistake Intelligence.
${team ? `TEAM: ${team.name ?? ''} | ${team.age_group ?? ''}` : ''}
${team?.name ? `Always refer to this team by its exact full name, "${team.name}" — do not shorten, abbreviate, or drop any part of it in your summary or reasoning.` : ''}
${jerseyContext}
${gameTypeContext}
${playSequence?.coach_label ? `PLAY: ${playSequence.coach_label}` : ''}
${coachNote ? `COACH NOTE: ${coachNote}` : ''}

HEAD CONTACT / CONCUSSION CHECK — mandatory for every clip:
Review every frame for a player's head making contact with another player, the ground, or equipment, or a player who appears dazed, slow to get up, or holding their head. Set head_contact_flag.flagged to true if you observe this for ANY player (either team), and describe what was observed (not a diagnosis) in head_contact_flag.note, including which frame(s). If nothing like this is visible, set flagged to false and note "No visible head-contact indicators in this clip."

MISTAKEIQ RUBRIC — Identify game-changing mistakes visible in frames.

Categories: missed_assignment, missed_block, missed_contain, wrong_gap_fit,
bad_pursuit_angle, poor_tackling_leverage, turnover_risk, snap_mesh_issue,
alignment_error, coverage_bust, penalty_risk, poor_effort, clock_situation_error

Return each mistake you identify as an entry in the "mistakes" array with:
- title: short name
- severity: minor | moderate | major | game_changing
- category: one of the categories above
- description: what happened, evidence-based
- likely_impact: what this mistake likely cost or could cost
- correction: one coachable fix — never a live-contact or prohibited drill (see safety rules above)
- drill: (optional) one specific practice drill to install the correction — respect the game-type contact gate
- evidence_frames: which frame indices show the mistake
- confidence: 0.0-1.0
If no mistakes are visible, return an empty mistakes array — never invent one to fill it.

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
    evidence_timestamps: { type: Type.ARRAY, items: { type: Type.NUMBER } },
    head_contact_flag: {
      type: Type.OBJECT,
      properties: {
        flagged: { type: Type.BOOLEAN },
        note: { type: Type.STRING },
      },
      required: ['flagged', 'note'],
    },
    mistakes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          severity: { type: Type.STRING },
          category: { type: Type.STRING },
          description: { type: Type.STRING },
          likely_impact: { type: Type.STRING },
          correction: { type: Type.STRING },
          drill: { type: Type.STRING },
          evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          confidence: { type: Type.NUMBER },
        },
        required: ['title', 'severity', 'category', 'description', 'likely_impact', 'correction', 'confidence'],
      },
    },
  },
  required: ['overall_score', 'position_scores', 'reasoning', 'strengths', 'weaknesses', 'drills', 'summary', 'confidence', 'evidence_frames', 'head_contact_flag', 'mistakes'],
}
