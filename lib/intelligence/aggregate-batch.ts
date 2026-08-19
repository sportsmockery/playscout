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
  /**
   * roster/number = one specific player. role = a position across the batch,
   * which may be more than one child if numbers weren't legible.
   */
  identifiedBy: 'roster' | 'number' | 'role'
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

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'is', 'are', 'was', 'were',
  'with', 'for', 'from', 'by', 'that', 'this', 'it', 'its', 'their', 'his', 'her', 'they',
  'he', 'she', 'as', 'but', 'not', 'no', 'too', 'very', 'be', 'been', 'has', 'have', 'had',
  'which', 'who', 'when', 'while', 'into', 'out', 'up', 'down', 'off', 'more', 'some', 'can',
  'could', 'would', 'should', 'frame', 'frames', 'clip', 'clips',
])

/**
 * Content words for similarity, lightly stemmed so "blocks stalling" and
 * "block stalled" compare equal. Frame references are dropped — two clips
 * making the same point cite different frames, and letting those count as
 * differences is what kept real repeats apart.
 */
function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map((w) => (w.length > 4 ? w.replace(/(ings|ing|ed|es|s)$/, '') : w))
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const w of a) if (b.has(w)) shared += 1
  return shared / (a.size + b.size - shared)
}

/**
 * How much two coaching points must overlap to count as the same point.
 * Tuned against real reports, where the same problem is phrased differently
 * in every clip ("backside guard late off the double" vs "backside guard late
 * getting off the double team"). A first-six-words key never merged those, so
 * every item showed 1x and the recurring lists were useless.
 */
const REPEAT_SIMILARITY = 0.5

function countRepeats(lists: string[][], limit = 8): RepeatedItem[] {
  const clusters: { text: string; words: Set<string>; clips: number }[] = []

  for (const list of lists) {
    // One clip saying the same thing twice still counts once.
    const matchedThisClip = new Set<number>()
    for (const raw of list) {
      const text = raw?.trim()
      if (!text) continue
      const words = contentWords(text)
      if (!words.size) continue

      let bestIndex = -1
      let bestScore = 0
      clusters.forEach((c, i) => {
        const score = jaccard(words, c.words)
        if (score > bestScore) {
          bestScore = score
          bestIndex = i
        }
      })

      if (bestScore >= REPEAT_SIMILARITY && bestIndex >= 0) {
        if (!matchedThisClip.has(bestIndex)) {
          clusters[bestIndex].clips += 1
          matchedThisClip.add(bestIndex)
        }
        // Keep the shortest phrasing — it reads best as the canonical label.
        if (text.length < clusters[bestIndex].text.length) clusters[bestIndex].text = text
      } else {
        clusters.push({ text, words, clips: 1 })
        matchedThisClip.add(clusters.length - 1)
      }
    }
  }

  return clusters
    .sort((a, b) => b.clips - a.clips || a.text.localeCompare(b.text))
    .slice(0, limit)
    .map((c) => ({ text: c.text, clips: c.clips }))
}

/**
 * Alignment words that describe the PLAY, not the player. "Pulling left
 * guard" and "left guard" are the same kid doing different jobs; leaving them
 * unmerged turned an 11-player unit into 30 rollup rows.
 */
const ROLE_QUALIFIERS = [
  'pulling', 'playside', 'play side', 'backside', 'back side', 'frontside', 'front side',
  'lead', 'near', 'far', 'weakside', 'weak side', 'strongside', 'strong side', 'covered',
  'uncovered', 'the',
]

/** Position codes and long forms that mean the same spot. Left/right are kept
 *  distinct on purpose — those are different players. */
const POSITION_ALIASES: Record<string, string> = {
  lt: 'left tackle', rt: 'right tackle', lg: 'left guard', rg: 'right guard',
  c: 'center', ol: 'offensive line',
  qb: 'quarterback', rb: 'running back', hb: 'running back', tb: 'running back',
  tailback: 'running back', halfback: 'running back',
  fb: 'fullback', te: 'tight end', wr: 'wide receiver', receiver: 'wide receiver',
  de: 'defensive end', dt: 'defensive tackle', nt: 'nose tackle', dl: 'defensive line',
  lb: 'linebacker', ilb: 'linebacker', olb: 'linebacker',
  cb: 'cornerback', corner: 'cornerback', fs: 'free safety', ss: 'strong safety',
  db: 'defensive back',
}

/**
 * Collapses a descriptive label to the role it names, so the same player
 * described three ways across a batch lands in one row.
 */
export function normalizeRoleLabel(raw: string): string {
  let text = (raw ?? '')
    .toLowerCase()
    .split('/')[0]                    // "fullback / lead blocker" -> "fullback"
    .replace(/\([^)]*\)/g, ' ')       // drop "(black jersey)"
    .replace(/#\s*\d+/g, ' ')         // drop any number
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  for (const q of ROLE_QUALIFIERS) {
    text = text.replace(new RegExp(`\\b${q}\\b`, 'g'), ' ')
  }
  text = text.replace(/\s+/g, ' ').trim()

  return POSITION_ALIASES[text] ?? text
}

/**
 * Identity for a graded player across clips: a matched roster row first, then
 * a verified jersey number, then the normalized role.
 *
 * Role rows can legitimately cover more than one child (two different wide
 * receivers both described as "wide receiver" in different clips). That's why
 * PlayerRollup carries `identifiedBy` — the UI has to say so rather than
 * implying a role row is one player.
 */
function roleKeyOf(g: PlayerGrade): string {
  return `role:${normalizeRoleLabel(g.position || g.identifier) || 'unidentified'}`
}

function playerKey(g: PlayerGrade): string {
  if (g.player_id) return `player:${g.player_id}`
  if (g.jersey_number) return `jersey:${String(g.jersey_number).replace(/[^0-9]/g, '')}`
  return roleKeyOf(g)
}

/**
 * Groups every graded rep in the batch into one row per player.
 *
 * The subtle case is a jersey number that was never confirmed against a
 * roster. Grouping purely by number produced rows like "#55 — Right Tackle,
 * Fullback, Right Guard, Left Guard, Running Back" across seven reps: one
 * number stuck onto six different kids. A number that moves around the
 * formation like that is evidence the digits were misread, not evidence of a
 * versatile player.
 *
 * So an unconfirmed number only holds a group together while the reps agree
 * on a position. When they don't, the number is abandoned and those reps fall
 * back to role rows — the honest unit when we can't tell players apart.
 * A roster-MATCHED number is exempt: there the roster is ground truth for who
 * the player is, and a two-way kid genuinely does play several spots.
 */
function groupGradesForRollup(clips: BatchClipResult[]): Map<string, PlayerGrade[]> {
  const preliminary = new Map<string, PlayerGrade[]>()
  for (const clip of clips) {
    for (const g of clip.playerGrades ?? []) {
      if (typeof g.grade !== 'number') continue
      const key = playerKey(g)
      preliminary.set(key, [...(preliminary.get(key) ?? []), g])
    }
  }

  const final = new Map<string, PlayerGrade[]>()
  const push = (key: string, grade: PlayerGrade) =>
    final.set(key, [...(final.get(key) ?? []), grade])

  for (const [key, grades] of preliminary) {
    const rosterBacked = grades.some((g) => g.player_id)
    const roles = new Set(grades.map((g) => normalizeRoleLabel(g.position || g.identifier)))

    if (key.startsWith('jersey:') && !rosterBacked && roles.size > 1) {
      // The number contradicts itself across the batch — drop it.
      for (const g of grades) {
        push(roleKeyOf(g), {
          ...g,
          jersey_number: null,
          identifier: normalizeRoleLabel(g.position || g.identifier) || g.identifier,
          number_rejected_reason:
            g.number_rejected_reason ??
            'the same number was read at several different positions across this batch',
        })
      }
      continue
    }

    for (const g of grades) push(key, g)
  }

  return final
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

  // Clips are visited in order, so trend means "over the course of the batch"
  // rather than an arbitrary ordering.
  const gradesByPlayer = groupGradesForRollup(clips)

  const playerRollup: PlayerRollup[] = [...gradesByPlayer.entries()]
    .map(([key, grades]) => {
      const order = grades.map((g) => g.grade as number)
      const avg = Math.round(average(order))
      const withNumber = grades.find((g) => g.jersey_number)
      const playerId = grades.find((g) => g.player_id)?.player_id ?? null
      const role = normalizeRoleLabel(grades[0].position || grades[0].identifier)
      const identifiedBy: PlayerRollup['identifiedBy'] = playerId
        ? 'roster'
        : withNumber
          ? 'number'
          : 'role'
      return {
        key,
        playerId,
        // Prefer the verified-number identifier when any clip could read it —
        // "#54" is more useful to a coach than "left guard". Otherwise show
        // the normalized role so the label matches what the row actually is.
        identifier: withNumber?.identifier ?? (role ? role.replace(/\b\w/g, (c) => c.toUpperCase()) : grades[0].identifier),
        jerseyNumber: withNumber?.jersey_number ?? null,
        identifiedBy,
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
