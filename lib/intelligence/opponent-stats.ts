import { aggregateStatCredits, type StatCredit, type StatTally } from './stat-lines'

/**
 * An opponent's box score for a scouting report, built from STATSIQ runs on
 * the same film.
 *
 * SCOUTIQ never charts statistics itself. It reads alignment at 2fps; a box
 * score needs STATSIQ's two-read charting at 6fps. So a scouting report's
 * numbers can only come from StatsIQ runs over the same clips, and only from
 * runs that charted THE OPPONENT. A run on the coach's own film charts the
 * coach's own players, and those numbers under an opponent's name would be
 * exactly the misattribution StatsIQ's identity rules exist to stop. So would
 * a run from before `stat_subject` was recorded, when opponent film was
 * charted with no jersey colour and so no way to tell the two teams apart.
 * Neither is used.
 */

export interface StatsIQRunRow {
  video_id: string | null
  created_at: string
  evidence: {
    stat_credits?: StatCredit[] | null
    team_stats?: { nullifiedPlays?: number } | null
    stat_subject?: { side?: string; name?: string | null } | null
  } | null
}

export interface OpponentStats {
  tally: StatTally
  /** Clips of this report that StatsIQ charted for the opponent. */
  chartedClips: number
  /** The name the runs charted under, for the heading. */
  chartedAs: string | null
}

export function tallyOpponentStats(rows: StatsIQRunRow[], reportVideoIds: string[]): OpponentStats | null {
  const inReport = new Set(reportVideoIds)
  // The latest opponent run per clip: a re-chart supersedes the last one
  // rather than being added to it, which would count every play twice.
  const latest = new Map<string, StatsIQRunRow>()
  for (const row of rows) {
    if (!row.video_id || !inReport.has(row.video_id)) continue
    if (row.evidence?.stat_subject?.side !== 'opponent') continue
    const seen = latest.get(row.video_id)
    if (!seen || row.created_at > seen.created_at) latest.set(row.video_id, row)
  }
  if (!latest.size) return null

  // Clip order, so play indexes run in the order the film does.
  const ordered = reportVideoIds.map((id) => latest.get(id)).filter((r): r is StatsIQRunRow => !!r)
  const tally = aggregateStatCredits(
    ordered.map((r) => r.evidence?.stat_credits ?? []),
    ordered.map((r) => r.evidence?.team_stats?.nullifiedPlays ?? 0)
  )
  return {
    tally,
    chartedClips: ordered.length,
    chartedAs: ordered.find((r) => r.evidence?.stat_subject?.name)?.evidence?.stat_subject?.name ?? null,
  }
}
