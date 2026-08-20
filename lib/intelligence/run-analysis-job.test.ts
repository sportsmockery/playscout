import { describe, it, expect } from 'vitest'
import {
  buildJobInput,
  claimNextAnalysisJob,
  CANDIDATE_LIMIT,
  WAITING_RETRY_MS,
  type AnalysisJobRow,
} from './run-analysis-job'

const job: AnalysisJobRow = {
  id: 'job1',
  batch_id: 'batch1',
  team_id: 'team-real',
  video_id: 'video-real',
  module_key: 'QBIQ',
  player_id: 'player-real',
  status: 'running',
  attempts: 0,
  max_attempts: 3,
}

describe('buildJobInput', () => {
  it('replays the coach-configured context for this clip', () => {
    const input = buildJobInput(
      { coachNote: 'Shotgun only', team: { name: 'Bulldogs', age_group: '10U' } },
      job
    )
    expect(input.coachNote).toBe('Shotgun only')
    expect(input.team?.name).toBe('Bulldogs')
    expect(input.videoId).toBe('video-real')
    expect(input.frames).toEqual([])
  })

  it('takes identity from the job row, never from the stored context', () => {
    // The context is user-supplied: it must not be able to redirect a run at
    // another team's film, another player's grade, or a different module.
    const input = buildJobInput(
      {
        teamId: 'team-someone-else',
        moduleKey: 'MISTAKEIQ',
        playerId: 'player-someone-else',
        videoId: 'video-someone-else',
        frames: ['injected-frame'],
      },
      job
    )
    expect(input.teamId).toBe('team-real')
    expect(input.moduleKey).toBe('QBIQ')
    expect(input.playerId).toBe('player-real')
    expect(input.videoId).toBe('video-real')
    expect(input.frames).toEqual([])
  })

  it('tolerates a missing or non-object context', () => {
    expect(buildJobInput(null, job).teamId).toBe('team-real')
    expect(buildJobInput(['nope'], job).moduleKey).toBe('QBIQ')
  })

  it('leaves playerId unset for team-level modules', () => {
    const input = buildJobInput({}, { ...job, module_key: 'TEAMIQ', player_id: null })
    expect(input.playerId).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ */
/* claimNextAnalysisJob                                                */
/* ------------------------------------------------------------------ */

interface FakeRow extends AnalysisJobRow {
  created_at: string
  updated_at: string
}

/**
 * Minimal stand-in for the analysis_batch_jobs table that actually EVALUATES
 * the filter the claim query sends, rather than handing back whatever rows the
 * test wants to see. That matters here: the bug being pinned was a filter
 * applied in the wrong place, so a fake that ignores filters would pass either
 * way.
 */
function fakeJobsTable(rows: FakeRow[]) {
  // Only the one expression shape claimNextAnalysisJob builds.
  function matchesOr(row: FakeRow, expr: string): boolean {
    const waitingCutoff = expr.match(/updated_at\.lte\.([^)]+)\)/)?.[1]
    if (!waitingCutoff) throw new Error(`unrecognized or() expression: ${expr}`)
    if (row.status === 'queued') return true
    if (row.status === 'waiting_for_film') return row.updated_at <= waitingCutoff
    return false
  }

  const state = { orExpr: '', limit: Infinity, teamId: undefined as string | undefined }

  function selectBuilder() {
    const builder: Record<string, unknown> = {
      or(expr: string) { state.orExpr = expr; return builder },
      order() { return builder },
      limit(n: number) { state.limit = n; return builder },
      eq(col: string, val: string) { if (col === 'team_id') state.teamId = val; return builder },
      then(resolve: (r: { data: FakeRow[] }) => unknown) {
        const data = rows
          .filter((r) => matchesOr(r, state.orExpr))
          .filter((r) => (state.teamId ? r.team_id === state.teamId : true))
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .slice(0, state.limit)
        return resolve({ data })
      },
    }
    return builder
  }

  function updateBuilder(changes: Record<string, unknown>) {
    let targetId = ''
    const builder: Record<string, unknown> = {
      eq(_col: string, val: string) { targetId = val; return builder },
      in() { return builder },
      select() { return builder },
      maybeSingle() {
        const row = rows.find((r) => r.id === targetId)
        if (!row) return Promise.resolve({ data: null })
        Object.assign(row, changes)
        return Promise.resolve({ data: { ...row } })
      },
    }
    return builder
  }

  return {
    lastOrExpr: () => state.orExpr,
    client: {
      from() {
        return {
          select: () => selectBuilder(),
          update: (changes: Record<string, unknown>) => updateBuilder(changes),
        }
      },
    },
  }
}

function makeRow(over: Partial<FakeRow> & { id: string }): FakeRow {
  return {
    batch_id: 'batch1',
    team_id: 'team1',
    video_id: `video-${over.id}`,
    module_key: 'RANKERIQ',
    player_id: null,
    status: 'queued',
    attempts: 0,
    max_attempts: 3,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('claimNextAnalysisJob', () => {
  it('does not let clips still waiting on film starve clips that are ready', async () => {
    // The exact shape that stalled a real 20-clip batch: the oldest clips are
    // all parked waiting for frame extraction and were touched seconds ago, so
    // every one of them is inside its backoff window. A ready clip sits behind
    // them. It must still get picked up.
    const justParked = new Date().toISOString()
    const rows: FakeRow[] = [
      ...Array.from({ length: CANDIDATE_LIMIT }, (_, i) =>
        makeRow({
          id: `waiting-${i}`,
          status: 'waiting_for_film',
          created_at: `2026-01-01T00:00:0${i}.000Z`,
          updated_at: justParked,
        })
      ),
      makeRow({ id: 'ready', status: 'queued', created_at: '2026-01-01T00:01:00.000Z' }),
    ]

    const fake = fakeJobsTable(rows)
    const claimed = await claimNextAnalysisJob(
      fake.client as never,
      { workerId: 'test-worker' }
    )

    expect(claimed?.id).toBe('ready')
    expect(claimed?.status).toBe('running')
  })

  it('picks up a parked clip once its backoff window has passed', async () => {
    const stale = new Date(Date.now() - WAITING_RETRY_MS - 5_000).toISOString()
    const fake = fakeJobsTable([
      makeRow({ id: 'parked-long-enough', status: 'waiting_for_film', updated_at: stale }),
    ])

    const claimed = await claimNextAnalysisJob(fake.client as never, { workerId: 'test-worker' })
    expect(claimed?.id).toBe('parked-long-enough')
  })

  it('returns null when every candidate is still inside its backoff window', async () => {
    const fake = fakeJobsTable([
      makeRow({ id: 'parked', status: 'waiting_for_film', updated_at: new Date().toISOString() }),
    ])

    const claimed = await claimNextAnalysisJob(fake.client as never, { workerId: 'test-worker' })
    expect(claimed).toBeNull()
  })

  it('scopes candidates to one team when asked', async () => {
    const fake = fakeJobsTable([
      makeRow({ id: 'other-team', team_id: 'team2', created_at: '2026-01-01T00:00:00.000Z' }),
      makeRow({ id: 'mine', team_id: 'team1', created_at: '2026-01-01T00:00:01.000Z' }),
    ])

    const claimed = await claimNextAnalysisJob(fake.client as never, {
      workerId: 'test-worker',
      teamId: 'team1',
    })
    expect(claimed?.id).toBe('mine')
  })
})
