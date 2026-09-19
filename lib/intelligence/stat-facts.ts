import { Type } from '@google/genai'
import {
  OFFENSIVE_POSITIONS,
  DEFENSIVE_POSITIONS,
  UNKNOWN_POSITION,
  normalizeStatPosition,
} from './positions'
import { OFFENSIVE_FORMATIONS, DEFENSIVE_FRONTS } from './taxonomy'
import {
  YARDS_BASES,
  PENALTY_TYPES,
  PENALTY_ENFORCEMENTS,
  PENALTY_TIMINGS,
  type RawStatPlay,
  type RawStatCredit,
} from './stat-lines'
import { MISTAKE_CATEGORIES } from './schemas'

/**
 * StatsIQ charting, rebuilt as closed questions.
 *
 * WHY THIS EXISTS, and it is one measurement rather than a preference.
 *
 * The module reads every clip twice: a charting prompt that renders to ~25,700
 * characters and asks for a free list of stat credits, and a short prompt
 * (stat-verify.ts, ~8,500) that asks six closed questions. Across nine runs on
 * the two clips whose truth the coach gave us, the charting read got the play
 * right ONCE. The closed-question read was right EVERY time it answered —
 * including three times out of three on the clip where charting returned an
 * interception that the film does not contain.
 *
 * The difference between those two prompts is not the model, the sample rate,
 * the resolution or the jersey colour. All three of those were swept and none
 * of them moved it. The difference is the SHAPE OF THE ASK: one says "chart
 * this play", the other says "was the ball in the air, yes or no".
 *
 * So this module asks the charting pass closed questions too, and assembles the
 * credits here. That is the same division of labour the rest of the module
 * already runs on — stat-lines.ts does every sum, player-grades.ts computes
 * every grade, scoring.ts computes every score — extended one step earlier, to
 * the point where the credits are built rather than where they are added up.
 *
 * What moves from the prompt into code, and what each move buys:
 *
 * - PAIRING. "A completed pass produces exactly one pass_complete and exactly
 *   one reception with the same yards on both" was four lines of prompt and a
 *   downstream cross-check looking for sheets that broke it. Here a completion
 *   emits both credits from one answer, so the sheet cannot disagree with
 *   itself about a play it read correctly.
 * - THE CARRY RULE. "Did the ball change hands after the snap?" was a paragraph
 *   of reasoning the model had to perform and then act on. Now it answers the
 *   question and `carrierOf` applies the rule.
 * - SOLO VERSUS ASSISTED. "NEVER credit a tackle AND an assisted_tackle for the
 *   same stop" is a constraint no model should have to hold: one flag decides
 *   it here.
 * - ABSTENTION. A null answer is a question for the coach, mechanically, rather
 *   than the model remembering to set `unresolved` on a credit it invented.
 *
 * NOT MEASURED YET. This path is off by default and the narrative prompt still
 * ships, because the whole reason it exists is that four StatsIQ fixes were
 * once shipped on reasoning alone and two of them were wrong. Run
 * `EVAL_CHARTING=facts npx tsx scripts/eval-statsiq.ts <clip> 4` against both
 * ground-truth clips before making it the default.
 */

export type PossessionAnswer = 'ours' | 'theirs' | 'unclear'
export type PlayTypeAnswer = 'run' | 'pass' | 'other' | 'cannot_tell'
export type ChangedHandsAnswer = 'yes' | 'no' | 'cannot_tell'
export type PassOutcomeAnswer =
  | 'complete'
  | 'incomplete'
  | 'intercepted'
  | 'not_a_pass'
  | 'cannot_tell'
export type TurnoverAnswer = 'none' | 'fumble_lost' | 'interception' | 'cannot_tell'

export interface ReadNumber {
  position: string
  jersey_number: string
  jersey_number_frame?: number | null
  identification_confidence?: number | null
}

export interface PlayFacts {
  play_index: number
  possession: PossessionAnswer
  offensive_formation?: string | null
  defensive_front?: string | null
  formation_note?: string | null

  play_type: PlayTypeAnswer
  ball_changed_hands: ChangedHandsAnswer
  snap_taken_by?: string | null
  ball_ended_with?: string | null
  thrown_by?: string | null
  pass_outcome?: PassOutcomeAnswer | null
  intended_receiver?: string | null
  touchdown: boolean
  turnover?: TurnoverAnswer | null

  /** Our defenders who made the stop. Empty when we are on offense. */
  tacklers?: string[] | null
  /** True when the stop was shared — decides solo vs assisted for all of them. */
  tackle_shared?: boolean | null
  interception_by?: string | null
  forced_fumble_by?: string | null
  mistakes?: { position: string; category: string; note?: string | null }[] | null

  yards?: number | null
  yards_basis?: string | null
  yards_note?: string | null

  penalty_on?: string | null
  penalty_by?: string | null
  penalty_type?: string | null
  penalty_enforcement?: string | null
  penalty_timing?: string | null
  penalty_yards?: number | null

  numbers?: ReadNumber[] | null
  confidence?: number | null
  evidence_timestamps?: number[] | null
  evidence_frames?: number[] | null
}

const POSITION_ENUM = [...OFFENSIVE_POSITIONS, ...DEFENSIVE_POSITIONS]

export const PLAY_FACTS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    play_index: { type: Type.INTEGER },
    possession: { type: Type.STRING, enum: ['ours', 'theirs', 'unclear'] },
    offensive_formation: { type: Type.STRING, enum: [...OFFENSIVE_FORMATIONS] },
    defensive_front: { type: Type.STRING, enum: [...DEFENSIVE_FRONTS] },
    formation_note: { type: Type.STRING, nullable: true },

    play_type: { type: Type.STRING, enum: ['run', 'pass', 'other', 'cannot_tell'] },
    ball_changed_hands: { type: Type.STRING, enum: ['yes', 'no', 'cannot_tell'] },
    snap_taken_by: { type: Type.STRING, enum: POSITION_ENUM, nullable: true },
    ball_ended_with: { type: Type.STRING, enum: POSITION_ENUM, nullable: true },
    thrown_by: { type: Type.STRING, enum: POSITION_ENUM, nullable: true },
    pass_outcome: {
      type: Type.STRING,
      enum: ['complete', 'incomplete', 'intercepted', 'not_a_pass', 'cannot_tell'],
      nullable: true,
    },
    intended_receiver: { type: Type.STRING, enum: POSITION_ENUM, nullable: true },
    touchdown: { type: Type.BOOLEAN },
    turnover: {
      type: Type.STRING,
      enum: ['none', 'fumble_lost', 'interception', 'cannot_tell'],
      nullable: true,
    },

    tacklers: { type: Type.ARRAY, items: { type: Type.STRING, enum: POSITION_ENUM } },
    tackle_shared: { type: Type.BOOLEAN, nullable: true },
    interception_by: { type: Type.STRING, enum: POSITION_ENUM, nullable: true },
    forced_fumble_by: { type: Type.STRING, enum: POSITION_ENUM, nullable: true },
    mistakes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          position: { type: Type.STRING, enum: POSITION_ENUM },
          category: { type: Type.STRING, enum: [...MISTAKE_CATEGORIES] },
          note: { type: Type.STRING, nullable: true },
        },
        required: ['position', 'category'],
      },
    },

    yards: { type: Type.NUMBER, nullable: true },
    yards_basis: { type: Type.STRING, enum: [...YARDS_BASES] },
    yards_note: { type: Type.STRING, nullable: true },

    penalty_on: { type: Type.STRING, enum: ['us', 'them', 'offsetting', 'none'] },
    penalty_by: { type: Type.STRING, enum: POSITION_ENUM, nullable: true },
    penalty_type: { type: Type.STRING, enum: [...PENALTY_TYPES], nullable: true },
    penalty_enforcement: { type: Type.STRING, enum: [...PENALTY_ENFORCEMENTS], nullable: true },
    penalty_timing: { type: Type.STRING, enum: [...PENALTY_TIMINGS], nullable: true },
    penalty_yards: { type: Type.NUMBER, nullable: true },

    numbers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          position: { type: Type.STRING, enum: POSITION_ENUM },
          jersey_number: { type: Type.STRING },
          jersey_number_frame: { type: Type.INTEGER, nullable: true },
          identification_confidence: { type: Type.NUMBER },
        },
        required: ['position', 'jersey_number', 'identification_confidence'],
      },
    },

    confidence: { type: Type.NUMBER },
    evidence_timestamps: { type: Type.ARRAY, items: { type: Type.NUMBER } },
    evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: [
    'play_index',
    'possession',
    'offensive_formation',
    'defensive_front',
    'play_type',
    'ball_changed_hands',
    'touchdown',
    'yards',
    'yards_basis',
    'penalty_on',
    'confidence',
  ],
}

/** A position answer that actually names somebody, or null. */
function named(raw: string | null | undefined, side: 'offense' | 'defense'): string | null {
  if (!raw) return null
  const id = normalizeStatPosition(raw, side)
  return id === UNKNOWN_POSITION ? null : id
}

/**
 * The carry rule, applied rather than asked for.
 *
 * "Did the ball change hands after the snap?" is a closed question a model can
 * answer from the film. "Therefore the carry belongs to the quarterback and no
 * back gets one" is a deduction, and the charting prompt spent a page asking
 * for both and got the second one wrong: on the one clip whose truth we know, a
 * quarterback keeper off a dive fake, charting credited a back three times in
 * four.
 *
 * Note what this does NOT do: it never overrides a `no` with a guess. When the
 * exchange was hidden, both readings stay open and the coach is asked — which
 * is the same answer flagMeshPointCarries reaches downstream, arrived at here
 * from the model's own abstention rather than from the team's scheme.
 */
export function carrierOf(f: PlayFacts): { position: string | null; candidates: string[] } {
  const snap = named(f.snap_taken_by, 'offense')
  const ended = named(f.ball_ended_with, 'offense')

  if (f.ball_changed_hands === 'no') {
    // The ball never left the hands that took the snap. Either answer names the
    // same player; prefer the one the model watched to the end of the play.
    return { position: ended ?? snap, candidates: [] }
  }
  if (f.ball_changed_hands === 'yes') {
    return { position: ended, candidates: ended ? [] : [snap].filter(Boolean) as string[] }
  }
  // cannot_tell — the mesh was hidden. Both readings are live.
  const candidates = [snap, ended].filter((p, i, all) => !!p && all.indexOf(p) === i) as string[]
  return { position: null, candidates }
}

interface CreditSeed {
  stat: string
  position: string | null
  yards?: number | null
  touchdown?: boolean
  question?: string
  candidates?: string[]
  penalty_type?: string | null
  mistake_category?: string | null
  note?: string | null
}

/**
 * A seed becomes a credit. A seed with no position becomes an UNRESOLVED
 * credit — the play is not in question, only the player — and one with neither
 * a position nor anything to ask about is dropped entirely.
 */
function toCredit(seed: CreditSeed, f: PlayFacts, numbers: Map<string, ReadNumber>): RawStatCredit | null {
  const resolved = seed.position
  if (!resolved && !seed.question) return null

  const number = resolved ? numbers.get(resolved) : undefined
  return {
    stat: seed.stat,
    // An unresolved credit still needs a position field for the shape; the
    // side's catch-all is what downstream shows as "unattributed", and
    // `unresolved` is what keeps it off a player's line.
    position: resolved ?? (f.possession === 'theirs' ? 'other_defense' : 'other_offense'),
    yards: seed.yards ?? null,
    touchdown: seed.touchdown ?? false,
    penalty_type: seed.penalty_type ?? null,
    mistake_category: seed.mistake_category ?? null,
    jersey_number: number?.jersey_number ?? null,
    jersey_number_frame: number?.jersey_number_frame ?? null,
    identification_confidence: number?.identification_confidence ?? 0,
    unresolved: !resolved,
    question: resolved ? null : seed.question ?? null,
    candidates: resolved ? [] : seed.candidates ?? [],
    note: seed.note ?? null,
    evidence_timestamps: f.evidence_timestamps ?? [],
    evidence_frames: f.evidence_frames ?? [],
  }
}

function offensiveSeeds(f: PlayFacts): CreditSeed[] {
  const seeds: CreditSeed[] = []
  const yards = f.yards ?? null
  const td = f.touchdown === true

  if (f.play_type === 'pass') {
    const thrower = named(f.thrown_by, 'offense')
    const outcome = f.pass_outcome ?? 'cannot_tell'

    if (outcome === 'complete') {
      const catcher = named(f.ball_ended_with, 'offense') ?? named(f.intended_receiver, 'offense')
      // Both halves of a completion or neither. This pairing is the whole
      // reason the credits are assembled here: emitted separately by a model,
      // a reception routinely arrived with no completion behind it and the
      // sheet contradicted itself about a play it had read correctly.
      seeds.push({
        stat: 'pass_complete',
        position: thrower,
        yards,
        touchdown: td,
        question: 'Who threw this pass?',
      })
      seeds.push({
        stat: 'reception',
        position: catcher,
        yards,
        touchdown: td,
        question: 'Who caught this pass?',
        candidates: [named(f.intended_receiver, 'offense')].filter(Boolean) as string[],
      })
    } else if (outcome === 'incomplete') {
      seeds.push({ stat: 'pass_incomplete', position: thrower, question: 'Who threw this pass?' })
      const target = named(f.intended_receiver, 'offense')
      if (target) seeds.push({ stat: 'target', position: target })
    } else if (outcome === 'intercepted') {
      seeds.push({ stat: 'pass_intercepted', position: thrower, question: 'Who threw this pass?' })
    }
    // cannot_tell / not_a_pass on a play typed as a pass: the read contradicts
    // itself, so nothing is credited. The play still counts and the two-read
    // reconciliation downstream sees a pass with no principal credit.
  } else if (f.play_type === 'run') {
    const { position, candidates } = carrierOf(f)
    seeds.push({
      stat: 'rush',
      position,
      yards,
      touchdown: td,
      question: 'Who carried the ball on this play?',
      candidates,
    })
  }

  if (f.turnover === 'fumble_lost') {
    const carrier =
      f.play_type === 'pass'
        ? named(f.ball_ended_with, 'offense')
        : carrierOf(f).position
    seeds.push({ stat: 'fumble_lost', position: carrier, question: 'Who lost the fumble?' })
  }

  return seeds
}

function defensiveSeeds(f: PlayFacts): CreditSeed[] {
  const seeds: CreditSeed[] = []
  const tacklers = (f.tacklers ?? [])
    .map((t) => named(t, 'defense'))
    .filter((t, i, all): t is string => !!t && all.indexOf(t) === i)

  // Solo or shared, decided once for the whole stop. The prompt used to carry
  // "NEVER credit a tackle AND an assisted_tackle for the same stop" as an
  // instruction; here it is not expressible.
  const shared = f.tackle_shared === true || tacklers.length > 1
  for (const position of tacklers) {
    seeds.push({ stat: shared ? 'assisted_tackle' : 'tackle', position })
  }

  const pick = named(f.interception_by, 'defense')
  if (f.turnover === 'interception' && pick) seeds.push({ stat: 'interception', position: pick })

  const forced = named(f.forced_fumble_by, 'defense')
  if (forced) seeds.push({ stat: 'forced_fumble', position: forced })

  for (const m of f.mistakes ?? []) {
    const position = named(m.position, 'defense')
    if (position) {
      seeds.push({ stat: 'mistake', position, mistake_category: m.category, note: m.note ?? null })
    }
  }

  return seeds
}

function penaltySeed(f: PlayFacts): CreditSeed | null {
  if (f.penalty_on !== 'us') return null
  const position = named(f.penalty_by, f.possession === 'theirs' ? 'defense' : 'offense')
  // Unlike a carry, an unattributed flag is not worth asking about: the coach
  // cannot name the player from memory any better than the film could, and the
  // team's penalty count is charged from the play row regardless.
  if (!position) return null
  return {
    stat: 'penalty',
    position,
    yards: f.penalty_yards ?? null,
    penalty_type: f.penalty_type ?? null,
  }
}

function resultOf(f: PlayFacts): string {
  if (f.touchdown) return 'touchdown'
  if (f.turnover === 'interception') return 'interception'
  if (f.turnover === 'fumble_lost') return 'fumble_lost'
  if (f.play_type === 'pass' && f.pass_outcome === 'incomplete') return 'incomplete'
  if (f.penalty_on === 'us' || f.penalty_on === 'them') {
    if (f.play_type === 'cannot_tell' || f.play_type === 'other') return 'penalty'
  }
  const y = f.yards
  if (y == null) return 'unclear'
  if (y > 0) return 'gain'
  if (y === 0) return 'no_gain'
  return 'loss'
}

function playTypeOf(f: PlayFacts): string {
  if (f.play_type === 'run' || f.play_type === 'pass') return f.play_type
  return 'unclear'
}

/** One answered play becomes one charted play. */
export function statPlayFromFacts(f: PlayFacts): RawStatPlay {
  const numbers = new Map<string, ReadNumber>()
  for (const n of f.numbers ?? []) {
    const id = named(n.position, f.possession === 'theirs' ? 'defense' : 'offense')
    if (id && n.jersey_number) numbers.set(id, n)
  }

  const seeds =
    f.possession === 'ours'
      ? offensiveSeeds(f)
      : f.possession === 'theirs'
        ? defensiveSeeds(f)
        : []

  const penalty = penaltySeed(f)
  if (penalty) seeds.push(penalty)

  const credits = seeds
    .map((s) => toCredit(s, f, numbers))
    .filter((c): c is RawStatCredit => c !== null)

  return {
    play_index: f.play_index,
    possession:
      f.possession === 'ours' ? 'offense' : f.possession === 'theirs' ? 'defense' : 'unclear',
    offensive_formation: f.offensive_formation ?? null,
    defensive_front: f.defensive_front ?? null,
    formation_note: f.formation_note ?? null,
    play_type: playTypeOf(f),
    result: resultOf(f),
    yards: f.yards ?? null,
    yards_basis: f.yards_basis ?? 'not_determinable',
    yards_note: f.yards_note ?? null,
    penalty_on: f.penalty_on ?? 'none',
    penalty_type: f.penalty_type ?? null,
    penalty_enforcement: f.penalty_enforcement ?? null,
    penalty_timing: f.penalty_timing ?? null,
    penalty_yards: f.penalty_yards ?? null,
    confidence: f.confidence ?? null,
    evidence_timestamps: f.evidence_timestamps ?? [],
    evidence_frames: f.evidence_frames ?? [],
    credits,
  }
}

/**
 * The facts envelope, converted to the shape every StatsIQ consumer already
 * reads. Slotting in before PositionAnalysisOutputSchema means nothing
 * downstream — reconciliation, the mesh gate, the tally, the identity gates,
 * the box score — knows which charting prompt produced the play.
 */
export function factsOutputToAnalysisOutput(raw: unknown): unknown {
  const envelope = (raw ?? {}) as { plays?: unknown }
  const plays = Array.isArray(envelope.plays) ? (envelope.plays as PlayFacts[]) : []
  const { plays: _dropped, ...rest } = envelope as Record<string, unknown> & { plays?: unknown }
  void _dropped
  return {
    ...rest,
    stat_plays: plays.map(statPlayFromFacts),
    plays_observed: plays.length,
  }
}
