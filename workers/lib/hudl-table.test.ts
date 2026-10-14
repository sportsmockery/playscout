import { describe, it, expect } from 'vitest'
import { assembleTable, pairTableWithClips, type TableSnapshot } from './hudl-table'
import { describeShape } from './hudl-shapes'
import { statedClipTotal, type HudlClipCandidate } from './hudl-playlist'
import { mapHudlRow, toPlaySequenceFields } from '../../lib/import/hudl-breakdown'
import { playSummary } from '../../lib/film/play-details'

// Column lefts as laid out in Hudl's grid; the icon column after PLAY # has no text.
const HEADER = [
  { text: 'PLAY #', left: 100 },
  { text: 'ODK', left: 200 },
  { text: 'DN', left: 250 },
  { text: 'DIST', left: 300 },
  { text: 'HASH', left: 400 },
  { text: 'PLAY TYPE', left: 500 },
  { text: 'GN/LS', left: 600 },
  { text: 'QTR', left: 700 },
]

/** A grid row at content offset `y`, cells centred a little right of each column's left edge. */
function row(y: number, values: (string | null)[]) {
  return values.flatMap((text, i) => (text === null ? [] : [{ text, x: HEADER[i].left + 15, y }]))
}

const clip = (clipId: string, order: number): HudlClipCandidate => ({
  clipId,
  order,
  columns: { seasonId: '3569666' },
  mediaUrls: [],
  comments: [],
})

describe('assembleTable', () => {
  it('files cells under their columns, and ignores the unlabelled index column', () => {
    const snap: TableSnapshot = {
      header: HEADER,
      atEnd: true,
      cells: [
        { text: '114', x: 20, y: 40 }, // the row index left of the checkbox — no header above it
        ...row(40, ['114', 'D', '1', '10', 'L', 'Run', '2', '4']),
        ...row(70, ['115', 'D', '2', '8', 'L', '-', '-14', '4']),
      ],
    }
    expect(assembleTable([snap])).toEqual([
      { 'PLAY #': '114', ODK: 'D', DN: '1', DIST: '10', HASH: 'L', 'PLAY TYPE': 'Run', 'GN/LS': '2', QTR: '4' },
      { 'PLAY #': '115', ODK: 'D', DN: '2', DIST: '8', HASH: 'L', 'PLAY TYPE': '-', 'GN/LS': '-14', QTR: '4' },
    ])
  })

  it('keeps a row seen in two scroll snapshots once', () => {
    const first: TableSnapshot = { header: HEADER, atEnd: false, cells: [...row(40, ['1', 'K']), ...row(70, ['2', 'O'])] }
    const second: TableSnapshot = { header: HEADER, atEnd: true, cells: [...row(70, ['2', 'O']), ...row(100, ['3', 'O'])] }
    expect(assembleTable([first, second]).map((r) => r['PLAY #'])).toEqual(['1', '2', '3'])
  })

  it('returns nothing without a header', () => {
    expect(assembleTable([{ header: [], cells: row(40, ['1']), atEnd: true }])).toEqual([])
  })
})

describe('pairTableWithClips', () => {
  const rows = [{ 'PLAY #': '1', ODK: 'K' }, { 'PLAY #': '2', ODK: 'O' }]

  it('pairs by order when there is one row per clip, replacing stray JSON columns', () => {
    const { clips, paired } = pairTableWithClips([clip('a', 0), clip('b', 1)], rows)
    expect(paired).toBe(2)
    expect(clips[1].columns).toEqual({ 'PLAY #': '2', ODK: 'O' })
  })

  it('refuses when the counts differ rather than shifting every play', () => {
    const result = pairTableWithClips([clip('a', 0), clip('b', 1), clip('c', 2)], rows)
    expect(result.paired).toBe(0)
    expect(result.clips[0].columns).toEqual({ seasonId: '3569666' })
  })

  it('refuses when play numbers are out of order', () => {
    const swapped = [rows[1], rows[0]]
    expect(pairTableWithClips([clip('a', 0), clip('b', 1)], swapped).paired).toBe(0)
  })
})

describe('Hudl breakdown fields', () => {
  it('maps every column in Hudl’s analyze table and treats "-" as blank', () => {
    const play = mapHudlRow(
      {
        'PLAY #': '115', ODK: 'D', DN: '2', DIST: '8', 'YARD LN': '46', HASH: 'L',
        'OFF FORM': '-', 'OFF STR': 'R', BACKFIELD: 'I', 'OFF PLAY': '-', 'PLAY TYPE': 'Run',
        'PLAY DIR': 'L', RESULT: 'Rush', 'GN/LS': '-14', EFF: 'Y', 'DEF FRONT': '4-3',
        'DEF STR': 'L', BLITZ: 'Mike', COVERAGE: 'Cover 1', QTR: '4',
      },
      114
    )
    const fields = toPlaySequenceFields(play)
    expect(fields).toMatchObject({
      play_number: 115, odk: 'D', down: 2, distance: 8, yard_line: '46', hash: 'L',
      offensive_formation: null, offensive_strength: 'R', backfield: 'I', play_name: null,
      play_type: 'Run', play_direction: 'L', result: 'Rush', gain_loss: -14, efficiency: 'Y',
      defensive_front: '4-3', defensive_strength: 'L', blitz: 'Mike', coverage: 'Cover 1',
      quarter: 4, breakdown: null,
    })
  })

  it('summarises a play in one line for the library card', () => {
    expect(
      playSummary({ play_number: 115, quarter: 4, odk: 'D', down: 2, distance: 8, hash: 'L', play_type: 'Run', play_direction: 'L', gain_loss: -14 })
    ).toBe('#115 · Q4 · D · 2 & 8 · L hash · Run L · −14')
    expect(playSummary({})).toBeNull()
  })
})

describe('statedClipTotal', () => {
  it('reads both Hudl views', () => {
    expect(statedClipTotal('Clips 1-100 of 131')).toBe(131)
    expect(statedClipTotal('Share\n126 Clips\nPLAY #')).toBe(126)
    expect(statedClipTotal('Game Footage (1)')).toBeNull()
  })
})

describe('describeShape', () => {
  it('outlines keys and types without a single value', () => {
    const shape = describeShape({ token: 'secret-abc', clips: [{ id: 99, name: 'Bartlett' }], byId: { '123456': { x: 1 } } })
    expect(shape).toBe('{token:str,clips:[{id:num,name:str}×1],byId:{<id>×1:{x:num}}}')
    expect(shape).not.toContain('secret')
  })
})
