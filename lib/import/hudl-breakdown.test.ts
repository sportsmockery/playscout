import { describe, it, expect } from 'vitest'
import {
  fieldForColumn,
  mapHudlRow,
  parseDelimited,
  parseHudlExport,
  toPlaySequenceFields,
} from './hudl-breakdown'

describe('fieldForColumn', () => {
  it('matches the names staffs actually use', () => {
    // Every staff names their breakdown columns differently; the mapper has to
    // absorb that or a coach's export silently arrives with nothing filled in.
    expect(fieldForColumn('DN')).toBe('down')
    expect(fieldForColumn('Down')).toBe('down')
    expect(fieldForColumn('DIST')).toBe('distance')
    expect(fieldForColumn('To Go')).toBe('distance')
    expect(fieldForColumn('OFF FORM')).toBe('offensiveFormation')
    expect(fieldForColumn('Offensive Formation')).toBe('offensiveFormation')
    expect(fieldForColumn('GN/LS')).toBe('gainLoss')
    expect(fieldForColumn('PLAY DIR')).toBe('playDirection')
  })

  it('leaves an unknown column unmapped rather than guessing', () => {
    expect(fieldForColumn('Coach Notes')).toBeNull()
    expect(fieldForColumn('QTR')).toBeNull()
  })
})

describe('mapHudlRow', () => {
  it('reads a typical row', () => {
    const play = mapHudlRow(
      {
        'PLAY #': '12',
        ODK: 'O',
        DN: '2',
        DIST: '7',
        HASH: 'L',
        'YARD LN': '-35',
        'OFF FORM': 'Tight Double Wing',
        'OFF PLAY': 'Power Right',
        'PLAY TYPE': 'Run',
        'PLAY DIR': 'Right',
        'GN/LS': '14',
        RESULT: 'First down',
      },
      11
    )

    expect(play).toMatchObject({
      sourceRowIndex: 11,
      playNumber: 12,
      odk: 'O',
      down: 2,
      distance: 7,
      hash: 'L',
      yardLine: '-35',
      offensiveFormation: 'Tight Double Wing',
      playName: 'Power Right',
      playType: 'Run',
      playDirection: 'Right',
      gainLoss: 14,
      result: 'First down',
    })
  })

  it('keeps columns it does not understand instead of dropping the coach\'s data', () => {
    const play = mapHudlRow({ QTR: '3', 'Coach Notes': 'Bad snap', DN: '1' }, 0)
    expect(play.extra).toEqual({ QTR: '3', 'Coach Notes': 'Bad snap' })
    expect(play.down).toBe(1)
  })

  it('treats a blank cell as absent, not as a value', () => {
    // A column the staff never filled in must not become a play claiming to
    // know something it doesn't.
    const play = mapHudlRow({ DN: '', 'OFF FORM': '   ', RESULT: 'TD' }, 0)
    expect(play.down).toBeUndefined()
    expect(play.offensiveFormation).toBeUndefined()
    expect(play.result).toBe('TD')
    expect(play.extra).toEqual({})
  })

  it('reads downs written as words or with suffixes', () => {
    expect(mapHudlRow({ DN: '3rd' }, 0).down).toBe(3)
    expect(mapHudlRow({ DN: 'First' }, 0).down).toBe(1)
    expect(mapHudlRow({ DN: '9' }, 0).down).toBeUndefined()
  })

  it('normalises ODK and hash however they were typed', () => {
    expect(mapHudlRow({ ODK: 'Offense' }, 0).odk).toBe('O')
    expect(mapHudlRow({ ODK: 'd' }, 0).odk).toBe('D')
    expect(mapHudlRow({ ODK: 'ST' }, 0).odk).toBe('K')
    expect(mapHudlRow({ HASH: 'Left' }, 0).hash).toBe('L')
    expect(mapHudlRow({ HASH: 'Middle' }, 0).hash).toBe('M')
    expect(mapHudlRow({ HASH: 'C' }, 0).hash).toBe('M')
  })

  it('reads a negative gain', () => {
    expect(mapHudlRow({ 'GN/LS': '-3' }, 0).gainLoss).toBe(-3)
  })
})

describe('parseDelimited', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseDelimited('DN,PLAY\n1,"Power Right, on 2"\n2,"He said ""go"""')
    expect(rows).toEqual([
      { DN: '1', PLAY: 'Power Right, on 2' },
      { DN: '2', PLAY: 'He said "go"' },
    ])
  })

  it('ignores blank lines rather than emitting empty plays', () => {
    expect(parseDelimited('DN,DIST\n1,10\n\n\n2,7\n')).toHaveLength(2)
  })

  it('pads a short row instead of misaligning the rest', () => {
    expect(parseDelimited('A,B,C\n1,2')).toEqual([{ A: '1', B: '2', C: '' }])
  })

  it('returns nothing for an empty file', () => {
    expect(parseDelimited('')).toEqual([])
  })
})

describe('parseHudlExport', () => {
  it('reads a tab-separated paste out of a spreadsheet', () => {
    const plays = parseHudlExport('DN\tDIST\tOFF FORM\n1\t10\tTrips Right')
    expect(plays).toHaveLength(1)
    expect(plays[0]).toMatchObject({ down: 1, distance: 10, offensiveFormation: 'Trips Right' })
  })

  it('reads a comma-separated export', () => {
    const plays = parseHudlExport('DN,DIST\n3,2\n1,10')
    expect(plays.map((p) => p.down)).toEqual([3, 1])
    expect(plays.map((p) => p.sourceRowIndex)).toEqual([0, 1])
  })
})

describe('toPlaySequenceFields', () => {
  it('maps a row onto the play_sequences columns', () => {
    const fields = toPlaySequenceFields(
      mapHudlRow({ DN: '2', DIST: '7', 'OFF FORM': 'Trips Right', 'GN/LS': '14', QTR: '3' }, 4)
    )

    expect(fields).toMatchObject({
      down: 2,
      distance: 7,
      offensive_formation: 'Trips Right',
      gain_loss: 14,
      source_row_index: 4,
      breakdown: { QTR: '3' },
    })
  })

  it('writes null for what the staff left blank, never a guess', () => {
    const fields = toPlaySequenceFields(mapHudlRow({ DN: '1' }, 0))
    expect(fields.offensive_formation).toBeNull()
    expect(fields.play_name).toBeNull()
    expect(fields.breakdown).toBeNull()
  })
})
