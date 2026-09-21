import { describe, it, expect } from 'vitest'
import {
  normalizeDefensiveSnap,
  buildDefensiveStructurePrompt,
  COVERAGE_DEFINITIONS,
  COVERAGE_SHELL_DEFINITIONS,
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
    expect(prompt).toContain('so it cannot be Cover 0')
  })
})

describe('the read covers every position, not just the safeties', () => {
  const prompt = buildDefensiveStructurePrompt('Bradley')

  it('asks for the deep middle, the corners, the linebackers and the blitzers', () => {
    expect(prompt).toContain('READ EVERY POSITION BEFORE YOU NAME A COVERAGE')
    expect(prompt).toContain('THE DEEP MIDDLE')
    expect(prompt).toContain('THE CORNERS')
    expect(prompt).toContain('THE LINEBACKERS')
    expect(prompt).toContain('ANYONE WHO LEFT COVERAGE')
  })

  it('abstains rather than averaging pictures that disagree', () => {
    expect(prompt).toContain('answer not_determinable rather than averaging')
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
