import { Type } from '@google/genai'
import { OFFENSIVE_FORMATIONS, type OffensiveFormation } from './taxonomy'
import { OFFENSIVE_POSITIONS, LEFT_RIGHT_RULE, type OffensivePosition } from './positions'
import { BALL_POSITIONS, type BallPosition } from './defense-structure'

/**
 * What an opponent's OFFENSE did on one snap, charted rather than described.
 *
 * The mirror of defense-structure.ts. ScoutIQ charted the defence snap by snap
 * and left the offence to free-text tendencies, so a report could say "two-high
 * on 41 of 64 snaps" about how to attack a team and only "they like to run
 * outside" about how to stop one. A defensive coordinator plans against counts
 * — formation, run or pass, which way, who gets the ball — so those are asked
 * as closed questions here and every figure is tallied in code
 * (aggregate-offense.ts), never asked of the model.
 */

export const OFFENSIVE_FORMATION_READS = [...OFFENSIVE_FORMATIONS, 'not_visible'] as const
export type OffensiveFormationRead = OffensiveFormation | 'not_visible'

export const QB_ALIGNMENTS = ['under_center', 'shotgun', 'pistol', 'direct_snap_other', 'not_visible'] as const
export type QbAlignment = (typeof QB_ALIGNMENTS)[number]

export const OFFENSIVE_MOTIONS = [
  'none',
  'jet',
  'orbit',
  'short_across',
  'motion_out',
  'shift',
  'other',
  'not_visible',
] as const
export type OffensiveMotion = (typeof OFFENSIVE_MOTIONS)[number]

export const OFFENSIVE_PLAY_TYPES = [
  'inside_run',
  'outside_run',
  'counter_misdirection',
  'option',
  'qb_run',
  'play_action_pass',
  'dropback_pass',
  'quick_pass',
  'screen',
  'trick_play',
  'unclear',
] as const
export type OffensivePlayType = (typeof OFFENSIVE_PLAY_TYPES)[number]

export const RUN_PLAY_TYPES: readonly OffensivePlayType[] = [
  'inside_run',
  'outside_run',
  'counter_misdirection',
  'option',
  'qb_run',
]
export const PASS_PLAY_TYPES: readonly OffensivePlayType[] = [
  'play_action_pass',
  'dropback_pass',
  'quick_pass',
  'screen',
]

export const PLAY_DIRECTIONS = ['left', 'middle', 'right', 'not_visible'] as const
export type PlayDirection = (typeof PLAY_DIRECTIONS)[number]

export const PLAY_RESULTS = [
  'gain',
  'no_gain_or_loss',
  'touchdown',
  'incomplete',
  'interception',
  'fumble_lost',
  'sack',
  'not_visible',
] as const
export type PlayResult = (typeof PLAY_RESULTS)[number]

export const OFFENSIVE_PLAY_TYPE_LABELS: Record<OffensivePlayType, string> = {
  inside_run: 'Inside run',
  outside_run: 'Outside run',
  counter_misdirection: 'Counter / misdirection',
  option: 'Option',
  qb_run: 'QB run',
  play_action_pass: 'Play-action pass',
  dropback_pass: 'Dropback pass',
  quick_pass: 'Quick pass',
  screen: 'Screen',
  trick_play: 'Trick play',
  unclear: 'Unclear',
}

export interface OffensiveSnap {
  formation?: OffensiveFormationRead | null
  qb_alignment?: QbAlignment | null
  motion?: OffensiveMotion | null
  play_type?: OffensivePlayType | null
  /** Where the ball went, from the OFFENSE's own left and right. */
  direction?: PlayDirection | null
  /** Who carried it, or who the pass was thrown to. */
  ball_carrier?: OffensivePosition | null
  result?: PlayResult | null
  /** Measured off the painted yard lines; null when it could not be measured. */
  gain_yards?: number | null
  ball_position?: BallPosition | null
  confidence?: number | null
  evidence_timestamps?: number[] | null
  note?: string | null
}

function onto<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
}

function finiteOrNull(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  // The schema carries gain_yards as text ("12", "-3", "unknown") — see
  // OFFENSIVE_SNAP_SCHEMA. Only a plain number counts as measured.
  if (typeof raw === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(raw)) return parseFloat(raw)
  return null
}

/**
 * Coerces a raw snap onto the vocabularies above. Same policy as
 * normalizeDefensiveSnap: an off-list answer becomes that field's abstention,
 * which every count already excludes, rather than rejecting the clip or
 * inventing a new category with its own percentage.
 */
export function normalizeOffensiveSnap(raw: Record<string, unknown>): OffensiveSnap {
  const carrier = raw.ball_carrier
  return {
    formation: onto(raw.formation, OFFENSIVE_FORMATION_READS, 'not_visible'),
    qb_alignment: onto(raw.qb_alignment, QB_ALIGNMENTS, 'not_visible'),
    motion: onto(raw.motion, OFFENSIVE_MOTIONS, 'not_visible'),
    play_type: onto(raw.play_type, OFFENSIVE_PLAY_TYPES, 'unclear'),
    direction: onto(raw.direction, PLAY_DIRECTIONS, 'not_visible'),
    ball_carrier:
      typeof carrier === 'string' && (OFFENSIVE_POSITIONS as readonly string[]).includes(carrier)
        ? (carrier as OffensivePosition)
        : null,
    result: onto(raw.result, PLAY_RESULTS, 'not_visible'),
    gain_yards: finiteOrNull(raw.gain_yards),
    ball_position: onto(raw.ball_position, BALL_POSITIONS, 'not_determinable'),
    confidence: finiteOrNull(raw.confidence),
    evidence_timestamps: Array.isArray(raw.evidence_timestamps)
      ? raw.evidence_timestamps.filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
      : null,
    note: typeof raw.note === 'string' ? raw.note : null,
  }
}

/**
 * Plain strings, every field required, no enums and nothing nullable — on
 * purpose. Gemini compiles a response schema into a constrained-decoding
 * grammar and refuses one with "too many states for serving"; the SCOUTIQ
 * schema was already near that limit from the defensive chart, and adding
 * these fields as enums (91 more enum values) pushed it over, so EVERY
 * ScoutIQ call failed in production. The allowed values live in the prompt,
 * and normalizeOffensiveSnap maps anything off-list to that field's
 * abstention, so enums here bought nothing the parser does not already do.
 */
export const OFFENSIVE_SNAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    formation: { type: Type.STRING },
    motion: { type: Type.STRING },
    play_type: { type: Type.STRING },
    direction: { type: Type.STRING },
    ball_carrier: { type: Type.STRING },
    result: { type: Type.STRING },
    gain_yards: { type: Type.STRING },
    ball_position: { type: Type.STRING },
  },
  required: ['formation', 'motion', 'play_type', 'direction', 'ball_carrier', 'result', 'gain_yards', 'ball_position'],
}

export function buildOffensiveStructurePrompt(opponentLabel: string): string {
  return `
=== OFFENSIVE STRUCTURE — only on plays where ${opponentLabel} has the BALL ===
offensive_snaps — one entry per snap where ${opponentLabel} is on OFFENSE. Leave it EMPTY on a play
where they are defending. This is what our defensive coordinator plans against, so it is charted
as closed answers and the app does the counting. Every field has a "not visible" or "unclear"
answer and using it is correct — a guessed formation becomes a defensive call built on fiction.

Answer each field with EXACTLY one of the ids listed for it — anything else is discarded.

  formation    — ${opponentLabel}'s formation at the snap: ${OFFENSIVE_FORMATION_READS.join(', ')}.
  motion       — none if nobody moved; jet (full speed across), orbit (across then loops back
                 behind the backfield), short_across (a few steps toward the ball), motion_out
                 (away from the ball toward the sideline), shift (several players reset), other.
  play_type    — one of ${OFFENSIVE_PLAY_TYPES.join(', ')}. What the play WAS, not what it looked like before the snap. A fake handoff
                 followed by a throw is play_action_pass. A run that starts one way and comes
                 back the other is counter_misdirection. qb_run is a designed quarterback run
                 or keeper; a scramble on a pass play is the pass it was.
  direction    — left, middle, right or not_visible: where the ball went. ${LEFT_RIGHT_RULE}
  ball_carrier — who carried it, or who the pass was thrown to: ${OFFENSIVE_POSITIONS.join(', ')}.
                 "unknown" if you cannot tell. Never by jersey number here.
  result       — gain, no_gain_or_loss, touchdown, incomplete, interception, fumble_lost, sack,
                 not_visible.
  gain_yards   — a number as text ("12", "-3"), counted off the painted yard stripes (one every
                 5 yards) from the spot of the snap to where the play ended. "unknown" only when
                 no stripe is readable at both ends.
  ball_position — left_hash, middle or right_hash at the snap, from the offense's perspective.

stop_points — concrete, evidence-based ways to STOP ${opponentLabel}'s offense, ONLY from plays
where they have the ball. Each one: point (what you saw and what our defense should do about it),
category (which part of OUR defensive plan it belongs to), threat (WHAT about their offense it
answers — the id is what counts the same thing across clips, so use the same id for the same
thing however you word it; "other" only when none fits).

key_players — ${opponentLabel}'s playmakers on offense: who gets the ball and hurts people, or a
blocker whose loss of leverage we can exploit. identifier by legible jersey number ONLY when
readable ("Orange #7"), otherwise by position ("Tailback", "Left wingback"). NEVER guess a number.`
}
