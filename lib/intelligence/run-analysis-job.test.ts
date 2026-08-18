import { describe, it, expect } from 'vitest'
import { buildJobInput, type AnalysisJobRow } from './run-analysis-job'

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
