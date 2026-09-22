import {
  type DefensiveSnap,
  type CoverageShell,
  type Coverage,
  type SafetyRotation,
  type StrengthDeclaration,
  type PresnapTellKind,
} from './defense-structure'

/**
 * Turns charted defensive snaps into the distributions a game plan is built
 * from. EVERY number here is computed from the snaps, never asked of a model —
 * the same rule `stat-lines.ts` enforces for the box score and
 * `player-grades.ts` for grades.
 *
 * The rule matters more here than anywhere else in the product. "They run
 * Cover 3" is a claim a coach will build a Friday game plan on, and if the
 * figure behind it is a model's impression rather than the sum of its own
 * observations, the plan is fiction with a percentage on it. So a coverage
 * rate is `n over the snaps where coverage was readable at all`, and the
 * denominator is reported beside it every time.
 *
 * TWO DENOMINATORS, and conflating them is the trap. A shell is readable on
 * most snaps; a played coverage is readable on far fewer, because the camera
 * follows the ball. Dividing coverages by total snaps would report "Cover 3 on
 * 20% of snaps" for a team that played it on 20 of the 24 snaps anyone could
 * see — understating it by a factor of three. Every distribution here carries
 * the denominator it was actually computed over.
 */

export interface Frequency<T extends string> {
  value: T
  count: number
  /** Share of the snaps where this question was ANSWERABLE, not of all snaps. */
  rate: number
}

export interface Split<T extends string> {
  /** What the snaps were split by — "left hash", "3rd & long", "vs trips". */
  key: string
  snaps: number
  top: Frequency<T> | null
  distribution: Frequency<T>[]
}

export interface DefensiveProfile {
  /** Snaps where the opponent was on defence and something was charted. */
  snaps: number

  shells: { readable: number; distribution: Frequency<CoverageShell>[] }
  coverages: { readable: number; distribution: Frequency<Coverage>[] }
  rotations: { readable: number; distribution: Frequency<SafetyRotation>[] }
  strength: { readable: number; distribution: Frequency<StrengthDeclaration>[] }

  /** Shell by hash — the "what changes on the hash" answer. */
  shellByBallPosition: Split<CoverageShell>[]
  /** Coverage by situation bucket — the "what do they do on money down" answer. */
  coverageBySituation: Split<Coverage>[]
  /** Rotation by declared strength — "what changes strong vs weak". */
  rotationByStrength: Split<SafetyRotation>[]

  /** Average safety depth, wide side vs short side, where it was measured. */
  safetyDepth: {
    field: { mean: number; measured: number } | null
    boundary: { mean: number; measured: number } | null
  }
  /** Average defenders in the box, where counted. */
  boxCount: { mean: number; measured: number } | null

  /** Pressure rate over the snaps where the rush was readable. */
  pressure: { readable: number; blitzed: number; rate: number; bailedShowing: number }

  /** Pre-snap tells, grouped by kind and ranked by how often they recurred. */
  tells: {
    kind: PresnapTellKind
    count: number
    observations: string[]
    meanConfidence: number | null
  }[]

  /**
   * Where the model's read of the hash disagreed with the coach's breakdown.
   * A free cross-check: both describe the same snap, so a mismatch is a
   * reading error in one of them and the coach should see the count.
   */
  hashDisagreements: number
  hashChecked: number
}

function tally<T extends string>(
  values: (T | null | undefined)[],
  unreadable: readonly string[]
): { readable: number; distribution: Frequency<T>[] } {
  const counts = new Map<T, number>()
  let readable = 0
  for (const v of values) {
    if (!v || unreadable.includes(v)) continue
    readable += 1
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const distribution = [...counts.entries()]
    .map(([value, count]) => ({ value, count, rate: readable ? count / readable : 0 }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  return { readable, distribution }
}

function mean(values: (number | null | undefined)[]): { mean: number; measured: number } | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) return null
  const total = nums.reduce((a, b) => a + b, 0)
  return { mean: Math.round((total / nums.length) * 10) / 10, measured: nums.length }
}

/**
 * A split is only shown when it rests on enough snaps to mean anything.
 *
 * Three snaps on the left hash producing "they play two-high 100% of the time
 * on the left hash" is the kind of number that loses games — it reads as a
 * tendency and it is three plays. A coach can always see the raw snaps.
 */
export const MIN_SPLIT_SNAPS = 4

function splitBy<T extends string>(
  snaps: DefensiveSnap[],
  keyOf: (s: DefensiveSnap) => string | null,
  valueOf: (s: DefensiveSnap) => T | null | undefined,
  unreadable: readonly string[]
): Split<T>[] {
  const groups = new Map<string, DefensiveSnap[]>()
  for (const s of snaps) {
    const key = keyOf(s)
    if (!key) continue
    const bucket = groups.get(key) ?? []
    bucket.push(s)
    groups.set(key, bucket)
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const { readable, distribution } = tally(group.map(valueOf), unreadable)
      return { key, snaps: readable, top: distribution[0] ?? null, distribution }
    })
    .filter((s) => s.snaps >= MIN_SPLIT_SNAPS)
    .sort((a, b) => b.snaps - a.snaps)
}

const HASH_LABEL: Record<string, string> = {
  left_hash: 'Ball on the left hash',
  middle: 'Ball in the middle',
  right_hash: 'Ball on the right hash',
}

/** Hudl's L/M/R, in this module's vocabulary, for the cross-check. */
function hashToBallPosition(hash: string | null | undefined): string | null {
  if (hash === 'L') return 'left_hash'
  if (hash === 'R') return 'right_hash'
  if (hash === 'M') return 'middle'
  return null
}

export function aggregateDefensiveSnaps(
  snaps: DefensiveSnap[],
  /** The coach's breakdown hash per snap, keyed the same way as the snaps. */
  breakdownHashes: (string | null | undefined)[] = []
): DefensiveProfile {
  const shells = tally<CoverageShell>(
    snaps.map((s) => s.presnap_shell),
    ['not_visible']
  )
  const coverages = tally<Coverage>(
    snaps.map((s) => s.coverage_played),
    ['not_determinable']
  )
  const rotations = tally<SafetyRotation>(
    snaps.map((s) => s.safety_rotation),
    ['not_visible']
  )
  const strength = tally<StrengthDeclaration>(
    snaps.map((s) => s.strength_declared),
    ['not_determinable']
  )

  const pressureReadable = snaps.filter(
    (s) => s.pressure_look && s.pressure_look !== 'not_determinable'
  )
  const blitzed = pressureReadable.filter((s) =>
    ['five_man_edge', 'five_man_interior', 'six_plus', 'delayed_or_green_dog'].includes(
      s.pressure_look as string
    )
  ).length

  // Tells are grouped by KIND rather than by wording. On real film the same
  // tell is described differently every clip, which is the lesson
  // aggregate-batch.ts already learned the hard way: a word-prefix key merged
  // nothing and left every item sitting at 1x.
  const tellGroups = new Map<PresnapTellKind, { observations: string[]; confidences: number[] }>()
  for (const snap of snaps) {
    for (const tell of snap.presnap_tells ?? []) {
      if (!tell?.kind) continue
      const group = tellGroups.get(tell.kind) ?? { observations: [], confidences: [] }
      if (tell.observation) group.observations.push(tell.observation)
      if (typeof tell.confidence === 'number') group.confidences.push(tell.confidence)
      tellGroups.set(tell.kind, group)
    }
  }
  const tells = [...tellGroups.entries()]
    .map(([kind, g]) => ({
      kind,
      count: g.observations.length,
      observations: g.observations.slice(0, 6),
      meanConfidence: g.confidences.length
        ? Math.round((g.confidences.reduce((a, b) => a + b, 0) / g.confidences.length) * 100) / 100
        : null,
    }))
    .sort((a, b) => b.count - a.count)

  let hashChecked = 0
  let hashDisagreements = 0
  snaps.forEach((snap, i) => {
    const fromBreakdown = hashToBallPosition(breakdownHashes[i])
    const read = snap.ball_position
    if (!fromBreakdown || !read || read === 'not_determinable') return
    hashChecked += 1
    if (fromBreakdown !== read) hashDisagreements += 1
  })

  return {
    snaps: snaps.length,
    shells,
    coverages,
    rotations,
    strength,
    shellByBallPosition: splitBy<CoverageShell>(
      snaps,
      (s) => (s.ball_position && HASH_LABEL[s.ball_position]) || null,
      (s) => s.presnap_shell,
      ['not_visible']
    ),
    coverageBySituation: splitBy<Coverage>(
      snaps,
      (s) => s.situation ?? null,
      (s) => s.coverage_played,
      ['not_determinable']
    ),
    rotationByStrength: splitBy<SafetyRotation>(
      snaps,
      (s) =>
        s.strength_declared && s.strength_declared !== 'not_determinable'
          ? `Set ${s.strength_declared.replace(/_/g, ' ')}`
          : null,
      (s) => s.safety_rotation,
      ['not_visible']
    ),
    safetyDepth: {
      field: mean(snaps.map((s) => s.field_safety_depth)),
      boundary: mean(snaps.map((s) => s.boundary_safety_depth)),
    },
    boxCount: mean(snaps.map((s) => s.box_count)),
    pressure: {
      readable: pressureReadable.length,
      blitzed,
      rate: pressureReadable.length ? blitzed / pressureReadable.length : 0,
      bailedShowing: pressureReadable.filter((s) => s.pressure_look === 'showed_pressure_bailed')
        .length,
    },
    tells,
    hashDisagreements,
    hashChecked,
  }
}

/**
 * A profile is only worth writing a game plan from when enough of it is
 * readable. Below this the briefs must say so rather than extrapolating — the
 * difference between "they are a two-high team" and "the four snaps where we
 * could see the safeties were two-high".
 */
export const MIN_PROFILE_SNAPS = 8

export function profileIsThin(profile: DefensiveProfile): boolean {
  return profile.shells.readable < MIN_PROFILE_SNAPS
}
