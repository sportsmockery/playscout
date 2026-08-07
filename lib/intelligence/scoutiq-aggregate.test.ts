import { describe, it, expect } from 'vitest'
import { aggregateScoutReport } from './scoutiq-aggregate'

describe('aggregateScoutReport', () => {
  it('sums plays_observed and counts clips', () => {
    const result = aggregateScoutReport([
      { plays_observed: 10 },
      { plays_observed: 14 },
    ])
    expect(result.evidence_sufficiency).toEqual({ plays_observed: 24, clips_analyzed: 2 })
  })

  it('rolls up tendencies with the same type+label across clips', () => {
    const result = aggregateScoutReport([
      { offensive_tendencies: [{ tendency_type: 'run_direction', label: 'Runs right', rate: 0.8, confidence: 0.6, sample_size: 10 }] },
      { offensive_tendencies: [{ tendency_type: 'run_direction', label: 'Runs right', rate: 0.4, confidence: 0.5, sample_size: 10 }] },
    ])
    expect(result.offensive_tendencies).toHaveLength(1)
    expect(result.offensive_tendencies[0].rate).toBeCloseTo(0.6)
    expect(result.offensive_tendencies[0].sample_size).toBe(20)
  })

  it('keeps distinct tendencies separate', () => {
    const result = aggregateScoutReport([
      { offensive_tendencies: [
        { tendency_type: 'run_direction', label: 'Runs right', rate: 0.8, confidence: 0.6, sample_size: 10 },
        { tendency_type: 'formation_frequency', label: 'Tight double wing', rate: 0.5, confidence: 0.5, sample_size: 10 },
      ] },
    ])
    expect(result.offensive_tendencies).toHaveLength(2)
  })

  it('dedupes formations by name', () => {
    const result = aggregateScoutReport([
      { formations: [{ name: 'Wing-T' }] },
      { formations: [{ name: 'Wing-T' }, { name: 'Spread' }] },
    ])
    expect(result.formations.map((f) => f.name).sort()).toEqual(['Spread', 'Wing-T'])
  })

  it('keeps the higher-confidence read for a repeated target player', () => {
    const result = aggregateScoutReport([
      { target_players: [{ identifier: 'White #24', reason: 'Bites on play-action', confidence: 0.4 }] },
      { target_players: [{ identifier: 'White #24', reason: 'Bites on play-action, confirmed again', confidence: 0.7 }] },
    ])
    expect(result.target_players).toHaveLength(1)
    expect(result.target_players[0].confidence).toBe(0.7)
    expect(result.target_players[0].reason).toContain('confirmed again')
  })

  it('dedupes attack points and situational tells', () => {
    const result = aggregateScoutReport([
      { attack_points: ['Weak edge contain'], situational_tells: [{ situation: '3rd and short', tell: 'Runs up the middle' }] },
      { attack_points: ['Weak edge contain'], situational_tells: [{ situation: '3rd and short', tell: 'Runs up the middle' }] },
    ])
    expect(result.attack_points).toEqual(['Weak edge contain'])
    expect(result.situational_tells).toHaveLength(1)
  })

  it('returns empty aggregates for no clips', () => {
    const result = aggregateScoutReport([])
    expect(result.evidence_sufficiency).toEqual({ plays_observed: 0, clips_analyzed: 0 })
    expect(result.offensive_tendencies).toEqual([])
  })
})
