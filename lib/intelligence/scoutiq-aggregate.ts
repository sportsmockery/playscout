import { rollupTendency, type TendencyObservation } from './tendency-rollup'
import { countRepeats } from './aggregate-batch'
import { OFFENSIVE_FORMATIONS, DEFENSIVE_FRONTS, EXPLOSIVE_PLAY_YARDS, type AttackCategory, type StopCategory } from './taxonomy'
import { aggregateOffensiveSnaps, type OffensiveProfile } from './aggregate-offense'
import { RUN_PLAY_TYPES, PASS_PLAY_TYPES, type OffensiveSnap } from './offense-structure'
import { aggregateDefensiveSnaps, type DefensiveProfile } from './aggregate-defense'
import type { DefensiveSnap } from './defense-structure'

export interface ScoutClipEvidence {
  /** "Clip 37" — how the report points a coach at a specific play. */
  clip_label?: string | null
  plays_observed?: number | null
  /**
   * Which side of the ball the opponent was on in this clip. Absent on every
   * result saved before the field existed, and treated as 'both' there so old
   * reports rank exactly as they did.
   */
  opponent_possession?: 'offense' | 'defense' | 'both' | 'unclear' | null
  subject_confirmed?: boolean | null
  offensive_tendencies?: TendencyObservation[] | null
  defensive_tendencies?: TendencyObservation[] | null
  formations?: { name: string; side?: string; note?: string }[] | null
  situational_tells?: { situation: string; tell: string; confidence?: number }[] | null
  /**
   * Ways to attack this opponent. Objects rather than strings so each one
   * carries the part of the game plan it belongs to — twenty-five flat
   * sentences is a wall, not a plan.
   */
  attack_points?: { point: string; category?: string; weakness?: string }[] | null
  target_players?: { identifier: string; reason: string; confidence: number; evidence_frames?: number[] }[] | null
  /** What their DEFENCE did on this snap — coverage, rotation, strength, tells. */
  defensive_snaps?: DefensiveSnap[] | null
  /** What their OFFENSE did on this snap — formation, play type, direction, who got it. */
  offensive_snaps?: OffensiveSnap[] | null
  /** Ways to stop their offense — the offensive twin of attack_points. */
  stop_points?: { point: string; category?: string; threat?: string }[] | null
  /** Their offensive playmakers. */
  key_players?: { identifier: string; role?: string; reason: string; confidence: number }[] | null
  /** The pre-snap possession check, including who carried the ball. */
  possession_check?: {
    play_kind?: string
    offense?: string
    touchdown?: string
    pass?: { thrown?: string; result?: string; source?: string }
    ball_carrier?: { team?: string; position?: string; jersey_number?: string } | null
  } | null
  /**
   * The coach's own tag for this clip ("their offense" / "their defense"),
   * from the ScoutIQ clip list. Overrides every model read of possession.
   */
  coach_side?: 'offense' | 'defense' | null
  /** The coach's breakdown hash for this clip, used to cross-check the film read. */
  breakdown_hash?: string | null
}

export interface RankedStopPoint {
  point: string
  category: StopCategory | 'situational'
  clips: number
  /** Which clips showed it, in game order — "Clip 37, Clip 52". */
  clip_labels?: string[]
}

/** One line per scouted play, so the report can send a coach to a specific clip. */
export interface PlayLogEntry {
  clip: string
  side: 'offense' | 'defense'
  line: string
}

/**
 * The opponent ON OFFENSE, built only from clips where they had the ball —
 * the half of a scout a defensive coordinator plans from. Kept separate from
 * the defensive half so neither side's counts are diluted by the other's
 * clips: a whole-game cut-up is roughly half each.
 */
export interface OffenseScout {
  clips: number
  profile: OffensiveProfile
  stop_points: RankedStopPoint[]
  situational_tells: { situation: string; tell: string; clips: number; clip_labels?: string[] }[]
  key_players: { identifier: string; role?: string; reason: string; confidence: number; clips: number; clip_labels?: string[] }[]
  formations: { name: string; clips: number }[]
  /**
   * Who carried the ball on their offensive snaps, from the pre-snap check:
   * by legible jersey number with the pre-snap spot, or by spot alone.
   */
  ball_carriers: { identifier: string; carries: number; clip_labels: string[] }[]
  /** Explosive plays they made, with the clip each one is on. */
  explosive_plays: { clip: string; play_type: string; gain: number | null; result: string | null }[]
  /** Every offensive clip charted as a pass, in game order — the evidence behind the pass count. */
  pass_clips?: string[]
}

export interface AggregatedScoutReport {
  offensive_tendencies: TendencyObservation[]
  defensive_tendencies: TendencyObservation[]
  formations: { name: string; side?: string; note?: string }[]
  situational_tells: { situation: string; tell: string; clips: number; clip_labels?: string[] }[]
  /** Ranked by how many clips each appeared in — the thing that makes a "top 25" mean anything. */
  attack_points: RankedAttackPoint[]
  target_players: { identifier: string; reason: string; confidence: number }[]
  evidence_sufficiency: {
    plays_observed: number
    clips_analyzed: number
    /**
     * Clips where the opponent was defending — the only ones that can produce
     * a way to attack them, and therefore the honest denominator for the
     * ranked list. On a whole-game cut-up this is roughly half of
     * `clips_analyzed`, and ranking against the larger number made every real
     * weakness look like a one-off.
     */
    defensive_clips: number
    offensive_clips: number
    /** Clips where the model could not confirm it graded the right team. */
    unconfirmed_subject_clips: number
  }
  /**
   * The defence's structure across every scouted clip — what a quarterback and
   * a coordinator actually plan against. Built from the snaps charted on clips
   * where the opponent was DEFENDING; empty on film that never showed them on
   * defence, which is a real answer rather than a gap to fill.
   */
  defensive_profile: DefensiveProfile
  /** Fronts seen while they were defending, by clips. */
  defensive_fronts: { name: string; clips: number }[]
  /** Their offense, from the clips where they had the ball. */
  offense: OffenseScout
  /** Every scouted play in game order, one line each. */
  play_log: PlayLogEntry[]
}

/**
 * Was the opponent on defense in this clip?
 *
 * A clip with no `opponent_possession` predates the field, so it counts — the
 * alternative would silently drop every previously scouted clip out of the
 * ranking.
 */
function isDefensiveClip(clip: ScoutClipEvidence): boolean {
  const p = clip.opponent_possession
  return p == null || p === 'defense' || p === 'both'
}

function isOffensiveClip(clip: ScoutClipEvidence): boolean {
  const p = clip.opponent_possession
  return p === 'offense' || p === 'both'
}

/** How often each name appears across clips, one count per clip. */
function countByClip(clips: ScoutClipEvidence[], allowed: readonly string[]): { name: string; clips: number }[] {
  const counts = new Map<string, number>()
  for (const clip of clips) {
    const names = new Set((clip.formations ?? []).map((f) => f.name).filter((n) => allowed.includes(n)))
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, clips]) => ({ name, clips }))
    .sort((a, b) => b.clips - a.clips || a.name.localeCompare(b.name))
}

const THREAT_PREFIX = 'threat:'

/**
 * Ball carriers from the pre-snap check, scouted team only. A number groups
 * only with the same number (and keeps the most common spot beside it); a
 * carrier with no legible number groups by spot, since that is all the film
 * showed and it can cover more than one player.
 */
function rankBallCarriers(clips: ScoutClipEvidence[]): OffenseScout['ball_carriers'] {
  const groups = new Map<string, { spots: Map<string, number>; number: string; clips: string[]; carries: number }>()
  for (const clip of clips) {
    const c = clip.possession_check?.ball_carrier
    if (!c || c.team !== 'scouted') continue
    const spot = (c.position ?? '').trim().toLowerCase()
    const number = (c.jersey_number ?? '').trim()
    if (!spot && !number) continue
    const key = number ? `#${number}` : spot
    const g = groups.get(key) ?? { spots: new Map<string, number>(), number, clips: [], carries: 0 }
    g.carries += 1
    if (spot) g.spots.set(spot, (g.spots.get(spot) ?? 0) + 1)
    if (clip.clip_label) g.clips.push(clip.clip_label)
    groups.set(key, g)
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const topSpot = [...g.spots.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      const identifier = g.number ? `#${g.number}${topSpot ? ` (${topSpot})` : ''}` : key
      return { identifier, carries: g.carries, clip_labels: [...g.clips].sort(byGameOrder) }
    })
    .sort((a, b) => b.carries - a.carries || a.identifier.localeCompare(b.identifier))
}

const say = (v: string | null | undefined, skip: string[] = []) =>
  v && !skip.includes(v) ? v.replace(/_/g, ' ') : null

/**
 * One line per scouted play in game order: what the charting recorded, never
 * a new read. This is what lets the game plan say "watch Clip 52" and have
 * the coach find the play the claim rests on.
 */
function buildPlayLog(clips: ScoutClipEvidence[]): PlayLogEntry[] {
  const out: PlayLogEntry[] = []
  for (const clip of clips) {
    if (!clip.clip_label) continue
    for (const s of clip.offensive_snaps ?? []) {
      const gain =
        s.result === 'touchdown'
          ? `touchdown${typeof s.gain_yards === 'number' ? ` (${s.gain_yards} yds)` : ''}`
          : typeof s.gain_yards === 'number'
            ? `${s.gain_yards} yds`
            : say(s.result, ['not_visible'])
      const parts = [
        say(s.formation, ['not_visible']),
        say(s.qb_alignment, ['not_visible']),
        s.motion && s.motion !== 'none' && s.motion !== 'not_visible' ? `${say(s.motion)} motion` : null,
        say(s.play_type, ['unclear']),
        say(s.direction, ['not_visible']),
        s.ball_carrier ? `to ${say(s.ball_carrier)}` : null,
        gain,
      ].filter(Boolean)
      if (parts.length) out.push({ clip: clip.clip_label, side: 'offense', line: parts.join(', ') })
    }
    for (const s of clip.defensive_snaps ?? []) {
      const parts = [
        say(s.presnap_shell, ['not_visible']) && `${say(s.presnap_shell)} shell`,
        say(s.coverage_played, ['not_determinable']),
        say(s.pressure_look, ['not_determinable']),
        typeof s.box_count === 'number' ? `${s.box_count} in the box` : null,
      ].filter(Boolean)
      if (parts.length) out.push({ clip: clip.clip_label, side: 'defense', line: parts.join(', ') })
    }
  }
  return out.sort((a, b) => byGameOrder(a.clip, b.clip))
}

/**
 * Stop points ranked the way attack points are: the threat id is the identity
 * (two clips filing the same id are the same thing however it was worded), the
 * category the weaker fallback.
 */
function rankStopPoints(clips: ScoutClipEvidence[]): RankedStopPoint[] {
  const lists = clips.map((c) => (c.stop_points ?? []).map((p) => p.point))
  const stopLabels = labelsByText(clips, (c) => (c.stop_points ?? []).map((p) => p.point))
  const threatOf = new Map<string, string>()
  const categoryVotes = new Map<string, Map<string, number>>()
  for (const clip of clips) {
    for (const p of clip.stop_points ?? []) {
      const text = p.point?.trim()
      if (!text) continue
      if (p.threat && p.threat !== 'other') threatOf.set(text, p.threat)
      if (p.category) {
        const votes = categoryVotes.get(text) ?? new Map<string, number>()
        votes.set(p.category, (votes.get(p.category) ?? 0) + 1)
        categoryVotes.set(text, votes)
      }
    }
  }
  return countRepeats(lists, ATTACK_POINT_LIMIT, {
    keyOf: (text) => {
      const threat = threatOf.get(text.trim())
      return threat ? `${THREAT_PREFIX}${threat}` : undefined
    },
    similarityForKey: (key) => (key.startsWith(THREAT_PREFIX) ? 0 : undefined),
  }).map((item) => ({
    point: item.text,
    category: modalCategory(item.members, categoryVotes) as StopCategory | 'situational',
    clips: item.clips,
    clip_labels: stopLabels(item.members),
  }))
}

function rankKeyPlayers(clips: ScoutClipEvidence[]): OffenseScout['key_players'] {
  const byId = new Map<string, OffenseScout['key_players'][number]>()
  for (const clip of clips) {
    const seen = new Set<string>()
    for (const p of clip.key_players ?? []) {
      const id = p.identifier?.trim()
      if (!id) continue
      const key = id.toLowerCase()
      const existing = byId.get(key)
      const clipsSoFar = (existing?.clips ?? 0) + (seen.has(key) ? 0 : 1)
      seen.add(key)
      const labels = [...new Set([...(existing?.clip_labels ?? []), ...(clip.clip_label ? [clip.clip_label] : [])])].sort(byGameOrder)
      byId.set(
        key,
        !existing || p.confidence > existing.confidence
          ? { identifier: id, role: p.role, reason: p.reason, confidence: p.confidence, clips: clipsSoFar, clip_labels: labels }
          : { ...existing, clips: clipsSoFar, clip_labels: labels }
      )
    }
  }
  return [...byId.values()].sort((a, b) => b.clips - a.clips || b.confidence - a.confidence).slice(0, 12)
}

function rollupList(existing: TendencyObservation[], incoming: TendencyObservation[]): TendencyObservation[] {
  const byKey = new Map(existing.map((t) => [`${t.tendency_type}:${t.label}`, t]))
  for (const t of incoming) {
    const key = `${t.tendency_type}:${t.label}`
    byKey.set(key, rollupTendency(byKey.get(key) ?? null, t))
  }
  return [...byKey.values()]
}

export interface RankedAttackPoint {
  point: string
  category: AttackCategory | 'situational'
  /** How many clips this showed up in. */
  clips: number
  /** Which clips showed it, in game order — "Clip 37, Clip 52". */
  clip_labels?: string[]
}

const clipNum = (label: string) => {
  const m = label.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : Infinity
}
const byGameOrder = (a: string, b: string) => clipNum(a) - clipNum(b) || a.localeCompare(b)

/**
 * The clips each piece of text came from, so a counted cluster can name the
 * plays behind it. Keyed by trimmed text; a cluster unions its members.
 */
function labelsByText(
  clips: ScoutClipEvidence[],
  textsOf: (c: ScoutClipEvidence) => (string | undefined | null)[]
): (members: string[]) => string[] | undefined {
  const map = new Map<string, Set<string>>()
  for (const clip of clips) {
    if (!clip.clip_label) continue
    for (const raw of textsOf(clip)) {
      const text = raw?.trim()
      if (!text) continue
      const set = map.get(text) ?? new Set<string>()
      set.add(clip.clip_label)
      map.set(text, set)
    }
  }
  return (members) => {
    const out = new Set<string>()
    for (const m of members) for (const l of map.get(m.trim()) ?? []) out.add(l)
    // Absent rather than empty, so a report built from unlabelled clips saves
    // exactly what it did before clip numbers existed.
    return out.size ? [...out].sort(byGameOrder) : undefined
  }
}

/**
 * How many ranked attack points to keep. Generous on purpose: a coach asking
 * for the top 25 needs the ranking to have looked at more than 25.
 */
const ATTACK_POINT_LIMIT = 40

/** Namespaces the merge key so a weakness id and a category can never collide. */
const WEAKNESS_PREFIX = 'weakness:'

/**
 * Clusters attack points across clips and counts them.
 *
 * They used to go into a `Set<string>` — exact-string dedup, insertion order,
 * no counting. Across fifty clips "Soft edge on third and short" and "Edge is
 * soft to the field on third and short" were two separate entries, and nothing
 * distinguished a weakness seen thirty times from one seen once.
 *
 * The clustering is lexical (shared content words, the threshold tuned in
 * aggregate-batch.ts), so it merges REPHRASINGS. Two descriptions of the same
 * weakness that share almost no vocabulary — "soft edge to the field" versus
 * "force defender never sets the edge" — stay separate, and a coach reading
 * the list will see both. That is the honest failure direction: showing the
 * same point twice costs a line, merging two different ones would hide
 * evidence.
 */
function rankAttackPoints(clips: ScoutClipEvidence[]): RankedAttackPoint[] {
  const lists = clips.map((c) => (c.attack_points ?? []).map((a) => a.point))
  const attackLabels = labelsByText(clips, (c) => (c.attack_points ?? []).map((a) => a.point))

  // Which category each phrasing was filed under, so a cluster can take the
  // one its members most often used.
  const categoryVotes = new Map<string, Map<string, number>>()
  const weaknessVotes = new Map<string, Map<string, number>>()
  for (const clip of clips) {
    for (const a of clip.attack_points ?? []) {
      const text = a.point?.trim()
      if (!text) continue
      if (a.category) {
        const votes = categoryVotes.get(text) ?? new Map<string, number>()
        votes.set(a.category, (votes.get(a.category) ?? 0) + 1)
        categoryVotes.set(text, votes)
      }
      // 'other' is the escape hatch, not an identity: two unrelated weaknesses
      // that both failed to fit the vocabulary are not the same weakness, so
      // it never keys a merge.
      if (a.weakness && a.weakness !== 'other') {
        const votes = weaknessVotes.get(text) ?? new Map<string, number>()
        votes.set(a.weakness, (votes.get(a.weakness) ?? 0) + 1)
        weaknessVotes.set(text, votes)
      }
    }
  }

  const weaknessOf = (text: string): string | undefined => {
    const votes = weaknessVotes.get(text.trim())
    if (!votes?.size) return undefined
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }

  /**
   * The category each phrasing was filed under, used to GATE merging.
   *
   * Two points in different parts of the game plan are different points at any
   * similarity score — so this only ever prevents a merge, never forces one,
   * which makes it strictly safer than the threshold alone. What it buys is
   * the freedom to require less textual agreement INSIDE a category, where the
   * category already carries part of the claim. Measured on a real 113-clip
   * report, purely lexical matching left "corners play soft off-coverage" and
   * "boundary corner plays with a large cushion" in separate clusters at 0.133.
   *
   * A point with no category falls in the unkeyed bucket and keeps today's
   * behaviour exactly — which is what every row saved before categories
   * existed will do.
   */
  const categoryOf = (text: string): string | undefined => {
    const votes = categoryVotes.get(text.trim())
    if (!votes?.size) return undefined
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }

  /**
   * The weakness id if the clip filed one, else the category.
   *
   * The id IS the identity of the weakness, so two clips that chose the same
   * one are reporting the same problem however differently they wrote it —
   * that is the whole reason the vocabulary exists, and `similarityForKey`
   * returns 0 for it. The category is the weaker fallback for rows saved
   * before the field existed, and keeps its 0.25.
   */
  const keyOf = (text: string): string | undefined => {
    const weakness = weaknessOf(text.trim())
    if (weakness) return `${WEAKNESS_PREFIX}${weakness}`
    const category = categoryOf(text)
    return category ? `category:${category}` : undefined
  }

  return countRepeats(lists, ATTACK_POINT_LIMIT, {
    keyOf,
    // A shared weakness id needs no wording agreement at all; a shared
    // category still does, so it takes the default.
    similarityForKey: (key) => (key.startsWith(WEAKNESS_PREFIX) ? 0 : undefined),
  }).map((item) => ({
    point: item.text,
    clip_labels: attackLabels(item.members),
    // Voted across every phrasing in the cluster, not just the canonical one.
    // The canonical text is simply the shortest member, so reading its
    // category alone let one clip decide how the whole group was filed.
    category: modalCategory(item.members, categoryVotes),
    clips: item.clips,
  }))
}

function modalCategory(
  members: string[],
  categoryVotes: Map<string, Map<string, number>>
): AttackCategory | 'situational' {
  // Shared by attack points and stop points; the caller narrows the type.
  const tally = new Map<string, number>()
  for (const member of members) {
    for (const [category, count] of categoryVotes.get(member) ?? []) {
      tally.set(category, (tally.get(category) ?? 0) + count)
    }
  }
  if (!tally.size) return 'situational'
  const [best] = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return best[0] as AttackCategory
}

/**
 * Situational tells, clustered WITHIN each situation bucket. Keying on the
 * exact `situation:tell` string split the same read across several rows the
 * same way attack points were split.
 */
function rankSituationalTells(
  clips: ScoutClipEvidence[]
): { situation: string; tell: string; clips: number; clip_labels?: string[] }[] {
  const tellLabels = labelsByText(clips, (c) => (c.situational_tells ?? []).map((t) => t.tell))
  const bySituation = new Map<string, string[][]>()

  for (const clip of clips) {
    const perSituation = new Map<string, string[]>()
    for (const t of clip.situational_tells ?? []) {
      if (!t.situation || !t.tell) continue
      perSituation.set(t.situation, [...(perSituation.get(t.situation) ?? []), t.tell])
    }
    for (const [situation, tells] of perSituation) {
      bySituation.set(situation, [...(bySituation.get(situation) ?? []), tells])
    }
  }

  return [...bySituation.entries()]
    .flatMap(([situation, lists]) =>
      countRepeats(lists, 10).map((item) => ({
        situation,
        tell: item.text,
        clips: item.clips,
        clip_labels: tellLabels(item.members),
      }))
    )
    .sort((a, b) => b.clips - a.clips)
}

/**
 * Rolls up every scouted clip of one opponent into a single season-level
 * picture, using the same sample-size-weighted math as team_tendencies
 * (tendency-rollup.ts) — a team_tendencies row can't hold this because that
 * table has no opponent concept, so this snapshot lives in scout_reports
 * instead, recomputed fresh each time a game plan is generated.
 */
/** Scrimmage-snap charts never come from a kick, a try or a dead clip. */
const NOT_A_SCRIMMAGE_SNAP = new Set(['kickoff', 'punt', 'extra_point', 'no_play'])

/**
 * Applies what is known better than the main read before anything is counted:
 *
 * - The COACH'S side tag wins over every model read of possession. Fields
 *   charted for the other side are dropped rather than refiled — they describe
 *   the other team's play.
 * - A kick, try or dead clip contributes no scrimmage snaps.
 * - A touchdown counts only when the separate possession check ALSO saw the
 *   ball cross the goal line. The main read charted seven touchdowns for a
 *   team that was shut out 13-0; an uncorroborated "touchdown" becomes a gain,
 *   keeping its yardage. Clips scouted before the check existed keep theirs.
 */
export function reconcileScoutClip(clip: ScoutClipEvidence): ScoutClipEvidence {
  let c = clip
  if (c.coach_side) {
    const offense = c.coach_side === 'offense'
    c = {
      ...c,
      opponent_possession: c.coach_side,
      offensive_snaps: offense ? c.offensive_snaps : null,
      stop_points: offense ? c.stop_points : null,
      key_players: offense ? c.key_players : null,
      defensive_snaps: offense ? null : c.defensive_snaps,
      attack_points: offense ? null : c.attack_points,
      target_players: offense ? null : c.target_players,
    }
  }
  // The check mapped its ball carrier through ITS possession read; when the
  // coach says that read was backwards, so is the carrier's team.
  const read = c.possession_check
  const readSide = read?.offense === 'scouted' ? 'offense' : read?.offense === 'other' ? 'defense' : null
  if (c.coach_side && readSide && readSide !== c.coach_side && read?.ball_carrier) {
    const team = read.ball_carrier.team
    c = {
      ...c,
      possession_check: {
        ...read,
        offense: c.coach_side === 'offense' ? 'scouted' : 'other',
        ball_carrier: { ...read.ball_carrier, team: team === 'scouted' ? 'other' : team === 'other' ? 'scouted' : team },
      },
    }
  }
  const check = c.possession_check
  // A coach who says a pass was thrown on this clip has settled that it is a
  // scrimmage play, whatever the check took it for (it called several of the
  // Warriors' passes kickoffs, which threw the play away entirely).
  const coachPass = check?.pass?.thrown === 'yes' && check.pass.source === 'coach'
  if (!coachPass && check?.play_kind && NOT_A_SCRIMMAGE_SNAP.has(check.play_kind)) {
    c = { ...c, offensive_snaps: null, defensive_snaps: null }
  }
  // A throw the high-resolution check saw outranks a "run" from the 2fps main
  // read, which filed obvious passes as runs (the coach: "they pass a lot";
  // the plan: "zero passes"). The main read saw run ACTION and then the ball
  // was thrown — that is play action by definition. The receiver is not
  // known, so the run's ball carrier is not kept as one.
  // On a pass the check's "ball carrier" is whoever it took for a runner;
  // the receiver is not known, so it is not counted as anyone's carry.
  if (check?.pass?.thrown === 'yes' && check.ball_carrier) {
    c = { ...c, possession_check: { ...check, ball_carrier: null } }
  }
  if (check?.pass?.thrown === 'yes' && c.offensive_snaps?.some((s) => s.play_type && RUN_PLAY_TYPES.includes(s.play_type))) {
    const result = check.pass.result
    c = {
      ...c,
      offensive_snaps: c.offensive_snaps.map((s) =>
        s.play_type && RUN_PLAY_TYPES.includes(s.play_type)
          ? {
              ...s,
              play_type: 'play_action_pass' as const,
              ball_carrier: null,
              ...(result === 'incomplete'
                ? { result: 'incomplete' as const, gain_yards: 0 }
                : result === 'intercepted'
                  ? { result: 'interception' as const, gain_yards: null }
                  : result === 'complete'
                    ? {}
                    : { gain_yards: null, result: 'not_visible' as const }),
            }
          : s
      ),
    }
  }
  if (check && check.touchdown !== 'yes' && c.offensive_snaps?.some((s) => s.result === 'touchdown')) {
    c = {
      ...c,
      offensive_snaps: c.offensive_snaps.map((s) => (s.result === 'touchdown' ? { ...s, result: 'gain' } : s)),
    }
  }
  return c
}

export function aggregateScoutReport(rawClips: ScoutClipEvidence[]): AggregatedScoutReport {
  const clips = rawClips.map(reconcileScoutClip)
  let offensive: TendencyObservation[] = []
  let defensive: TendencyObservation[] = []
  const formations = new Map<string, { name: string; side?: string; note?: string }>()
  const targetPlayers = new Map<string, { identifier: string; reason: string; confidence: number }>()
  let totalPlaysObserved = 0

  const defensiveClips = clips.filter(isDefensiveClip)
  const offensiveClips = clips.filter(isOffensiveClip)

  for (const clip of clips) {
    totalPlaysObserved += clip.plays_observed ?? 0
    offensive = rollupList(offensive, clip.offensive_tendencies ?? [])
    defensive = rollupList(defensive, clip.defensive_tendencies ?? [])
    for (const f of clip.formations ?? []) formations.set(f.name, f)
  }
  // Target players are weak DEFENDERS, so only clips where they defended.
  for (const clip of defensiveClips) {
    for (const p of clip.target_players ?? []) {
      const existing = targetPlayers.get(p.identifier)
      if (!existing || p.confidence > existing.confidence) {
        targetPlayers.set(p.identifier, { identifier: p.identifier, reason: p.reason, confidence: p.confidence })
      }
    }
  }

  // One flat list of snaps with their hashes kept in step, so the cross-check
  // compares each film read against the breakdown for the SAME clip.
  const snaps: DefensiveSnap[] = []
  const hashes: (string | null | undefined)[] = []
  for (const clip of defensiveClips) {
    for (const snap of clip.defensive_snaps ?? []) {
      snaps.push(snap)
      hashes.push(clip.breakdown_hash)
    }
  }

  return {
    offensive_tendencies: offensive,
    defensive_tendencies: defensive,
    formations: [...formations.values()],
    // Ranked over the defensive clips only: an attack point can only be
    // observed while they are defending, so counting it against every clip of
    // a whole game halves every rate and makes a real tendency read as noise.
    situational_tells: rankSituationalTells(defensiveClips),
    attack_points: rankAttackPoints(defensiveClips),
    target_players: [...targetPlayers.values()],
    evidence_sufficiency: {
      plays_observed: totalPlaysObserved,
      clips_analyzed: clips.length,
      defensive_clips: defensiveClips.length,
      offensive_clips: clips.filter(isOffensiveClip).length,
      unconfirmed_subject_clips: clips.filter((c) => c.subject_confirmed === false).length,
    },
    defensive_profile: aggregateDefensiveSnaps(snaps, hashes),
    defensive_fronts: countByClip(defensiveClips, DEFENSIVE_FRONTS),
    offense: {
      clips: offensiveClips.length,
      profile: aggregateOffensiveSnaps(offensiveClips.flatMap((c) => c.offensive_snaps ?? [])),
      stop_points: rankStopPoints(offensiveClips),
      situational_tells: rankSituationalTells(offensiveClips),
      key_players: rankKeyPlayers(offensiveClips),
      formations: countByClip(offensiveClips, OFFENSIVE_FORMATIONS),
      ball_carriers: rankBallCarriers(offensiveClips),
      pass_clips: offensiveClips
        .filter((c) => (c.offensive_snaps ?? []).some((s) => s.play_type && PASS_PLAY_TYPES.includes(s.play_type)))
        .map((c) => c.clip_label ?? 'unlabelled clip')
        .sort(byGameOrder),
      explosive_plays: offensiveClips
        .flatMap((c) =>
          (c.offensive_snaps ?? [])
            .filter((s) => s.result === 'touchdown' || (typeof s.gain_yards === 'number' && s.gain_yards >= EXPLOSIVE_PLAY_YARDS))
            .map((s) => ({
              clip: c.clip_label ?? 'unlabelled clip',
              play_type: s.play_type ?? 'unclear',
              gain: s.gain_yards ?? null,
              result: s.result ?? null,
            }))
        )
        .sort((a, b) => byGameOrder(a.clip, b.clip)),
    },
    play_log: buildPlayLog(clips),
  }
}
