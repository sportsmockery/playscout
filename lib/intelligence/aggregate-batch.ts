import type { PlayerGrade } from './schemas'
import { letterFor } from './player-grades'

/**
 * Deterministic rollup across every clip in an analysis batch.
 *
 * Everything here is arithmetic over what the per-clip analyses already
 * proved — counts, averages, repetition. The narrative layer
 * (batch-summary.ts) reasons OVER this; it never recomputes it. Keeping the
 * numbers out of the model is what lets a coach trust "graded 7 reps,
 * averaging 74" as a fact rather than a paraphrase.
 */

export interface BatchClipResult {
  analysisId: string
  videoId: string
  videoTitle: string
  overallScore: number | null
  summary: string | null
  strengths: string[]
  weaknesses: string[]
  drills: string[]
  playsObserved?: number | null
  confidence?: number | null
  playerGrades?: PlayerGrade[] | null
  mistakes?: { title: string; category: string; severity: string }[] | null
}

export interface RepeatedItem {
  text: string
  clips: number
}

export interface PlayerRollup {
  key: string
  playerId: string | null
  identifier: string
  jerseyNumber: string | null
  positions: string[]
  reps: number
  averageGrade: number
  letter: string
  bestGrade: number
  worstGrade: number
  /** Later-clip average minus earlier-clip average; null with too few reps. */
  trend: number | null
}

export interface MistakeRollup {
  category: string
  count: number
  worstSeverity: string
}

export interface BatchAggregate {
  clipsAnalyzed: number
  averageScore: number | null
  bestClip: { videoTitle: string; score: number } | null
  worstClip: { videoTitle: string; score: number } | null
  playsObserved: number
  recurringStrengths: RepeatedItem[]
  recurringWeaknesses: RepeatedItem[]
  topDrills: RepeatedItem[]
  playerRollup: PlayerRollup[]
  mistakeRollup: MistakeRollup[]
}

const SEVERITY_ORDER = ['minor', 'moderate', 'major', 'game_changing']

/**
 * Groups near-identical coaching points so "poor pad level" said in six clips
 * reads as one recurring problem rather than six separate ones. Deliberately
 * crude — lowercased, punctuation-stripped, first six words — because the
 * goal is grouping obvious repeats, not semantic clustering.
 */
function repetitionKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
}

function countRepeats(lists: string[][], limit = 8): RepeatedItem[] {
  const byKey = new Map<string, { text: string; clips: number }>()
  for (const list of lists) {
    // One clip saying the same thing twice still counts once.
    const seenInClip = new Set<string>()
    for (const raw of list) {
      const text = raw?.trim()
      if (!text) continue
      const key = repetitionKey(text)
      if (!key || seenInClip.has(key)) continue
      seenInClip.add(key)
      const existing = byKey.get(key)
      if (existing) existing.clips += 1
      else byKey.set(key, { text, clips: 1 })
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.clips - a.clips || a.text.localeCompare(b.text))
    .slice(0, limit)
    .map((r) => ({ text: r.text, clips: r.clips }))
}

/**
 * Identity for a graded player across clips: a matched roster row first, then
 * a legible jersey number, then the descriptive identifier. Descriptions are
 * scoped per position so "left tackle" in one clip doesn't silently merge
 * with a different player described the same way at another spot.
 */
function playerKey(g: PlayerGrade): string {
  if (g.player_id) return `player:${g.player_id}`
  if (g.jersey_number) return `jersey:${String(g.jersey_number).replace(/[^0-9]/g, '')}`
  return `desc:${g.identifier.toLowerCase()}|${(g.position ?? '').toLowerCase()}`
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/**
 * Trend across a player's reps, in grade points: the second half of their
 * reps minus the first. Needs at least four reps — below that a "trend" is
 * one good or bad rep masquerading as a pattern.
 */
function trendOf(grades: number[]): number | null {
  if (grades.length < 4) return null
  const mid = Math.floor(grades.length / 2)
  return Math.round(average(grades.slice(mid)) - average(grades.slice(0, mid)))
}

export function aggregateBatch(clips: BatchClipResult[]): BatchAggregate {
  const scored = clips.filter((c) => typeof c.overallScore === 'number') as (BatchClipResult & {
    overallScore: number
  })[]

  const byScore = [...scored].sort((a, b) => b.overallScore - a.overallScore)

  // Player grades keep clip order, so trend means "over the course of the
  // batch" rather than an arbitrary ordering.
  const gradesByPlayer = new Map<string, { grades: PlayerGrade[]; order: number[] }>()
  clips.forEach((clip) => {
    for (const g of clip.playerGrades ?? []) {
      if (typeof g.grade !== 'number') continue
      const key = playerKey(g)
      const entry = gradesByPlayer.get(key) ?? { grades: [], order: [] }
      entry.grades.push(g)
      entry.order.push(g.grade)
      gradesByPlayer.set(key, entry)
    }
  })

  const playerRollup: PlayerRollup[] = [...gradesByPlayer.entries()]
    .map(([key, { grades, order }]) => {
      const avg = Math.round(average(order))
      const withNumber = grades.find((g) => g.jersey_number)
      return {
        key,
        playerId: grades.find((g) => g.player_id)?.player_id ?? null,
        // Prefer the jersey-number identifier when any clip could read it —
        // "#54" is more useful to a coach than "left guard".
        identifier: withNumber?.identifier ?? grades[0].identifier,
        jerseyNumber: withNumber?.jersey_number ?? null,
        positions: [...new Set(grades.map((g) => g.position).filter(Boolean))],
        reps: grades.length,
        averageGrade: avg,
        letter: letterFor(avg),
        bestGrade: Math.max(...order),
        worstGrade: Math.min(...order),
        trend: trendOf(order),
      }
    })
    .sort((a, b) => b.averageGrade - a.averageGrade || b.reps - a.reps)

  const mistakeCounts = new Map<string, { count: number; worstSeverity: string }>()
  for (const clip of clips) {
    for (const m of clip.mistakes ?? []) {
      const existing = mistakeCounts.get(m.category) ?? { count: 0, worstSeverity: 'minor' }
      existing.count += 1
      if (SEVERITY_ORDER.indexOf(m.severity) > SEVERITY_ORDER.indexOf(existing.worstSeverity)) {
        existing.worstSeverity = m.severity
      }
      mistakeCounts.set(m.category, existing)
    }
  }

  return {
    clipsAnalyzed: clips.length,
    averageScore: scored.length ? Math.round(average(scored.map((c) => c.overallScore))) : null,
    bestClip: byScore.length
      ? { videoTitle: byScore[0].videoTitle, score: byScore[0].overallScore }
      : null,
    worstClip:
      byScore.length > 1
        ? {
            videoTitle: byScore[byScore.length - 1].videoTitle,
            score: byScore[byScore.length - 1].overallScore,
          }
        : null,
    playsObserved: clips.reduce((sum, c) => sum + (c.playsObserved ?? 0), 0),
    recurringStrengths: countRepeats(clips.map((c) => c.strengths ?? [])),
    recurringWeaknesses: countRepeats(clips.map((c) => c.weaknesses ?? [])),
    topDrills: countRepeats(clips.map((c) => c.drills ?? []), 6),
    playerRollup,
    mistakeRollup: [...mistakeCounts.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.count - a.count),
  }
}
