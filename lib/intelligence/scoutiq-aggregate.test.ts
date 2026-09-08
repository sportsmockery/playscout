import { describe, it, expect } from 'vitest'
import { aggregateScoutReport } from './scoutiq-aggregate'

describe('aggregateScoutReport', () => {
  it('sums plays_observed and counts clips', () => {
    const result = aggregateScoutReport([
      { plays_observed: 10 },
      { plays_observed: 14 },
    ])
    expect(result.evidence_sufficiency).toEqual({
      plays_observed: 24,
      clips_analyzed: 2,
      // No possession recorded on either clip — pre-change results have to
      // keep counting, or every previously scouted clip drops out of the rank.
      defensive_clips: 2,
      offensive_clips: 0,
      unconfirmed_subject_clips: 0,
    })
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

  it('counts how many clips an attack point appeared in', () => {
    const result = aggregateScoutReport([
      {
        attack_points: [{ point: 'Weak edge contain', category: 'perimeter_run' }],
        situational_tells: [{ situation: 'money_down', tell: 'Runs up the middle' }],
      },
      {
        attack_points: [{ point: 'Weak edge contain', category: 'perimeter_run' }],
        situational_tells: [{ situation: 'money_down', tell: 'Runs up the middle' }],
      },
    ])
    expect(result.attack_points).toEqual([
      { point: 'Weak edge contain', category: 'perimeter_run', clips: 2 },
    ])
    expect(result.situational_tells).toEqual([
      { situation: 'money_down', tell: 'Runs up the middle', clips: 2 },
    ])
  })

  it('merges rephrasings and ranks by clip count', () => {
    // The whole point of a "top 25": an exact-string Set made these separate
    // entries, so a weakness seen in every clip ranked level with one seen once.
    const soft = (point: string) => ({ attack_points: [{ point, category: 'perimeter_run' }] })
    const result = aggregateScoutReport([
      soft('Soft edge to the field on third and short'),
      soft('Edge is soft to the field on third and short'),
      soft('The field edge is soft on third and short'),
      { attack_points: [{ point: 'Safety bites hard on play action', category: 'play_action' }] },
    ])

    expect(result.attack_points).toHaveLength(2)
    expect(result.attack_points[0].clips).toBe(3)
    expect(result.attack_points[0].category).toBe('perimeter_run')
    expect(result.attack_points[1]).toMatchObject({ clips: 1, category: 'play_action' })
  })

  it('leaves two descriptions that share no vocabulary as separate points', () => {
    // The honest failure direction. Clustering is lexical, so "soft edge" and
    // "force defender never sets the edge" stay apart even though a coach
    // would call them the same thing. Showing a point twice costs a line;
    // merging two different ones would hide evidence.
    const result = aggregateScoutReport([
      { attack_points: [{ point: 'Soft edge to the field', category: 'perimeter_run' }] },
      { attack_points: [{ point: 'Force defender never sets the edge', category: 'perimeter_run' }] },
    ])
    expect(result.attack_points).toHaveLength(2)
  })

  it('takes the category its clips most often filed it under', () => {
    const result = aggregateScoutReport([
      { attack_points: [{ point: 'Backside cutback lane', category: 'interior_run' }] },
      { attack_points: [{ point: 'Backside cutback lane', category: 'interior_run' }] },
      { attack_points: [{ point: 'Backside cutback lane', category: 'motion' }] },
    ])
    expect(result.attack_points[0].category).toBe('interior_run')
  })

  it('falls back to situational when no clip categorised it', () => {
    const result = aggregateScoutReport([{ attack_points: [{ point: 'Slow to sub personnel' }] }])
    expect(result.attack_points[0].category).toBe('situational')
  })

  it('keeps tells in different situations apart', () => {
    const result = aggregateScoutReport([
      {
        situational_tells: [
          { situation: 'money_down', tell: 'Runs up the middle' },
          { situation: 'red_zone', tell: 'Runs up the middle' },
        ],
      },
    ])
    expect(result.situational_tells).toHaveLength(2)
  })

  it('ranks attack points against the clips they were on DEFENSE, not the whole game', () => {
    // A whole-game cut-up is roughly half their offense. Counting a weakness
    // against every clip halves its apparent rate and the game-plan prompt is
    // told to treat a low count as a possible one-off — so the strongest real
    // finding is the one this hurt most.
    const onDefense = (point: string) => ({
      opponent_possession: 'defense' as const,
      attack_points: [{ point, category: 'perimeter_run' }],
    })
    const result = aggregateScoutReport([
      onDefense('Soft edge to the field'),
      onDefense('Soft edge to the field'),
      { opponent_possession: 'offense' },
      { opponent_possession: 'offense' },
    ])

    expect(result.evidence_sufficiency.clips_analyzed).toBe(4)
    expect(result.evidence_sufficiency.defensive_clips).toBe(2)
    expect(result.attack_points[0]).toMatchObject({ clips: 2 })
  })

  it('counts a clip showing both sides toward the defensive denominator', () => {
    const result = aggregateScoutReport([{ opponent_possession: 'both' }])
    expect(result.evidence_sufficiency.defensive_clips).toBe(1)
    expect(result.evidence_sufficiency.offensive_clips).toBe(1)
  })

  it('leaves an unclear clip out of the denominator rather than guessing', () => {
    const result = aggregateScoutReport([{ opponent_possession: 'unclear' }])
    expect(result.evidence_sufficiency.defensive_clips).toBe(0)
  })

  it('counts the clips where the analyst could not confirm the subject', () => {
    // On film containing neither of the coach's teams this number is the
    // credibility of the whole report.
    const result = aggregateScoutReport([
      { subject_confirmed: true },
      { subject_confirmed: false },
      {},
    ])
    expect(result.evidence_sufficiency.unconfirmed_subject_clips).toBe(1)
  })

  it('returns empty aggregates for no clips', () => {
    const result = aggregateScoutReport([])
    expect(result.evidence_sufficiency).toEqual({
      plays_observed: 0,
      clips_analyzed: 0,
      defensive_clips: 0,
      offensive_clips: 0,
      unconfirmed_subject_clips: 0,
    })
    expect(result.offensive_tendencies).toEqual([])
  })
})
