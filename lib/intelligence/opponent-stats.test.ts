import { describe, it, expect } from 'vitest'
import { tallyOpponentStats, type StatsIQRunRow } from './opponent-stats'
import { tallyStatPlays } from './stat-lines'

/** One clip's credits, produced by the real tally so the shape is never hand-rolled. */
const rushCredits = (yards: number) =>
  tallyStatPlays([
    {
      play_index: 1,
      possession: 'offense',
      play_type: 'run',
      result: 'gain',
      yards,
      yards_basis: 'field_landmarks',
      credits: [{ stat: 'rush', position: 'rb', yards }],
    },
  ]).credits

const run = (over: Partial<StatsIQRunRow> & { side?: string; yards?: number }): StatsIQRunRow => ({
  video_id: over.video_id ?? 'v1',
  created_at: over.created_at ?? '2026-10-02T00:00:00Z',
  evidence: {
    stat_credits: rushCredits(over.yards ?? 5),
    team_stats: { nullifiedPlays: 0 },
    stat_subject: over.side === undefined ? { side: 'opponent', name: 'LWE' } : over.side ? { side: over.side, name: 'LWE' } : null,
  },
})

describe('tallyOpponentStats', () => {
  it('builds the opponent box score from runs that charted the opponent', () => {
    const stats = tallyOpponentStats([run({ video_id: 'v1', yards: 5 }), run({ video_id: 'v2', yards: 7 })], ['v1', 'v2'])
    expect(stats?.chartedClips).toBe(2)
    expect(stats?.chartedAs).toBe('LWE')
    expect(stats?.tally.team.offense.carries).toBe(2)
    expect(stats?.tally.team.offense.rush_yards).toBe(12)
  })

  it("never shows the coach's own team's numbers under an opponent's name", () => {
    expect(tallyOpponentStats([run({ side: 'self' })], ['v1'])).toBeNull()
  })

  it('ignores runs from before whose stats they were was recorded', () => {
    // Opponent film used to be charted with no jersey colour, so those runs
    // cannot say which team they counted.
    expect(tallyOpponentStats([run({ side: null as unknown as string })], ['v1'])).toBeNull()
  })

  it('counts only clips that are in this report', () => {
    expect(tallyOpponentStats([run({ video_id: 'other' })], ['v1'])).toBeNull()
  })

  it('uses the latest re-chart of a clip instead of adding both', () => {
    const stats = tallyOpponentStats(
      [
        run({ video_id: 'v1', yards: 5, created_at: '2026-10-01T00:00:00Z' }),
        run({ video_id: 'v1', yards: 9, created_at: '2026-10-02T00:00:00Z' }),
      ],
      ['v1']
    )
    expect(stats?.tally.team.offense.carries).toBe(1)
    expect(stats?.tally.team.offense.rush_yards).toBe(9)
  })
})
