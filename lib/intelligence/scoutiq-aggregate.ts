import { rollupTendency, type TendencyObservation } from './tendency-rollup'

export interface ScoutClipEvidence {
  plays_observed?: number | null
  offensive_tendencies?: TendencyObservation[] | null
  defensive_tendencies?: TendencyObservation[] | null
  formations?: { name: string; side?: string; note?: string }[] | null
  situational_tells?: { situation: string; tell: string; confidence?: number }[] | null
  attack_points?: string[] | null
  target_players?: { identifier: string; reason: string; confidence: number; evidence_frames?: number[] }[] | null
}

export interface AggregatedScoutReport {
  offensive_tendencies: TendencyObservation[]
  defensive_tendencies: TendencyObservation[]
  formations: { name: string; side?: string; note?: string }[]
  situational_tells: { situation: string; tell: string; confidence?: number }[]
  attack_points: string[]
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
  const situationalTells = new Map<string, { situation: string; tell: string; confidence?: number }>()
  const attackPoints = new Set<string>()
  const targetPlayers = new Map<string, { identifier: string; reason: string; confidence: number }>()
  let totalPlaysObserved = 0

  for (const clip of clips) {
    totalPlaysObserved += clip.plays_observed ?? 0
    offensive = rollupList(offensive, clip.offensive_tendencies ?? [])
    defensive = rollupList(defensive, clip.defensive_tendencies ?? [])
    for (const f of clip.formations ?? []) formations.set(f.name, f)
    for (const t of clip.situational_tells ?? []) situationalTells.set(`${t.situation}:${t.tell}`, t)
    for (const a of clip.attack_points ?? []) attackPoints.add(a)
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
    situational_tells: [...situationalTells.values()],
    attack_points: [...attackPoints],
    target_players: [...targetPlayers.values()],
    evidence_sufficiency: { plays_observed: totalPlaysObserved, clips_analyzed: clips.length },
  }
}
