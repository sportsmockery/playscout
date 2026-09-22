import { describe, it, expect } from 'vitest'
import {
  aggregateDefensiveSnaps,
  profileIsThin,
  MIN_SPLIT_SNAPS,
} from './aggregate-defense'
import type { DefensiveSnap } from './defense-structure'

const snap = (over: Partial<DefensiveSnap> = {}): DefensiveSnap => ({
  presnap_shell: 'two_high',
  coverage_played: 'cover_2',
  safety_rotation: 'stayed_two_high',
  strength_declared: 'to_field',
  ball_position: 'left_hash',
  pressure_look: 'four_man',
  ...over,
})

const times = (n: number, over: Partial<DefensiveSnap> = {}) =>
  Array.from({ length: n }, () => snap(over))

describe('the two denominators', () => {
  // The trap this exists to avoid: a coverage readable on 10 of 40 snaps and
  // played 8 of those times is an 80% tendency, not a 20% one.
  it('rates a coverage against the snaps it was readable on, not all snaps', () => {
    const p = aggregateDefensiveSnaps([
      ...times(8, { coverage_played: 'cover_3' }),
      ...times(2, { coverage_played: 'cover_1' }),
      ...times(30, { coverage_played: 'not_determinable' }),
    ])
    expect(p.snaps).toBe(40)
    expect(p.coverages.readable).toBe(10)
    expect(p.coverages.distribution[0]).toMatchObject({ value: 'cover_3', count: 8 })
    expect(p.coverages.distribution[0].rate).toBeCloseTo(0.8)
  })

  it('counts shells and coverages against their own denominators', () => {
    const p = aggregateDefensiveSnaps([
      ...times(20, { presnap_shell: 'two_high', coverage_played: 'not_determinable' }),
      ...times(5, { presnap_shell: 'two_high', coverage_played: 'cover_2' }),
    ])
    expect(p.shells.readable).toBe(25)
    expect(p.coverages.readable).toBe(5)
  })

  it('never counts an abstention as an observation', () => {
    const p = aggregateDefensiveSnaps(times(6, { presnap_shell: 'not_visible' }))
    expect(p.shells.readable).toBe(0)
    expect(p.shells.distribution).toEqual([])
  })
})

describe('splits answer the coach questions', () => {
  it('splits the shell by hash — what changes with the ball on a hash', () => {
    const p = aggregateDefensiveSnaps([
      ...times(6, { ball_position: 'left_hash', presnap_shell: 'one_high' }),
      ...times(5, { ball_position: 'right_hash', presnap_shell: 'two_high' }),
    ])
    const left = p.shellByBallPosition.find((s) => s.key === 'Ball on the left hash')
    const right = p.shellByBallPosition.find((s) => s.key === 'Ball on the right hash')
    expect(left?.top?.value).toBe('one_high')
    expect(right?.top?.value).toBe('two_high')
  })

  it('splits rotation by declared strength — strong side versus weak', () => {
    const p = aggregateDefensiveSnaps([
      ...times(5, { strength_declared: 'to_tight_end', safety_rotation: 'rotated_to_strength' }),
      ...times(4, { strength_declared: 'to_field', safety_rotation: 'stayed_two_high' }),
    ])
    expect(p.rotationByStrength.find((s) => s.key.includes('tight end'))?.top?.value).toBe(
      'rotated_to_strength'
    )
  })

  it('splits coverage by situation', () => {
    const p = aggregateDefensiveSnaps([
      ...times(5, { situation: 'money_down', coverage_played: 'cover_0' }),
      ...times(5, { situation: 'first_and_ten', coverage_played: 'cover_3' }),
    ])
    expect(p.coverageBySituation.find((s) => s.key === 'money_down')?.top?.value).toBe('cover_0')
  })

  // Three snaps reading "100% two-high on the left hash" loses games.
  it('withholds a split that rests on too few snaps', () => {
    const p = aggregateDefensiveSnaps(times(MIN_SPLIT_SNAPS - 1, { ball_position: 'right_hash' }))
    expect(p.shellByBallPosition).toEqual([])
  })
})

describe('measurements', () => {
  it('averages safety depth only over snaps where it was measured', () => {
    const p = aggregateDefensiveSnaps([
      snap({ field_safety_depth: 12, boundary_safety_depth: 10 }),
      snap({ field_safety_depth: 14, boundary_safety_depth: null }),
      snap({ field_safety_depth: null, boundary_safety_depth: null }),
    ])
    expect(p.safetyDepth.field).toEqual({ mean: 13, measured: 2 })
    expect(p.safetyDepth.boundary).toEqual({ mean: 10, measured: 1 })
  })

  it('reports no average rather than zero when nothing was measured', () => {
    const p = aggregateDefensiveSnaps(times(4))
    expect(p.safetyDepth.field).toBeNull()
    expect(p.boxCount).toBeNull()
  })

  it('rates pressure against readable rushes and counts the bluffs', () => {
    const p = aggregateDefensiveSnaps([
      ...times(3, { pressure_look: 'five_man_edge' }),
      ...times(5, { pressure_look: 'four_man' }),
      ...times(2, { pressure_look: 'showed_pressure_bailed' }),
      ...times(4, { pressure_look: 'not_determinable' }),
    ])
    expect(p.pressure.readable).toBe(10)
    expect(p.pressure.blitzed).toBe(3)
    expect(p.pressure.rate).toBeCloseTo(0.3)
    expect(p.pressure.bailedShowing).toBe(2)
  })
})

describe('pre-snap tells', () => {
  it('groups by kind rather than by wording, so one tell does not read as six', () => {
    const p = aggregateDefensiveSnaps([
      snap({
        presnap_tells: [
          { kind: 'safety_depth', observation: 'Field safety at 8 yards', confidence: 0.8 },
        ],
      }),
      snap({
        presnap_tells: [
          { kind: 'safety_depth', observation: 'Strong safety crept to 7', confidence: 0.6 },
        ],
      }),
      snap({
        presnap_tells: [{ kind: 'corner_leverage', observation: 'Boundary corner pressed' }],
      }),
    ])
    expect(p.tells[0]).toMatchObject({ kind: 'safety_depth', count: 2 })
    expect(p.tells[0].meanConfidence).toBeCloseTo(0.7)
    expect(p.tells[0].observations).toHaveLength(2)
  })
})

describe('the hash cross-check', () => {
  it('counts where the film read disagrees with the coach breakdown', () => {
    const snaps = [
      snap({ ball_position: 'left_hash' }),
      snap({ ball_position: 'right_hash' }),
      snap({ ball_position: 'middle' }),
    ]
    const p = aggregateDefensiveSnaps(snaps, ['L', 'L', 'M'])
    expect(p.hashChecked).toBe(3)
    expect(p.hashDisagreements).toBe(1)
  })

  it('checks nothing when the coach attached no breakdown', () => {
    const p = aggregateDefensiveSnaps(times(4))
    expect(p.hashChecked).toBe(0)
    expect(p.hashDisagreements).toBe(0)
  })

  it('skips a snap whose hash the film could not read', () => {
    const p = aggregateDefensiveSnaps([snap({ ball_position: 'not_determinable' })], ['L'])
    expect(p.hashChecked).toBe(0)
  })
})

describe('thin evidence is declared, not extrapolated', () => {
  it('flags a profile built on too few readable shells', () => {
    expect(profileIsThin(aggregateDefensiveSnaps(times(4)))).toBe(true)
    expect(profileIsThin(aggregateDefensiveSnaps(times(12)))).toBe(false)
  })

  it('survives a batch where the opponent was never on defence', () => {
    const p = aggregateDefensiveSnaps([])
    expect(p.snaps).toBe(0)
    expect(p.shells.readable).toBe(0)
    expect(profileIsThin(p)).toBe(true)
  })
})
