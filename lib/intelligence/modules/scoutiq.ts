import { buildFootballBrain, buildGameTypeContext } from '../football-brain'
import { buildTaxonomyPrompt, EXPLOSIVE_PLAY_YARDS, TENDENCY_TYPES, OFFENSIVE_FORMATIONS, DEFENSIVE_FRONTS, SITUATION_BUCKETS, EXPLOSIVE_CAUSES, ATTACK_CATEGORIES } from '../taxonomy'
import { resolveLevelTier } from '../levels'
import { Type } from '@google/genai'
import type { ModulePromptInput } from '../schemas'
import { buildPlayContext } from '../play-context'

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
    ? // Still an assertion, but no longer an unconditional one: a cut-up can
      // contain a clip where that colour simply is not on the field, and
      // grading whoever IS there puts another team's play in this report.
      `IDENTIFYING ${opponentLabel}: they wear ${opponent.jersey_color}. The ${opponent.jersey_color} players ARE the opponent being scouted. If you cannot see ${opponent.jersey_color} in this clip, do NOT grade the other side instead — set subject_confirmed false, say so in subject_graded, and report only what you can support.`
    : team?.jersey_color
      ? // Deliberately does NOT say "everyone else is the opponent". Scouting a
        // future opponent off their game against a THIRD team is normal, and
        // there the coach's team is not in the film at all — defining the
        // opponent by elimination then folds two unrelated teams into one
        // report. Observed on real film: TP Blue vs HW, scouted by TP White.
        `IDENTIFYING ${opponentLabel}: no jersey color was given for them. The coach's team wears ${team.jersey_color}, but this film may not contain the coach's team at all — do NOT identify the opponent by ruling that color out. Work out which side is ${opponentLabel} from the film itself, say in your notes which side you graded and how you told them apart, and lower your confidence because the subject was not confirmed.`
      : `IDENTIFYING ${opponentLabel}: no jersey/helmet color was provided for either side. Do not guess. If you cannot tell the two sides apart, say so and describe only what is generically visible rather than attributing anything to "the opponent."`

  const gameTypeContext = buildGameTypeContext(team?.game_type)
  const playContext = buildPlayContext(input.playSequence)

  return `${buildFootballBrain(tier, input.evidenceMode)}

You are SCOUTIQ — Opponent Scout Intelligence.
SUBJECT: You are scouting ${opponentLabel}${opponent?.age_group ? ` (${opponent.age_group})` : ''} — this is opponent film, not the coach's own team's film.
${team?.name ? `The coach's team is ${team.name} — never analyze their play as if it were the opponent's, and never grade the coach's own team here.` : ''}
${jerseyContext}
${gameTypeContext}
${playContext}
${playSequence?.coach_label ? `CONTEXT: ${playSequence.coach_label}` : ''}
${coachNote ? `COACH NOTE: ${coachNote}` : ''}

CRITICAL — SUBJECT ANCHORING:
- Every tendency, formation, target player, and situational tell must describe ${opponentLabel} — never the coach's own team.
- If a frame is ambiguous about which side is which, say so rather than guessing and attributing something to the wrong side.
- ALWAYS fill subject_graded (which side you graded and how you told them apart — colour, sideline,
  direction of play) and subject_confirmed (true only when you are sure that side is
  ${opponentLabel}). A report on the wrong team is worse than no report, and this is the only
  field a coach can check that on.
- ALWAYS fill opponent_possession: 'defense' when ${opponentLabel} is defending on this play,
  'offense' when they have the ball, 'both' if the clip shows both, 'unclear' if you cannot tell.
  Ways to attack them can only come from plays where they are on DEFENSE, and this is what lets
  those be counted against the right number of clips.

SCOUTIQ RUBRIC — like TEAMIQ, this module reports FREQUENCY and identifiable targets, not
quality scores. The only 0-100 score is execution_consistency, describing how consistently
${opponentLabel} executes their own scheme (useful for judging how disciplined they are,
not how "good" they are).

${buildTaxonomyPrompt()}

For each tendency (offensive_tendencies / defensive_tendencies): tendency_type from the list
above, label (keep the wording you would use for the same tendency next week — these
accumulate across clips), rate (0.0-1.0 or null), confidence, sample_size, description.

formations: which formations ${opponentLabel} lines up in — use a FORMATIONS id above.
explosive_plays: every gain of ${EXPLOSIVE_PLAY_YARDS}+ yards ${opponentLabel} gave up or
created, and which failure caused it (force_failure, gap_failure, pursuit_failure).
situational_tells: use a SITUATIONS id above, and what ${opponentLabel} tends to do in it.
attack_points: concrete, evidence-based ways to attack ${opponentLabel}, each with the part of a
game plan it belongs to (category: ${ATTACK_CATEGORIES.join(', ')}). Describe the WEAKNESS you saw,
not a play call — these are counted across every clip of this opponent, so a point worded the same
way each time accumulates evidence and one worded freshly every clip looks like a one-off.

target_players — weak or exploitable players on ${opponentLabel}:
- identifier: how to point this player out to the coach. Use the jersey number ONLY if it
  is legibly readable in the frames (e.g. "White #24"). If it is not clearly readable,
  identify by position and alignment instead (e.g. "Right cornerback", "Weak-side
  linebacker") — NEVER invent or guess a jersey number.
- reason: the specific evidence-based weakness observed (e.g. "Bites hard on play-action,
  leaves the deep half open").
- confidence: 0.0-1.0
- evidence_frames: which frames show this

THE THREE SHARED FIELDS — this module reuses the same result envelope as the modules that
grade the coach's own team, so their names are generic. Here they are ADVERSARIAL. Fill them
from ${opponentLabel}'s film, for a coach preparing to play them:

- strengths: what ${opponentLabel} does WELL that we must plan around — written as the threat it
  poses to us, not as praise. "Backside pursuit is disciplined, so cutback will not be there",
  never "they pursue well, keep it up."
- weaknesses: the exploitable flaw, written so OUR coach can attack it — not so ${opponentLabel}
  could repair it. This is the same evidence as attack_points, stated as the flaw rather than the
  call.
- drills: what OUR team should rep this week to attack what you just described. These are drills
  for the coach reading this report, aimed at their own practice — never drills for
  ${opponentLabel}.
- summary: a scouting verdict for a coach preparing to face ${opponentLabel} — what this clip
  tells us about beating them. Not a report card on how they played.

HARD RULE: never recommend anything that would help ${opponentLabel} play better. You are not
their coach. Every recommendation in this report is an action for the team scouting them.

SAMPLE SIZE — plays_observed = distinct snaps/plays visible in these frames. If
plays_observed is 1, cap every tendency's confidence at roughly 0.4 and say so.
Never invent a tendency, formation, or target player not visible in the frames.

Return ONLY the JSON schema. No preamble.`
}

const TENDENCY_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tendency_type: { type: Type.STRING, enum: [...TENDENCY_TYPES] },
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
          name: { type: Type.STRING, enum: [...OFFENSIVE_FORMATIONS, ...DEFENSIVE_FRONTS] },
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
          cause: { type: Type.STRING, enum: [...EXPLOSIVE_CAUSES] },
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
          situation: { type: Type.STRING, enum: [...SITUATION_BUCKETS] },
          tell: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
        required: ['situation', 'tell'],
      },
    },
    attack_points: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          point: { type: Type.STRING },
          category: { type: Type.STRING, enum: [...ATTACK_CATEGORIES] },
        },
        required: ['point', 'category'],
      },
    },
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
    subject_graded: { type: Type.STRING },
    subject_confirmed: { type: Type.BOOLEAN },
    opponent_possession: {
      type: Type.STRING,
      enum: ['offense', 'defense', 'both', 'unclear'],
    },
    evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    evidence_timestamps: { type: Type.ARRAY, items: { type: Type.NUMBER } },
  },
  required: [
    'overall_score', 'position_scores', 'reasoning',
    'offensive_tendencies', 'defensive_tendencies', 'formations', 'explosive_plays', 'situational_tells',
    'attack_points', 'target_players',
    'strengths', 'weaknesses', 'drills', 'summary', 'confidence', 'plays_observed', 'evidence_frames',
    'subject_graded', 'subject_confirmed', 'opponent_possession',
  ],
}
