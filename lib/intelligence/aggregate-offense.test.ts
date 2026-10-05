import { describe, it, expect } from 'vitest'
import { aggregateOffensiveSnaps } from './aggregate-offense'
import { normalizeOffensiveSnap, type OffensiveSnap } from './offense-structure'
import { aggregateScoutReport, type ScoutClipEvidence } from './scoutiq-aggregate'

const snap = (over: Partial<OffensiveSnap>): OffensiveSnap => ({
  formation: 'double_wing',
  motion: 'none',
  play_type: 'inside_run',
  direction: 'middle',
  result: 'gain',
  ...over,
})

describe('aggregateOffensiveSnaps', () => {
  it('counts run/pass and direction over the snaps where each was readable', () => {
    const profile = aggregateOffensiveSnaps([
      snap({ play_type: 'outside_run', direction: 'right' }),
      snap({ play_type: 'outside_run', direction: 'right' }),
      snap({ play_type: 'inside_run', direction: 'not_visible' }),
      snap({ play_type: 'play_action_pass', direction: 'left' }),
      snap({ play_type: 'unclear' }),
    ])
    expect(profile.snaps).toBe(5)
    expect(profile.runPass).toEqual({ readable: 4, runs: 3, passes: 1 })
    // Direction is over RUNS whose direction was readable: 2, not 5.
    expect(profile.runDirection.readable).toBe(2)
    expect(profile.runDirection.distribution[0]).toMatchObject({ value: 'right', count: 2, rate: 1 })
  })

  it('counts a touchdown or a 10+ yard gain as explosive', () => {
    const profile = aggregateOffensiveSnaps([
      snap({ gain_yards: 12 }),
      snap({ result: 'touchdown', gain_yards: null }),
      snap({ gain_yards: 4 }),
    ])
    expect(profile.explosive.count).toBe(2)
    expect(profile.gain).toEqual({ mean: 8, measured: 2 })
  })

  it('splits play type by formation only once a formation has enough snaps', () => {
    const many = Array.from({ length: 4 }, () => snap({ formation: 'double_wing', play_type: 'inside_run' }))
    const profile = aggregateOffensiveSnaps([...many, snap({ formation: 'empty', play_type: 'dropback_pass' })])
    expect(profile.playTypeByFormation.map((s) => s.key)).toEqual(['Out of double wing'])
  })
})

describe('normalizeOffensiveSnap', () => {
  it('turns an off-list answer into that field\'s abstention rather than a new category', () => {
    const s = normalizeOffensiveSnap({ formation: 'wishbone?', play_type: 'run maybe', ball_carrier: '#22', direction: 'right' })
    expect(s.formation).toBe('not_visible')
    expect(s.play_type).toBe('unclear')
    expect(s.ball_carrier).toBeNull()
    expect(s.direction).toBe('right')
  })
})

describe('aggregateScoutReport — offense and defense kept apart', () => {
  const clips: ScoutClipEvidence[] = [
    {
      opponent_possession: 'offense',
      offensive_snaps: [snap({ play_type: 'outside_run', direction: 'right' })],
      stop_points: [{ point: 'Set the edge against the sweep', category: 'edge_contain', threat: 'outside_run' }],
      key_players: [{ identifier: 'Tailback', reason: 'Gets every toss', confidence: 0.8 }],
      situational_tells: [{ situation: 'first_and_ten', tell: 'Sweep right' }],
      formations: [{ name: 'double_wing' }],
    },
    {
      opponent_possession: 'offense',
      offensive_snaps: [snap({ play_type: 'outside_run', direction: 'right' })],
      stop_points: [{ point: 'Their toss goes to the edge every time', category: 'edge_contain', threat: 'outside_run' }],
      key_players: [{ identifier: 'tailback', reason: 'Fast', confidence: 0.6 }],
    },
    {
      opponent_possession: 'defense',
      attack_points: [{ point: 'Corners play soft', category: 'dropback_pass', weakness: 'soft_coverage' }],
      target_players: [{ identifier: 'Right corner', reason: 'Bites', confidence: 0.7 }],
      situational_tells: [{ situation: 'passing_down', tell: 'They blitz' }],
      formations: [{ name: 'five_three' }],
    },
  ]
  const report = aggregateScoutReport(clips)

  it('builds the offense half only from clips where they had the ball', () => {
    expect(report.offense.clips).toBe(2)
    expect(report.offense.profile.snaps).toBe(2)
    expect(report.offense.formations).toEqual([{ name: 'double_wing', clips: 1 }])
    expect(report.offense.situational_tells.map((t) => t.situation)).toEqual(['first_and_ten'])
  })

  it('counts two differently worded stop points with the same threat id as one, seen twice', () => {
    expect(report.offense.stop_points).toHaveLength(1)
    expect(report.offense.stop_points[0]).toMatchObject({ clips: 2, category: 'edge_contain' })
  })

  it('merges a playmaker named the same way across clips', () => {
    expect(report.offense.key_players).toHaveLength(1)
    expect(report.offense.key_players[0]).toMatchObject({ clips: 2, confidence: 0.8 })
  })

  it('keeps defense-only evidence out of the offense half and vice versa', () => {
    expect(report.attack_points.map((a) => a.point)).toEqual(['Corners play soft'])
    expect(report.target_players.map((p) => p.identifier)).toEqual(['Right corner'])
    expect(report.situational_tells.map((t) => t.situation)).toEqual(['passing_down'])
    expect(report.defensive_fronts).toEqual([{ name: 'five_three', clips: 1 }])
  })
})
