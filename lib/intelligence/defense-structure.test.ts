import { describe, it, expect } from 'vitest'
import {
  normalizeDefensiveSnap,
  buildDefensiveStructurePrompt,
  COVERAGE_DEFINITIONS,
  COVERAGE_SHELL_DEFINITIONS,
  deriveShell,
  deriveCoverage,
  deriveSafetyRotation,
  derivePressureLook,
  type DefenderRow,
} from './defense-structure'

describe('coverage and pressure stay independent', () => {
  // A coach's correction, and the reason this file has tests at all: "normally
  // those coverages involve pressure but one doesn't guarantee the other."
  // A precondition inside a definition makes the model hunt for the
  // precondition and abstain when it is absent — suppressing the read the
  // field exists for.
  const PRECONDITION_WORDS = [
    'almost always with pressure',
    'usually all-out pressure',
    'requires pressure',
    'only with pressure',
  ]

  it('defines Cover 0 by the safety, not by the rush', () => {
    const cover0 = COVERAGE_DEFINITIONS.cover_0.toLowerCase()
    expect(cover0).toContain('no safety in the deep middle')
    expect(cover0).toContain('not required')
    for (const phrase of PRECONDITION_WORDS) {
      expect(cover0).not.toContain(phrase)
    }
  })

  it('defines Cover 1 by the safety reading the quarterback', () => {
    expect(COVERAGE_DEFINITIONS.cover_1.toLowerCase()).toContain(
      'reading the quarterback rather than covering a man'
    )
  })

  it('does not make a zero-high shell conditional on pressure or the goal line', () => {
    const zero = COVERAGE_SHELL_DEFINITIONS.zero_high.toLowerCase()
    expect(zero).toContain('base call for some defences')
    for (const phrase of PRECONDITION_WORDS) {
      expect(zero).not.toContain(phrase)
    }
  })

  it('tells the read never to infer one from the other', () => {
    const prompt = buildDefensiveStructurePrompt('Bradley')
    expect(prompt).toContain('COVERAGE AND PRESSURE ARE TWO SEPARATE OBSERVATIONS')
    expect(prompt).toContain('CORRELATION, not a definition')
    expect(prompt).toContain('so nobody blitzed from depth')
  })
})

describe('the read covers every position, not just the safeties', () => {
  const prompt = buildDefensiveStructurePrompt('Bradley')

  it('asks for every defender rather than a coverage label', () => {
    expect(prompt).toContain('CHART ALL ELEVEN')
    expect(prompt).toContain('Do NOT try to name the coverage')
    expect(prompt).toContain('READ EVERY POSITION BEFORE YOU FINISH')
    expect(prompt).toContain('the deep middle, the corners, the linebackers')
  })

  it('names the action people miss — a deep defender who rushes', () => {
    expect(prompt).toContain('blitzed_from_depth')
    expect(prompt).toContain('THIS IS THE ONE PEOPLE MISS')
  })

  it('abstains rather than averaging pictures that disagree', () => {
    expect(prompt).toContain('rather than averaging them into a defence')
  })

  it('keeps the block off plays where the opponent has the ball', () => {
    expect(prompt).toContain('only on plays where Bradley is on DEFENSE')
    expect(prompt).toContain('Leave the whole block out on a play where Bradley has the ball')
  })
})

describe('normalizing what the model returns', () => {
  it('keeps a recognised answer', () => {
    const snap = normalizeDefensiveSnap({ presnap_shell: 'one_high', coverage_played: 'cover_1' })
    expect(snap.presnap_shell).toBe('one_high')
    expect(snap.coverage_played).toBe('cover_1')
  })

  // An off-vocabulary value must not reject a paid analysis, and must not enter
  // a rollup as a coverage of its own with its own percentage.
  it('degrades an off-vocabulary answer to the abstention', () => {
    const snap = normalizeDefensiveSnap({
      presnap_shell: 'cover three-ish',
      coverage_played: 'probably man',
    })
    expect(snap.presnap_shell).toBe('not_visible')
    expect(snap.coverage_played).toBe('not_determinable')
  })

  it('treats a missing answer as an abstention rather than a default coverage', () => {
    const snap = normalizeDefensiveSnap({})
    expect(snap.coverage_played).toBe('not_determinable')
    expect(snap.pressure_look).toBe('not_determinable')
    expect(snap.strength_declared).toBe('not_determinable')
  })

  it('drops a depth that is not a real number instead of charting zero', () => {
    const snap = normalizeDefensiveSnap({ field_safety_depth: 'deep', boundary_safety_depth: 11 })
    expect(snap.field_safety_depth).toBeNull()
    expect(snap.boundary_safety_depth).toBe(11)
  })

  it('drops a tell whose kind is unrecognised, since the rollup groups by kind', () => {
    const snap = normalizeDefensiveSnap({
      presnap_tells: [
        { kind: 'vibes', observation: 'they looked aggressive' },
        { kind: 'safety_depth', observation: 'field safety at 8 yards' },
      ],
    })
    expect(snap.presnap_tells).toHaveLength(1)
    expect(snap.presnap_tells?.[0].kind).toBe('safety_depth')
  })

  it('drops a tell with no observation, which is a label with no evidence', () => {
    const snap = normalizeDefensiveSnap({ presnap_tells: [{ kind: 'corner_leverage' }] })
    expect(snap.presnap_tells).toHaveLength(0)
  })
})

describe('the coverage is derived from the eleven, not named', () => {
  const d = (
    position: string,
    alignment: string,
    action: string,
    over: Partial<DefenderRow> = {}
  ): DefenderRow => ({
    position,
    alignment: alignment as DefenderRow['alignment'],
    action: action as DefenderRow['action'],
    ...over,
  })

  const FRONT = [
    d('de_left', 'on_line_outside_shade', 'rushed_passer'),
    d('dt_left', 'on_line_inside_shade', 'rushed_passer'),
    d('dt_right', 'on_line_inside_shade', 'rushed_passer'),
    d('de_right', 'on_line_outside_shade', 'rushed_passer'),
  ]
  const MAN_UNDERNEATH = [
    d('cb_left', 'press_wide', 'man_coverage', { covering: 'wr_left' }),
    d('cb_right', 'press_wide', 'man_coverage', { covering: 'wr_right' }),
    d('lb_middle', 'off_ball_box', 'man_coverage', { covering: 'rb' }),
    d('lb_left', 'off_ball_box', 'man_coverage', { covering: 'te_left' }),
  ]

  /**
   * PLAY 1 OF THE GROUND-TRUTH GAME, as the coach described it: one-high
   * pre-snap, the free safety blitzes, so the coverage played is Cover 0.
   * Before this rewrite the module could not express it — there was no
   * "the safety rushed" and the read came back two-high with no coverage.
   */
  it('reads one-high with a blitzing free safety as a Cover 0 coverage', () => {
    const defenders = [
      ...FRONT,
      ...MAN_UNDERNEATH,
      d('fs', 'deep_middle', 'blitzed_from_depth', { depth_yards: 12 }),
      d('ss', 'over_slot', 'man_coverage', { covering: 'slot_right' }),
    ]
    // The SHELL is what he showed: one deep safety.
    expect(deriveShell(defenders)).toBe('one_high')
    // The COVERAGE is what they played: he left, so nobody is helping.
    const derived = deriveCoverage(defenders)
    expect(derived.coverage).toBe('cover_0')
    expect(derived.deepHelp).toBe(0)
    expect(derived.safetyBlitzed).toBe(true)
    expect(deriveSafetyRotation(defenders)).toBe('safety_blitzed')
    // And he counts as the fifth rusher, without anyone being asked to count.
    expect(derivePressureLook(defenders)).toBe('five_man_interior')
  })

  it('reads the same look as Cover 1 when that safety stays home', () => {
    const defenders = [
      ...FRONT,
      ...MAN_UNDERNEATH,
      d('fs', 'deep_middle', 'zone_deep', { depth_yards: 12 }),
      d('ss', 'over_slot', 'man_coverage', { covering: 'slot_right' }),
    ]
    expect(deriveShell(defenders)).toBe('one_high')
    expect(deriveCoverage(defenders).coverage).toBe('cover_1')
    expect(deriveSafetyRotation(defenders)).toBe('no_rotation_single_high')
    expect(derivePressureLook(defenders)).toBe('four_man')
  })

  it('does not count a walked-down safety as deep', () => {
    const defenders = [
      ...FRONT,
      ...MAN_UNDERNEATH,
      d('fs', 'over_slot', 'man_coverage', { depth_yards: 6, covering: 'slot_left' }),
      d('ss', 'walked_up_edge', 'man_coverage', { depth_yards: 4, covering: 'te_right' }),
    ]
    expect(deriveShell(defenders)).toBe('zero_high')
    expect(deriveCoverage(defenders).coverage).toBe('cover_0')
  })

  it('does not turn a Cover 3 corner into a three-high shell', () => {
    const defenders = [
      ...FRONT,
      d('cb_left', 'off_wide', 'zone_deep'),
      d('cb_right', 'off_wide', 'zone_deep'),
      d('fs', 'deep_middle', 'zone_deep', { depth_yards: 14 }),
      d('ss', 'off_ball_box', 'zone_underneath'),
      d('lb_middle', 'off_ball_box', 'zone_underneath'),
      d('lb_left', 'off_ball_box', 'zone_underneath'),
    ]
    expect(deriveShell(defenders)).toBe('one_high')
    expect(deriveCoverage(defenders).coverage).toBe('cover_3')
  })

  it('reads two deep zone safeties with underneath zone as Cover 2', () => {
    const defenders = [
      ...FRONT,
      d('fs', 'deep_half', 'zone_deep', { depth_yards: 13 }),
      d('ss', 'deep_half', 'zone_deep', { depth_yards: 13 }),
      d('cb_left', 'off_wide', 'zone_underneath'),
      d('cb_right', 'off_wide', 'zone_underneath'),
      d('lb_middle', 'off_ball_box', 'zone_underneath'),
    ]
    expect(deriveShell(defenders)).toBe('two_high')
    expect(deriveCoverage(defenders).coverage).toBe('cover_2')
    expect(deriveSafetyRotation(defenders)).toBe('stayed_two_high')
  })

  it('refuses to name a coverage from too few players', () => {
    // An absence cannot be established from a partial chart: "no deep safety"
    // and "we did not see the deep safety" are the same picture here.
    const defenders = [d('cb_left', 'press_wide', 'man_coverage'), d('de_left', 'on_line_head_up', 'rushed_passer')]
    expect(deriveCoverage(defenders).coverage).toBe('not_determinable')
  })

  it('does not report a zero-high shell when no safety was charted at all', () => {
    expect(deriveShell(FRONT)).toBe('not_visible')
  })

  it('takes the derived answers over the model label when the eleven are charted', () => {
    const snap = normalizeDefensiveSnap({
      // The model's own guess, which is what it got wrong on play 1.
      presnap_shell: 'two_high',
      coverage_played: 'not_determinable',
      defenders: [
        ...FRONT,
        ...MAN_UNDERNEATH,
        { position: 'fs', alignment: 'deep_middle', action: 'blitzed_from_depth', depth_yards: 12 },
      ],
    })
    expect(snap.presnap_shell).toBe('one_high')
    expect(snap.coverage_played).toBe('cover_0')
    expect(snap.safety_rotation).toBe('safety_blitzed')
  })

  it('falls back to the model label when too few defenders were charted', () => {
    const snap = normalizeDefensiveSnap({
      presnap_shell: 'one_high',
      coverage_played: 'cover_1',
      defenders: [{ position: 'fs', alignment: 'deep_middle', action: 'zone_deep' }],
    })
    expect(snap.presnap_shell).toBe('one_high')
    expect(snap.coverage_played).toBe('cover_1')
  })

  it('drops a defender row with no position', () => {
    const snap = normalizeDefensiveSnap({
      defenders: [{ alignment: 'deep_middle', action: 'zone_deep' }, { position: 'fs' }],
    })
    expect(snap.defenders).toHaveLength(1)
  })
})
