import { buildFootballBrain, buildGameTypeContext } from '../football-brain'
import { resolveLevelTier } from '../levels'
import { Type } from '@google/genai'
import type { ModulePromptInput } from '../schemas'

/**
 * ScoutIQ Stage 1 (System B, per-clip) — scouts an OPPONENT's film. Unlike
 * every other module, the analysis subject here is the opponent, not the
 * coach's own team: `opponent` is who gets graded/tendency-tracked, `team`
 * is context only (used for jersey-color disambiguation and later, in Stage
 * 2, for building a game plan matched to the coach's own personnel).
 */
export function buildSCOUTIQSystemPrompt(input: ModulePromptInput): string {
  const { team, opponent, playSequence, coachNote } = input
  const tier = resolveLevelTier(team)
  const opponentLabel = opponent?.name ?? 'the opponent'

  const jerseyContext = opponent?.jersey_color
    ? `IDENTIFYING ${opponentLabel}: they wear ${opponent.jersey_color}. The ${opponent.jersey_color} players ARE the opponent being scouted.`
    : team?.jersey_color
      ? `IDENTIFYING ${opponentLabel}: no opponent jersey color was given, but the coach's own team (${team.name ?? 'this team'}) wears ${team.jersey_color} — everyone else in the frame is the opponent.`
      : `IDENTIFYING ${opponentLabel}: no jersey/helmet color was provided for either side. Do not guess. If you cannot tell the two sides apart, say so and describe only what is generically visible rather than attributing anything to "the opponent."`

  const gameTypeContext = buildGameTypeContext(team?.game_type)

  return `${buildFootballBrain(tier, input.evidenceMode)}

You are SCOUTIQ — Opponent Scout Intelligence.
SUBJECT: You are scouting ${opponentLabel}${opponent?.age_group ? ` (${opponent.age_group})` : ''} — this is opponent film, not the coach's own team's film.
${team?.name ? `The coach's team is ${team.name} — never analyze their play as if it were the opponent's, and never grade the coach's own team here.` : ''}
${jerseyContext}
${gameTypeContext}
${playSequence?.coach_label ? `CONTEXT: ${playSequence.coach_label}` : ''}
${coachNote ? `COACH NOTE: ${coachNote}` : ''}

CRITICAL — SUBJECT ANCHORING:
- Every tendency, formation, target player, and situational tell must describe ${opponentLabel} — never the coach's own team.
- If a frame is ambiguous about which side is which, say so rather than guessing and attributing something to the wrong side.

SCOUTIQ RUBRIC — like TEAMIQ, this module reports FREQUENCY and identifiable targets, not
quality scores. The only 0-100 score is execution_consistency, describing how consistently
${opponentLabel} executes their own scheme (useful for judging how disciplined they are,
not how "good" they are).

For each tendency (offensive_tendencies / defensive_tendencies), use one of:
  Offense: formation_frequency, run_direction, play_family, motion_frequency, down_distance_tendency
  Defense: front, coverage_shell, blitz_tendency, edge_setting, pursuit_angle
Each: label, rate (0.0-1.0 or null), confidence, sample_size, description — same format as TEAMIQ.

formations: distinct formations ${opponentLabel} lines up in.
explosive_plays: any big play ${opponentLabel} gave up or created, and the cause.
situational_tells: what ${opponentLabel} tends to do in specific situations (3rd-and-short, red zone, etc).
attack_points: concrete, evidence-based things about ${opponentLabel} an opponent (the coach's team) could exploit.

target_players — weak or exploitable players on ${opponentLabel}:
- identifier: how to point this player out to the coach. Use the jersey number ONLY if it
  is legibly readable in the frames (e.g. "White #24"). If it is not clearly readable,
  identify by position and alignment instead (e.g. "Right cornerback", "Weak-side
  linebacker") — NEVER invent or guess a jersey number.
- reason: the specific evidence-based weakness observed (e.g. "Bites hard on play-action,
  leaves the deep half open").
- confidence: 0.0-1.0
- evidence_frames: which frames show this

SAMPLE SIZE — plays_observed = distinct snaps/plays visible in these frames. If
plays_observed is 1, cap every tendency's confidence at roughly 0.4 and say so.
Never invent a tendency, formation, or target player not visible in the frames.

Return ONLY the JSON schema. No preamble.`
}

const TENDENCY_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tendency_type: { type: Type.STRING },
    label: { type: Type.STRING },
    rate: { type: Type.NUMBER, nullable: true },
    confidence: { type: Type.NUMBER },
    sample_size: { type: Type.INTEGER },
    description: { type: Type.STRING },
  },
  required: ['tendency_type', 'label', 'rate', 'confidence', 'sample_size', 'description'],
}

export const SCOUTIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: {
      type: Type.OBJECT,
      properties: {
        execution_consistency: { type: Type.INTEGER, nullable: true },
      },
      required: ['execution_consistency'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        execution_consistency: { type: Type.STRING },
      },
      required: ['execution_consistency'],
    },
    offensive_tendencies: { type: Type.ARRAY, items: TENDENCY_ITEM_SCHEMA },
    defensive_tendencies: { type: Type.ARRAY, items: TENDENCY_ITEM_SCHEMA },
    formations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          side: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ['name'],
      },
    },
    explosive_plays: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cause: { type: Type.STRING },
          description: { type: Type.STRING },
          evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        },
        required: ['cause', 'description'],
      },
    },
    situational_tells: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          situation: { type: Type.STRING },
          tell: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
        required: ['situation', 'tell'],
      },
    },
    attack_points: { type: Type.ARRAY, items: { type: Type.STRING } },
    target_players: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          identifier: { type: Type.STRING },
          reason: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        },
        required: ['identifier', 'reason', 'confidence'],
      },
    },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    drills: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    plays_observed: { type: Type.INTEGER },
    evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    evidence_timestamps: { type: Type.ARRAY, items: { type: Type.NUMBER } },
  },
  required: [
    'overall_score', 'position_scores', 'reasoning',
    'offensive_tendencies', 'defensive_tendencies', 'formations', 'explosive_plays', 'situational_tells',
    'attack_points', 'target_players',
    'strengths', 'weaknesses', 'drills', 'summary', 'confidence', 'plays_observed', 'evidence_frames',
  ],
}
