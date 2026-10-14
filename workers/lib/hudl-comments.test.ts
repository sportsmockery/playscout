import { describe, it, expect } from 'vitest'
import { readClipComments, collectCommentsByClip } from './hudl-comments'
import { extractClipsFromPayload, attachCommentsFromPayloads } from './hudl-playlist'

const media = (id: string) => ({ angles: [{ url: `https://media.hudl.com/${id}.mp4` }] })

describe('readClipComments', () => {
  it('reads a plain notes string as a note', () => {
    expect(readClipComments({ id: '1', notes: '  LT missed the down block  ' })).toEqual([
      { kind: 'note', text: 'LT missed the down block' },
    ])
  })

  it('reads comment objects with author, time posted and clip time', () => {
    const comments = readClipComments({
      id: '1',
      comments: [
        {
          id: 'c1',
          text: 'Watch the backside DE',
          user: { firstName: 'Coach', lastName: 'Smith' },
          createdAt: '2026-10-09T23:00:00Z',
          timeMs: 4500,
          avatarUrl: 'https://static.hudl.com/a.png',
        },
      ],
    })
    expect(comments).toEqual([
      {
        kind: 'comment',
        text: 'Watch the backside DE',
        author: 'Coach Smith',
        postedAt: '2026-10-09T23:00:00Z',
        clipSeconds: 4.5,
      },
    ])
  })

  it('keeps replies and unwraps a paged wrapper', () => {
    const comments = readClipComments({
      comments: {
        total: 1,
        items: [{ body: 'Good fit', author: 'DC', replies: [{ body: 'Agreed', author: 'HC' }] }],
      },
    })
    expect(comments.map((c) => `${c.author}: ${c.text}`)).toEqual(['DC: Good fit', 'HC: Agreed'])
  })

  it('drops empty and duplicate entries', () => {
    expect(readClipComments({ comments: ['', 'Same', 'Same', null] })).toEqual([
      { kind: 'comment', text: 'Same' },
    ])
  })
})

describe('collectCommentsByClip', () => {
  it('attributes comments served separately by clip id, and only to known clips', () => {
    const payload = {
      data: [
        { id: 'x1', clipId: 'a', message: 'Pull is late' },
        { id: 'x2', clipId: 'zzz', message: 'Belongs to another playlist' },
      ],
    }
    const found = collectCommentsByClip([payload], new Set(['a', 'b']))
    expect(found.get('a')).toEqual([{ kind: 'comment', text: 'Pull is late' }])
    expect(found.has('zzz')).toBe(false)
  })

  it('ignores an object that only shares an id but carries no comment fields', () => {
    const found = collectCommentsByClip([{ id: 'a', title: 'Not a comment' }], new Set(['a']))
    expect(found.size).toBe(0)
  })
})

describe('playlist integration', () => {
  it('does not let comments leak into breakdown columns', () => {
    const [clip] = extractClipsFromPayload({
      clips: [
        {
          id: 'a',
          ...media('a'),
          breakdownData: { DN: '1', DIST: '10' },
          comments: [{ title: 'Note', text: 'Eyes in the backfield' }],
        },
      ],
    })
    expect(clip.columns).toEqual({ DN: '1', DIST: '10' })
    expect(clip.comments).toEqual([{ kind: 'comment', text: 'Eyes in the backfield' }])
  })

  it('merges comments from a separate payload onto the right clip', () => {
    const playlist = { clips: [{ id: 'a', ...media('a') }, { id: 'b', ...media('b') }] }
    const commentsCall = { comments: [{ clipId: 'b', text: 'Late snap count' }] }
    const clips = attachCommentsFromPayloads(extractClipsFromPayload(playlist), [playlist, commentsCall])
    expect(clips[0].comments).toEqual([])
    expect(clips[1].comments).toEqual([{ kind: 'comment', text: 'Late snap count' }])
  })
})
