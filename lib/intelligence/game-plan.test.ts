import { describe, it, expect } from 'vitest'
import { renderDefensiveProfile, buildRoleBriefRules, GamePlanSchema } from './game-plan'
import { aggregateDefensiveSnaps } from './aggregate-defense'
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

const profileOf = (snaps: DefensiveSnap[]) => aggregateDefensiveSnaps(snaps)

describe('the evidence handed to the model', () => {
  it('states every rate with the denominator it was computed over', () => {
    const rendered = renderDefensiveProfile(
      profileOf([
        ...times(8, { coverage_played: 'cover_3' }),
        ...times(32, { coverage_played: 'not_determinable' }),
      ])
    )
    // The failure this prevents: "Cover 3 on 20% of snaps" for a defence that
    // played it on 8 of the 8 snaps anyone could see.
    expect(rendered).toContain('readable on 8 of 40 snaps')
    expect(rendered).toContain('cover_3: 8 of 8 — 100%')
  })

  it('says a question was never readable rather than reporting nothing', () => {
    const rendered = renderDefensiveProfile(profileOf(times(6, { coverage_played: 'not_determinable' })))
    expect(rendered).toContain('COVERAGE PLAYED: never readable on this film (0 of 6 snaps)')
  })

  it('explains what each coverage id means, so the brief need not guess', () => {
    const rendered = renderDefensiveProfile(profileOf(times(5, { coverage_played: 'cover_1' })))
    // The coach's own definition, carried verbatim into the prompt: a Cover 1
    // safety is READING THE QUARTERBACK rather than covering a man. That is
    // what separates it from Cover 0 on this film.
    expect(rendered).toContain('reading the quarterback rather than covering a man')
  })

  it('reports a measured average with the count behind it', () => {
    const rendered = renderDefensiveProfile(
      profileOf([...times(3, { field_safety_depth: 12 }), ...times(9)])
    )
    expect(rendered).toContain('12 yards average over 3 measured snaps')
  })

  it('leaves a measurement out entirely rather than printing zero', () => {
    const rendered = renderDefensiveProfile(profileOf(times(6)))
    expect(rendered).not.toContain('FIELD SAFETY DEPTH')
    expect(rendered).not.toContain('BOX COUNT')
  })

  it('surfaces the hash cross-check against the coach breakdown', () => {
    const rendered = renderDefensiveProfile(
      aggregateDefensiveSnaps([snap(), snap({ ball_position: 'right_hash' })], ['L', 'L'])
    )
    expect(rendered).toContain('agreed on 1 of 2 snaps')
  })
})

describe('the role-brief rules', () => {
  it('orders a thin plan to declare itself thin', () => {
    expect(buildRoleBriefRules('Bradley', 'Carter Andrew', true)).toContain('THIN EVIDENCE')
  })

  it('does not cry thin when the sample supports a plan', () => {
    expect(buildRoleBriefRules('Bradley', 'Carter Andrew', false)).not.toContain('THIN EVIDENCE')
  })

  it('anchors every recommendation on us, never on the opponent', () => {
    const rules = buildRoleBriefRules('Bradley', 'Carter Andrew', false)
    expect(rules).toContain('Never recommend anything that helps Bradley')
    expect(rules).toContain('an action for Carter Andrew')
  })

  it('requires the denominator on every claim', () => {
    const rules = buildRoleBriefRules('Bradley', null, false)
    expect(rules).toContain('denominator')
    expect(rules).toContain('NOT a zero')
  })
})

describe('the brief shape', () => {
  it('rejects a half-built plan rather than rendering one', () => {
    expect(GamePlanSchema.safeParse({ headline: 'x' }).success).toBe(false)
  })

  it('accepts a complete plan', () => {
    const plan = {
      headline: 'h',
      identity: 'i',
      quarterback: {
        presnap_checklist: ['look at the field safety'],
        shell_reads: [{ point: 'p', evidence: 'two-high on 41 of 64' }],
        where_to_throw: [{ point: 'p', evidence: 'e' }],
        avoid: ['a'],
      },
      offensive_coordinator: { attack: [], formation_and_motion: [], situational: [] },
      defensive_coordinator: { take_away: [], personnel_matchups: [] },
      not_observed: ['third and long coverage'],
      evidence_note: 'n',
    }
    expect(GamePlanSchema.safeParse(plan).success).toBe(true)
  })
})
