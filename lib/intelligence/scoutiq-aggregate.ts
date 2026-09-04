import { rollupTendency, type TendencyObservation } from './tendency-rollup'
import { countRepeats } from './aggregate-batch'
import type { AttackCategory } from './taxonomy'

export interface ScoutClipEvidence {
  plays_observed?: number | null
  offensive_tendencies?: TendencyObservation[] | null
  defensive_tendencies?: TendencyObservation[] | null
  formations?: { name: string; side?: string; note?: string }[] | null
  situational_tells?: { situation: string; tell: string; confidence?: number }[] | null
  /**
   * Ways to attack this opponent. Objects rather than strings so each one
   * carries the part of the game plan it belongs to — twenty-five flat
   * sentences is a wall, not a plan.
   */
  attack_points?: { point: string; category?: string }[] | null
  target_players?: { identifier: string; reason: string; confidence: number; evidence_frames?: number[] }[] | null
}

export interface AggregatedScoutReport {
  offensive_tendencies: TendencyObservation[]
  defensive_tendencies: TendencyObservation[]
  formations: { name: string; side?: string; note?: string }[]
  situational_tells: { situation: string; tell: string; clips: number }[]
  /** Ranked by how many clips each appeared in — the thing that makes a "top 25" mean anything. */
  attack_points: RankedAttackPoint[]
  target_players: { identifier: string; reason: string; confidence: number }[]
  evidence_sufficiency: { plays_observed: number; clips_analyzed: number }
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
}

/**
 * How many ranked attack points to keep. Generous on purpose: a coach asking
 * for the top 25 needs the ranking to have looked at more than 25.
 */
const ATTACK_POINT_LIMIT = 40

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

  // Which category each phrasing was filed under, so a cluster can take the
  // one its members most often used.
  const categoryVotes = new Map<string, Map<string, number>>()
  for (const clip of clips) {
    for (const a of clip.attack_points ?? []) {
      const text = a.point?.trim()
      if (!text || !a.category) continue
      const votes = categoryVotes.get(text) ?? new Map<string, number>()
      votes.set(a.category, (votes.get(a.category) ?? 0) + 1)
      categoryVotes.set(text, votes)
    }
  }

  return countRepeats(lists, ATTACK_POINT_LIMIT).map((item) => ({
    point: item.text,
    category: modalCategory(categoryVotes.get(item.text)),
    clips: item.clips,
  }))
}

function modalCategory(votes?: Map<string, number>): AttackCategory | 'situational' {
  if (!votes?.size) return 'situational'
  const [best] = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return best[0] as AttackCategory
}

/**
 * Situational tells, clustered WITHIN each situation bucket. Keying on the
 * exact `situation:tell` string split the same read across several rows the
 * same way attack points were split.
 */
function rankSituationalTells(
  clips: ScoutClipEvidence[]
): { situation: string; tell: string; clips: number }[] {
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
      countRepeats(lists, 10).map((item) => ({ situation, tell: item.text, clips: item.clips }))
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
export function aggregateScoutReport(clips: ScoutClipEvidence[]): AggregatedScoutReport {
  let offensive: TendencyObservation[] = []
  let defensive: TendencyObservation[] = []
  const formations = new Map<string, { name: string; side?: string; note?: string }>()
  const targetPlayers = new Map<string, { identifier: string; reason: string; confidence: number }>()
  let totalPlaysObserved = 0

  for (const clip of clips) {
    totalPlaysObserved += clip.plays_observed ?? 0
    offensive = rollupList(offensive, clip.offensive_tendencies ?? [])
    defensive = rollupList(defensive, clip.defensive_tendencies ?? [])
    for (const f of clip.formations ?? []) formations.set(f.name, f)
    for (const p of clip.target_players ?? []) {
      const existing = targetPlayers.get(p.identifier)
      if (!existing || p.confidence > existing.confidence) {
        targetPlayers.set(p.identifier, { identifier: p.identifier, reason: p.reason, confidence: p.confidence })
      }
    }
  }

  return {
    offensive_tendencies: offensive,
    defensive_tendencies: defensive,
    formations: [...formations.values()],
    situational_tells: rankSituationalTells(clips),
    attack_points: rankAttackPoints(clips),
    target_players: [...targetPlayers.values()],
    evidence_sufficiency: { plays_observed: totalPlaysObserved, clips_analyzed: clips.length },
  }
}
