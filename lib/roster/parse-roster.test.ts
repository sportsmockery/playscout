import { describe, it, expect } from 'vitest'
import { parseRoster, normalizeJersey } from './parse-roster'

/** One row out, so a test reads as the sentence it is checking. */
function one(text: string) {
  const parsed = parseRoster(text)
  expect(parsed.rows).toHaveLength(1)
  return parsed.rows[0]
}

describe('the shape a coach actually pastes', () => {
  it('reads the line their roster app produces', () => {
    const row = one(`AJ Martino #1 2030 - 6'0" 134lbs`)
    expect(row.firstName).toBe('AJ')
    expect(row.lastName).toBe('Martino')
    expect(row.jerseyNumber).toBe('1')
    expect(row.classYear).toBe('Class of 2030')
    expect(row.issues).toEqual([])
  })

  it('reads a comma-separated export', () => {
    const row = one('45, Ryan Schmidt, QB, Freshman')
    expect(row.firstName).toBe('Ryan')
    expect(row.lastName).toBe('Schmidt')
    expect(row.jerseyNumber).toBe('45')
    expect(row.primaryPosition).toBe('QB')
    expect(row.gradeLevel).toBe('Freshman')
  })

  it('reads a tab-separated paste from a spreadsheet', () => {
    const row = one('12\tMatteo Lee Barker\tFB')
    expect(row.firstName).toBe('Matteo Lee')
    expect(row.lastName).toBe('Barker')
    expect(row.jerseyNumber).toBe('12')
    expect(row.primaryPosition).toBe('FB')
  })

  it('takes the number wherever it sits', () => {
    expect(one('7 Max Viau').jerseyNumber).toBe('7')
    expect(one('Max Viau 7').jerseyNumber).toBe('7')
    expect(one('Max Viau #7').jerseyNumber).toBe('7')
  })
})

describe('height and weight are read and thrown away', () => {
  // players has no column for either, and left in they become a surname.
  it('does not mistake feet for a jersey number', () => {
    const row = one(`AJ Martino 1 6'0" 134lbs`)
    expect(row.jerseyNumber).toBe('1')
    expect(row.lastName).toBe('Martino')
  })

  it('handles a height split across two tokens', () => {
    const row = one(`Arlo Luce 15 5' 4" 105 lbs`)
    expect(row.jerseyNumber).toBe('15')
    expect(`${row.firstName} ${row.lastName}`).toBe('Arlo Luce')
  })

  it('drops a weight whose unit was left off', () => {
    // 105 cannot be a jersey — numbers stop at 99 — so the only alternative
    // is letting it become the surname.
    const row = one(`Arlo Luce 15 105`)
    expect(row.jerseyNumber).toBe('15')
    expect(row.lastName).toBe('Luce')
  })
})

describe('a level is a level and a year is a year', () => {
  // players.grade_level is the vocabulary the Add Player form offers and the
  // value handed to the model as this player's level. A graduation year there
  // is meaningless to both.
  it('never puts a graduation year in the level', () => {
    const row = one('3 Carter Burhans QB 2030')
    expect(row.gradeLevel).toBeNull()
    expect(row.classYear).toBe('Class of 2030')
  })

  it('keeps a real level when one is written', () => {
    expect(one('3 Carter Burhans Freshman').gradeLevel).toBe('Freshman')
    expect(one('3 Carter Burhans 8th grade').gradeLevel).toBe('8th grade')
    expect(one('3 Carter Burhans 12U').gradeLevel).toBe('12U')
  })

  it('accepts the shorthand a coach types for a middle-school grade', () => {
    expect(one('3 Carter Burhans 8th').gradeLevel).toBe('8th grade')
  })

  it('leaves an unrecognised word in the name rather than inventing a level', () => {
    const row = one('3 Carter Burhans Sophmore')
    expect(row.gradeLevel).toBeNull()
    expect(row.lastName).toBe('Sophmore')
  })
})

describe('positions', () => {
  it('splits a two-way position and marks the side both', () => {
    const row = one('73 Ahmed Ali OL/DL')
    expect(row.primaryPosition).toBe('OL')
    expect(row.secondaryPosition).toBe('DL')
    expect(row.sideOfBall).toBe('both')
  })

  it('accepts a position the Add Player dropdown does not offer', () => {
    // The dropdown has DE and DT but no DL. A coach's roster says DL, and
    // rejecting it would throw away something true.
    const row = one('61 Dean Aqel DL')
    expect(row.primaryPosition).toBe('DL')
    expect(row.sideOfBall).toBe('defense')
  })

  it('infers the side from the position', () => {
    expect(one('18 Julian Acevedo RB').sideOfBall).toBe('offense')
    expect(one('13 Gavin Bottom CB').sideOfBall).toBe('defense')
    expect(one('99 Kicker Guy K').sideOfBall).toBe('special_teams')
  })

  it('leaves the side unset when no position was given', () => {
    expect(one('4 Liam Horton').sideOfBall).toBeNull()
  })
})

describe('names', () => {
  it('treats the last word as the surname', () => {
    const row = one('33 Abed Al-Rahman Zughayyer')
    expect(row.firstName).toBe('Abed Al-Rahman')
    expect(row.lastName).toBe('Zughayyer')
  })

  it('preserves the capitalisation it was given', () => {
    // Renaming a child is not the importer's call.
    const row = one('39 muath yassin')
    expect(row.firstName).toBe('muath')
    expect(row.lastName).toBe('yassin')
  })

  it('flags a single-word name instead of splitting it', () => {
    const row = one('39 Yassin')
    expect(row.firstName).toBe('Yassin')
    expect(row.lastName).toBe('')
    expect(row.issues).toContain('no_last_name')
  })
})

describe('what it refuses to guess', () => {
  it('flags a row with no number rather than assigning one', () => {
    const row = one('Liam Horton')
    expect(row.jerseyNumber).toBeNull()
    expect(row.issues).toContain('no_jersey')
  })

  it('reports duplicate numbers across the paste', () => {
    // matchRosterPlayer resolves a number only when exactly one player wears
    // it, so importing a duplicate costs BOTH kids every grade and stat.
    const parsed = parseRoster('45 Ryan Schmidt\n45 Jacob Connor\n52 Someone Else')
    expect(parsed.duplicateJerseys).toEqual(['45'])
  })

  it('treats a leading zero as the same number', () => {
    const parsed = parseRoster('07 Max Viau\n7 Someone Else')
    expect(parsed.duplicateJerseys).toEqual(['7'])
  })

  it('keeps a second number in its place rather than in the surname', () => {
    // Appending the leftover instead put "34" where the surname goes, which
    // would have filed a real child under the name "34".
    const row = one('12 34 Mystery Player')
    expect(row.jerseyNumber).toBe('12')
    expect(row.lastName).toBe('Player')
    expect(row.firstName).toBe('34 Mystery')
  })

  it('records a line it could not read instead of dropping it', () => {
    const parsed = parseRoster('45 Ryan Schmidt\n#88\n52 Jacob Connor')
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.ignored).toEqual([
      { lineNumber: 2, raw: '#88', reason: 'unreadable' },
    ])
  })
})

describe('whole pastes', () => {
  it('skips a header row and blank lines', () => {
    const parsed = parseRoster(
      'Name, Number, Position\n\n45, Ryan Schmidt, QB\n\n52, Jacob Connor, OL\n'
    )
    expect(parsed.rows.map((r) => r.lastName)).toEqual(['Schmidt', 'Connor'])
    expect(parsed.ignored).toEqual([
      { lineNumber: 1, raw: 'Name, Number, Position', reason: 'header' },
    ])
  })

  it('does not mistake a player called Name-something for a header', () => {
    const parsed = parseRoster('45 Ryan Nameth')
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.ignored).toHaveLength(0)
  })

  it('reads the real sixty-player paste end to end', () => {
    const text = [
      `AJ Martino #1 2030 - 6'0" 134lbs`,
      `John Reed #2 2029 - 5'7" 130lbs`,
      `Carter Burhans #3 2030 QB - 5'6" 145lbs`,
      `Matteo Lee Barker #12 2030 FB - 5'8" 165lbs`,
      `Ahmed Ali #73 2030 OL/DL - 6'4" 267lbs`,
      `muath yassin #39 2030 - 5'6" 160lbs`,
    ].join('\n')

    const parsed = parseRoster(text)
    expect(parsed.rows).toHaveLength(6)
    expect(parsed.ignored).toHaveLength(0)
    expect(parsed.duplicateJerseys).toEqual([])
    expect(parsed.rows.map((r) => r.jerseyNumber)).toEqual(['1', '2', '3', '12', '73', '39'])
    expect(parsed.rows.every((r) => r.issues.length === 0)).toBe(true)
    expect(parsed.rows[3].firstName).toBe('Matteo Lee')
    expect(parsed.rows[4].secondaryPosition).toBe('DL')
  })
})

describe('normalizeJersey matches the grading side exactly', () => {
  // Same rule as digitsOf in player-grades.ts. If these two ever disagree, a
  // number entered here stops matching the number read off the film.
  it.each([
    ['45', '45'],
    ['#45', '45'],
    ['07', '7'],
    [45, '45'],
    ['', null],
    ['abc', null],
    [null, null],
    [undefined, null],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeJersey(input as string | number | null | undefined)).toBe(expected)
  })
})
