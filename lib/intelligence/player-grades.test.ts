import { describe, it, expect } from 'vitest'
import {
  gradeFromFactors,
  letterFor,
  matchRosterPlayer,
  rankPlayerGrades,
  BASELINE_GRADE,
} from './player-grades'
import type { PlayerGrade } from './schemas'

const grade = (over: Partial<PlayerGrade> = {}): PlayerGrade => ({
  identifier: '#54',
  jersey_number: '54',
  // A legibly-read number now has to name the frame it was read in, or
  // resolvePlayerIdentity discards it as a guess.
  jersey_number_frame: 6,
  position: 'LG',
  role_on_play: 'backside cutoff',
  execution: 80,
  difficulty: 3,
  impact: 'moderate',
  note: 'Frame 6: sealed the 3-tech.',
  identification_confidence: 0.9,
  ...over,
})

describe('gradeFromFactors', () => {
  it('leaves a did-the-job rep at the baseline', () => {
    expect(gradeFromFactors({ execution: BASELINE_GRADE, difficulty: 3, impact: 'moderate' })).toBe(70)
  })

  it('rewards winning a hard rep more than winning an easy one', () => {
    const hard = gradeFromFactors({ execution: 90, difficulty: 5, impact: 'moderate' })
    const easy = gradeFromFactors({ execution: 90, difficulty: 1, impact: 'moderate' })
    expect(hard).toBeGreaterThan(easy)
  })

  it('punishes losing an easy rep more than losing a hard one', () => {
    const easy = gradeFromFactors({ execution: 50, difficulty: 1, impact: 'moderate' })
    const hard = gradeFromFactors({ execution: 50, difficulty: 5, impact: 'moderate' })
    expect(easy).toBeLessThan(hard)
  })

  it('amplifies a decisive rep and mutes an uninvolved one', () => {
    const decisive = gradeFromFactors({ execution: 90, difficulty: 3, impact: 'decisive' })
    const none = gradeFromFactors({ execution: 90, difficulty: 3, impact: 'none' })
    expect(decisive).toBeGreaterThan(none)
    expect(none).toBeGreaterThan(BASELINE_GRADE)
  })

  it('never lets difficulty flip a lost rep into a good grade', () => {
    expect(gradeFromFactors({ execution: 40, difficulty: 5, impact: 'decisive' })).toBeLessThan(BASELINE_GRADE)
  })

  it('stays inside 0-100 at the extremes', () => {
    expect(gradeFromFactors({ execution: 100, difficulty: 5, impact: 'decisive' })).toBeLessThanOrEqual(100)
    expect(gradeFromFactors({ execution: 0, difficulty: 1, impact: 'decisive' })).toBeGreaterThanOrEqual(0)
  })

  it('treats an unknown impact as moderate rather than throwing', () => {
    expect(gradeFromFactors({ execution: 85, difficulty: 3, impact: 'sideways' })).toBe(
      gradeFromFactors({ execution: 85, difficulty: 3, impact: 'moderate' })
    )
  })
})

describe('letterFor', () => {
  it('maps the scale a film room actually uses', () => {
    expect(letterFor(95)).toBe('A')
    expect(letterFor(84)).toBe('B')
    expect(letterFor(71)).toBe('C-')
    expect(letterFor(42)).toBe('F')
  })
})

describe('matchRosterPlayer', () => {
  const roster = [
    { id: 'p1', jersey_number: 54 },
    { id: 'p2', jersey_number: 7 },
    { id: 'dup-a', jersey_number: 22 },
    { id: 'dup-b', jersey_number: 22 },
  ]

  it('matches a legible number to its roster player', () => {
    expect(matchRosterPlayer('54', roster)).toBe('p1')
    expect(matchRosterPlayer('#7', roster)).toBe('p2')
  })

  it('refuses to guess when the number is not legible', () => {
    expect(matchRosterPlayer(null, roster)).toBeNull()
    expect(matchRosterPlayer('', roster)).toBeNull()
    expect(matchRosterPlayer('unknown', roster)).toBeNull()
  })

  it('leaves a duplicated number unmatched rather than picking one', () => {
    // Youth teams often issue the same number to an offensive and a defensive
    // player — attaching the grade to the wrong kid is worse than no match.
    expect(matchRosterPlayer('22', roster)).toBeNull()
  })

  it('returns null when nobody wears that number', () => {
    expect(matchRosterPlayer('99', roster)).toBeNull()
  })
})

describe('rankPlayerGrades', () => {
  /** Role-graded (no jersey number), so the descriptive label survives
   *  identity resolution and can be used to assert ordering. */
  const byRole = (identifier: string, over: Partial<PlayerGrade> = {}) =>
    grade({ identifier, jersey_number: null, jersey_number_frame: null, ...over })

  it('ranks best-first and numbers the ranks', () => {
    const ranked = rankPlayerGrades([
      byRole('weak', { execution: 55 }),
      byRole('strong', { execution: 95 }),
      byRole('middle', { execution: 75 }),
    ])
    expect(ranked.map((g) => g.identifier)).toEqual(['strong', 'middle', 'weak'])
    expect(ranked.map((g) => g.rank)).toEqual([1, 2, 3])
  })

  it('recomputes the grade from the factors, ignoring any model-supplied grade', () => {
    const [only] = rankPlayerGrades([grade({ execution: 90, difficulty: 5, impact: 'decisive', grade: 12 })])
    expect(only.grade).toBe(gradeFromFactors({ execution: 90, difficulty: 5, impact: 'decisive' }))
    expect(only.letter).toBe(letterFor(only.grade!))
  })

  it('breaks ties toward the harder assignment', () => {
    const ranked = rankPlayerGrades([
      byRole('easy-job', { execution: 70, difficulty: 1 }),
      byRole('hard-job', { execution: 70, difficulty: 5 }),
    ])
    expect(ranked[0].identifier).toBe('hard-job')
  })

  it('attaches roster ids where the jersey matched, null elsewhere', () => {
    const ranked = rankPlayerGrades(
      [grade({ jersey_number: '54' }), grade({ identifier: 'left tackle', jersey_number: null })],
      [{ id: 'p1', jersey_number: 54 }]
    )
    expect(ranked.find((g) => g.jersey_number === '54')?.player_id).toBe('p1')
    expect(ranked.find((g) => g.jersey_number == null)?.player_id).toBeNull()
  })

  it('handles an empty list', () => {
    expect(rankPlayerGrades([])).toEqual([])
  })
})
