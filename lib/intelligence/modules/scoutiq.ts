import { buildFootballBrain, buildGameTypeContext } from '../football-brain'
import { buildTaxonomyPrompt, EXPLOSIVE_PLAY_YARDS, TENDENCY_TYPES, OFFENSIVE_FORMATIONS, DEFENSIVE_FRONTS, SITUATION_BUCKETS, EXPLOSIVE_CAUSES, ATTACK_CATEGORIES, WEAKNESS_TYPES, WEAKNESS_TYPE_LABELS } from '../taxonomy'
import { resolveLevelTier } from '../levels'
import { Type } from '@google/genai'
import type { ModulePromptInput } from '../schemas'
import { buildPlayContext } from '../play-context'
import {
  COVERAGE_SHELLS,
  COVERAGES,
  SAFETY_ROTATIONS,
  STRENGTH_DECLARATIONS,
  LEVERAGES,
  PRESSURE_LOOKS,
  PRESNAP_TELL_KINDS,
  BALL_POSITIONS,
  FIELD_SIDES,
  DEFENDER_ALIGNMENTS,
  DEFENDER_ACTIONS,
  buildDefensiveStructurePrompt,
} from '../defense-structure'
import { DEFENSIVE_POSITIONS, OFFENSIVE_POSITIONS } from '../positions'

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
- ALWAYS fill opponent_possession, and WORK IT OUT FROM THE SNAP rather than from impression.
  Measured on real film: this flipped on a third of runs of the same clip, and it gates the whole
  report — every way to attack ${opponentLabel} comes from a play where they are DEFENDING, so a
  wrong answer here discards a good read of the right team or files the wrong team's structure
  under their name.

  The procedure, in this order:
  1. Find the BALL at the moment it is snapped, and the player who receives it.
  2. That player and the linemen in a stance directly in front of him are the OFFENSE. Everyone
     facing them is the DEFENSE. This is the only thing that decides it.
  3. Read the OFFENSE's jersey colour.
  4. If the offense is ${opponentLabel}, answer 'offense'. If the offense is the other team, then
     ${opponentLabel} is defending — answer 'defense'.

  Do NOT decide it from which way the play travels, which sideline the camera sits on, which team
  fills more of the frame, which bench is nearer, or which team you were told to scout. None of
  those tell you who snapped the ball. If you cannot find the snap — the clip starts late, the
  ball is hidden — answer 'unclear' rather than guessing; an 'unclear' costs one clip, a wrong
  answer corrupts the report.

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
not a play call.

Each attack point also carries a "weakness" id saying WHAT is wrong. Every clip of this opponent is
counted together, and the id is what does the counting — so two clips seeing the same problem must
use the same id even when you describe it in different words. Pick the one that fits best; use
"other" only when none of them describes what you saw:
${WEAKNESS_TYPES.map((w) => `- ${w}: ${WEAKNESS_TYPE_LABELS[w]}`).join('\n')}

Do NOT file "I could not tell" as an attack point. A clip where nothing was readable contributes no
attack points at all — that is a real and useful answer, and inventing a weakness to fill the list
is worse than a short list.

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

${buildDefensiveStructurePrompt(opponentLabel)}

SAMPLE SIZE — plays_observed = distinct snaps/plays visible in these frames. If
plays_observed is 1, cap every tendency's confidence at roughly 0.4 and say so.
Never invent a tendency, formation, or target player not visible in the frames.

Return ONLY the JSON schema. No preamble.`
}

/**
 * One charted defensive snap. Optional in `required` on purpose: the block is
 * left out entirely on a play where the opponent has the BALL, and a schema
 * that demanded it would force the model to invent a coverage for a snap its
 * own defence was not on the field for.
 */
const DEFENDER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    position: { type: Type.STRING, enum: [...DEFENSIVE_POSITIONS] },
    alignment: { type: Type.STRING, enum: [...DEFENDER_ALIGNMENTS] },
    depth_yards: { type: Type.NUMBER, nullable: true },
    side: { type: Type.STRING, enum: ['field', 'boundary', 'middle', 'not_visible'] },
    action: { type: Type.STRING, enum: [...DEFENDER_ACTIONS] },
    covering: { type: Type.STRING, enum: [...OFFENSIVE_POSITIONS], nullable: true },
    note: { type: Type.STRING, nullable: true },
  },
  required: ['position', 'alignment', 'action'],
}

const DEFENSIVE_SNAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // The load-bearing field. Shell, coverage, rotation and pressure are all
    // computed from these rows; the scalar answers below are a fallback for a
    // clip where too few players were visible to chart.
    defenders: { type: Type.ARRAY, items: DEFENDER_SCHEMA },
    presnap_shell: { type: Type.STRING, enum: [...COVERAGE_SHELLS] },
    coverage_played: { type: Type.STRING, enum: [...COVERAGES] },
    safety_rotation: { type: Type.STRING, enum: [...SAFETY_ROTATIONS] },
    strength_declared: { type: Type.STRING, enum: [...STRENGTH_DECLARATIONS] },
    ball_position: { type: Type.STRING, enum: [...BALL_POSITIONS] },
    field_side: { type: Type.STRING, enum: [...FIELD_SIDES] },
    field_safety_depth: { type: Type.NUMBER, nullable: true },
    boundary_safety_depth: { type: Type.NUMBER, nullable: true },
    corner_leverage_field: { type: Type.STRING, enum: [...LEVERAGES], nullable: true },
    corner_leverage_boundary: { type: Type.STRING, enum: [...LEVERAGES], nullable: true },
    box_count: { type: Type.INTEGER, nullable: true },
    pressure_look: { type: Type.STRING, enum: [...PRESSURE_LOOKS] },
    blitz_came_from: { type: Type.STRING, nullable: true },
    presnap_tells: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, enum: [...PRESNAP_TELL_KINDS] },
          observation: { type: Type.STRING },
          followed_by: { type: Type.STRING, nullable: true },
          confidence: { type: Type.NUMBER },
        },
        required: ['kind', 'observation'],
      },
    },
    confidence: { type: Type.NUMBER },
    evidence_timestamps: { type: Type.ARRAY, items: { type: Type.NUMBER } },
    note: { type: Type.STRING, nullable: true },
  },
  required: ['presnap_shell', 'coverage_played', 'pressure_look', 'confidence'],
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
          // WHAT is wrong, as a closed id. The prose carries the detail; this
          // carries the count, because counting prose does not work — see
          // WEAKNESS_TYPES.
          weakness: { type: Type.STRING, enum: [...WEAKNESS_TYPES] },
        },
        required: ['point', 'category', 'weakness'],
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
    defensive_snaps: { type: Type.ARRAY, items: DEFENSIVE_SNAP_SCHEMA },
  },
  required: [
    'overall_score', 'position_scores', 'reasoning',
    'offensive_tendencies', 'defensive_tendencies', 'formations', 'explosive_plays', 'situational_tells',
    'attack_points', 'target_players',
    'strengths', 'weaknesses', 'drills', 'summary', 'confidence', 'plays_observed', 'evidence_frames',
    'subject_graded', 'subject_confirmed', 'opponent_possession',
  ],
}
