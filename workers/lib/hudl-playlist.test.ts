import { describe, it, expect } from 'vitest'
import {
  extractClipsFromPayload,
  bestClipSet,
  redactUrlForDiagnostics,
} from './hudl-playlist'
import { mapHudlRow, toPlaySequenceFields } from '../../lib/import/hudl-breakdown'

// Hudl's payload shape is private, so these fixtures are plausible shapes
// rather than captured ones. That is exactly why the reader is written to be
// tolerant across them and to return nothing when it recognises none.

const PAIRS_SHAPE = {
  playlist: {
    clips: [
      {
        clipId: '1001',
        breakdownData: [
          { name: 'ODK', value: 'D' },
          { name: 'DN', value: '2' },
          { name: 'DIST', value: '7' },
          { name: 'DEF FRONT', value: '4-4' },
        ],
        angles: [{ media: [{ url: 'https://media.hudl.com/1001/hd.mp4' }] }],
      },
      {
        clipId: '1002',
        breakdownData: [
          { name: 'ODK', value: 'D' },
          { name: 'DN', value: '1' },
        ],
        angles: [{ media: [{ url: 'https://media.hudl.com/1002/index.m3u8' }] }],
      },
    ],
  },
}

const FLAT_SHAPE = {
  clips: [
    { id: '2001', Down: '3', Dist: '2', 'Def Front': 'Bear', url: 'https://m.hudl.com/a.mp4' },
    { id: '2002', Down: '1', Dist: '10', url: 'https://m.hudl.com/b.mp4' },
  ],
}

const COLUMN_LIST_SHAPE = {
  columns: ['ODK', 'DN', 'DIST'],
  data: {
    clips: [
      { clipId: '3001', values: ['D', '3', '4'], media: ['https://m.hudl.com/c.m3u8'] },
      { clipId: '3002', values: ['D', '2', '8'], media: ['https://m.hudl.com/d.m3u8'] },
    ],
  },
}

describe('extractClipsFromPayload', () => {
  it('reads name/value breakdown pairs', () => {
    const clips = extractClipsFromPayload(PAIRS_SHAPE)
    expect(clips).toHaveLength(2)
    expect(clips[0]).toMatchObject({
      clipId: '1001',
      order: 0,
      columns: { ODK: 'D', DN: '2', DIST: '7', 'DEF FRONT': '4-4' },
    })
    expect(clips[0].mediaUrls).toEqual(['https://media.hudl.com/1001/hd.mp4'])
  })

  it('reads a flat object of labels to values', () => {
    const clips = extractClipsFromPayload(FLAT_SHAPE)
    expect(clips).toHaveLength(2)
    expect(clips[0].columns).toEqual({ Down: '3', Dist: '2', 'Def Front': 'Bear' })
    // `id` and `url` are structure, not breakdown, and must not become columns.
    expect(clips[0].columns).not.toHaveProperty('id')
    expect(clips[0].columns).not.toHaveProperty('url')
  })

  it('zips a bare value list against a column list found elsewhere', () => {
    const clips = extractClipsFromPayload(COLUMN_LIST_SHAPE)
    expect(clips.map((c) => c.columns)).toEqual([
      { ODK: 'D', DN: '3', DIST: '4' },
      { ODK: 'D', DN: '2', DIST: '8' },
    ])
  })

  it('does not zip values when no column list is available', () => {
    // Positional values with invented headers would attach the wrong down and
    // distance to a real play. Dropping them is the safe failure.
    const clips = extractClipsFromPayload({ data: COLUMN_LIST_SHAPE.data })
    expect(clips).toHaveLength(2)
    expect(clips[0].columns).toEqual({})
  })

  it('prefers a progressive mp4 over HLS when Hudl offers both', () => {
    const clips = extractClipsFromPayload({
      clips: [
        {
          clipId: '9',
          angles: [{ url: 'https://m.hudl.com/x/index.m3u8' }, { url: 'https://m.hudl.com/x.mp4' }],
        },
      ],
    })
    expect(clips[0].mediaUrls[0]).toContain('.mp4')
  })

  it('keeps playlist order and drops duplicate clip ids', () => {
    const clips = extractClipsFromPayload({
      clips: [
        { clipId: 'a', url: 'https://m.hudl.com/1.mp4' },
        { clipId: 'b', url: 'https://m.hudl.com/2.mp4' },
        { clipId: 'a', url: 'https://m.hudl.com/1.mp4' },
      ],
    })
    expect(clips.map((c) => c.clipId)).toEqual(['a', 'b'])
    expect(clips.map((c) => c.order)).toEqual([0, 1])
  })

  it('returns nothing for a payload it does not recognise', () => {
    // The important negative case. Half-reading a playlist attaches the wrong
    // breakdown to real film, which is worse than a failed import.
    expect(extractClipsFromPayload({ teams: [{ id: '1', name: 'Bulldogs' }] })).toEqual([])
    expect(extractClipsFromPayload({ comments: [{ id: '4', text: 'nice block' }] })).toEqual([])
    expect(extractClipsFromPayload([1, 2, 3])).toEqual([])
    expect(extractClipsFromPayload(null)).toEqual([])
    expect(extractClipsFromPayload('<html>login</html>')).toEqual([])
  })

  it('ignores a clip-like list with ids but nothing playable', () => {
    expect(extractClipsFromPayload({ clips: [{ clipId: '1' }, { clipId: '2' }] })).toEqual([])
  })

  it('takes the playlist over a shorter nested clip list', () => {
    const payload = {
      related: [{ clipId: 'r1', url: 'https://m.hudl.com/r1.mp4' }],
      playlist: {
        clips: [
          { clipId: 'p1', url: 'https://m.hudl.com/p1.mp4' },
          { clipId: 'p2', url: 'https://m.hudl.com/p2.mp4' },
        ],
      },
    }
    expect(extractClipsFromPayload(payload).map((c) => c.clipId)).toEqual(['p1', 'p2'])
  })
})

describe('bestClipSet', () => {
  it('picks the richest payload out of everything the page fetched', () => {
    const clips = bestClipSet([{ nope: true }, FLAT_SHAPE, PAIRS_SHAPE, null])
    expect(clips).toHaveLength(2)
  })

  it('is empty when nothing captured looked like a playlist', () => {
    expect(bestClipSet([{ a: 1 }, 'text', null])).toEqual([])
  })
})

describe('the columns feed the existing breakdown mapper', () => {
  it('produces play sequence fields without a second alias table', () => {
    // The whole reason mapHudlRow was written as a pure function over rows:
    // the paste path and this path converge on it.
    const [clip] = extractClipsFromPayload(PAIRS_SHAPE)
    const fields = toPlaySequenceFields(mapHudlRow(clip.columns, clip.order))
    expect(fields).toMatchObject({ down: 2, distance: 7 })
  })
})

describe('redactUrlForDiagnostics', () => {
  it('keeps the endpoint and drops every query value', () => {
    // Query values are where Hudl puts session tokens. The parameter names are
    // what tell us which endpoint to look at next time.
    const redacted = redactUrlForDiagnostics(
      'https://api.hudl.com/v2/playlists/123/clips?authToken=SECRET&limit=50'
    )
    expect(redacted).toBe('https://api.hudl.com/v2/playlists/123/clips?authToken&limit')
    expect(redacted).not.toContain('SECRET')
  })

  it('handles a url with no query', () => {
    expect(redactUrlForDiagnostics('https://api.hudl.com/v2/clips')).toBe(
      'https://api.hudl.com/v2/clips'
    )
  })

  it('says so rather than throwing on junk', () => {
    expect(redactUrlForDiagnostics('not a url')).toBe('(unparseable url)')
  })
})
