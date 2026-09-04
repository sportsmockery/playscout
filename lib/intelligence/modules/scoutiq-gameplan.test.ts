import { describe, it, expect } from 'vitest'
import { buildScoutIQGamePlanPrompt, type ScoutIQGamePlanContext } from './scoutiq-gameplan'
import type { AggregatedScoutReport } from '../scoutiq-aggregate'

const aggregated = (over: Partial<AggregatedScoutReport> = {}): AggregatedScoutReport => ({
  offensive_tendencies: [],
  defensive_tendencies: [],
  formations: [],
  situational_tells: [],
  attack_points: [],
  target_players: [],
  evidence_sufficiency: { plays_observed: 120, clips_analyzed: 52 },
  ...over,
})

const ctx = (over: Partial<ScoutIQGamePlanContext> = {}): ScoutIQGamePlanContext => ({
  opponentName: 'Red Team',
  aggregated: aggregated(),
  ...over,
})

describe('attack points in the game plan prompt', () => {
  it('renders each point with its category and clip count', () => {
    // These became objects when they gained a category. Rendered with the old
    // `${a}` they would reach the model as "[object Object]" — the prompt
    // would still look fine and the plan would be built on nothing.
    const prompt = buildScoutIQGamePlanPrompt(
      ctx({
        aggregated: aggregated({
          attack_points: [
            { point: 'Soft edge to the field', category: 'perimeter_run', clips: 30 },
            { point: 'Safety bites on play action', category: 'play_action', clips: 4 },
          ],
        }),
      })
    )

    expect(prompt).toContain('[Perimeter run] Soft edge to the field — seen in 30 clips')
    expect(prompt).toContain('[Play action] Safety bites on play action — seen in 4 clips')
    expect(prompt).not.toContain('[object Object]')
  })

  it('tells the model the counts are the ranking, not decoration', () => {
    const prompt = buildScoutIQGamePlanPrompt(ctx())
    expect(prompt).toContain('RANKED by how many clips')
    expect(prompt).toContain('must not present them as equally reliable')
  })

  it('says so plainly when nothing has been scouted yet', () => {
    expect(buildScoutIQGamePlanPrompt(ctx())).toContain('(none observed yet)')
  })

  it('counts a situational tell the same way', () => {
    const prompt = buildScoutIQGamePlanPrompt(
      ctx({
        aggregated: aggregated({
          situational_tells: [{ situation: 'money_down', tell: 'Runs up the middle', clips: 1 }],
        }),
      })
    )
    expect(prompt).toContain('money_down: Runs up the middle (1 clip)')
  })
})

describe('level calibration', () => {
  it('writes a varsity plan for a varsity staff', () => {
    // This module used the hardcoded 'unknown'-tier brain and then asked for a
    // plan "a volunteer 9U-10U coach can use" — the youth-only ceiling the
    // product removed everywhere else.
    const prompt = buildScoutIQGamePlanPrompt(
      ctx({ teamAgeGroup: 'Varsity', teamLevel: 'High School' })
    )

    expect(prompt).toContain('COMPETITION LEVEL: high-school varsity')
    expect(prompt).toContain('a high-school varsity coach can actually use')
    expect(prompt).not.toContain('9U-10U')
  })

  it('still writes a youth plan for a youth team', () => {
    const prompt = buildScoutIQGamePlanPrompt(ctx({ teamAgeGroup: '10U' }))
    expect(prompt).toContain('COMPETITION LEVEL: youth (9U–10U)')
    expect(prompt).toContain('a youth (9U–10U) coach can actually use')
  })
})
