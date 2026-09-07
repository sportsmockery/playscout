import { describe, it, expect } from 'vitest'
import { importedClipIds, planResume, clipSourceUrl, CLIP_SOURCE_PREFIX } from './hudl-resume'
import type { HudlClipCandidate } from './hudl-playlist'

const clip = (clipId: string, order: number): HudlClipCandidate => ({
  clipId,
  order,
  columns: {},
  mediaUrls: [`https://media.hudl.com/${clipId}.mp4`],
})

const PLAYLIST = [clip('a', 0), clip('b', 1), clip('c', 2), clip('d', 3)]

describe('importedClipIds', () => {
  it('reads ids back out of stored source urls', () => {
    const ids = importedClipIds([clipSourceUrl('a'), clipSourceUrl('b')])
    expect([...ids].sort()).toEqual(['a', 'b'])
  })

  it('ignores rows that are not clips from this path', () => {
    // A `hudl_link` row written by something else is not evidence about this
    // playlist, and treating it as one would skip a clip we actually need.
    const ids = importedClipIds([null, undefined, '', 'https://example.com/x.mp4', 'hudl:clip:'])
    expect(ids.size).toBe(0)
  })

  it('deduplicates', () => {
    expect(importedClipIds([clipSourceUrl('a'), clipSourceUrl('a')]).size).toBe(1)
  })
})

describe('planResume', () => {
  it('pulls everything when nothing is on file', () => {
    const plan = planResume(PLAYLIST, new Set())
    expect(plan.remaining).toHaveLength(4)
    expect(plan.alreadyImported).toBe(0)
  })

  it('picks up where an interrupted import stopped', () => {
    // The case this exists for: the container died after clip 2 of 4.
    const plan = planResume(PLAYLIST, new Set(['a', 'b']))
    expect(plan.remaining.map((c) => c.clipId)).toEqual(['c', 'd'])
    expect(plan.alreadyImported).toBe(2)
  })

  it('does nothing at all for a playlist already fully imported', () => {
    const plan = planResume(PLAYLIST, new Set(['a', 'b', 'c', 'd']))
    expect(plan.remaining).toEqual([])
    expect(plan.alreadyImported).toBe(4)
  })

  it('counts the skipped ones so progress does not restart at zero', () => {
    // A resumed import must read "4 of 4", not "2 of 4" — otherwise a finished
    // import looks like it lost half the film.
    const plan = planResume(PLAYLIST, new Set(['a', 'b']))
    expect(plan.alreadyImported + plan.remaining.length).toBe(PLAYLIST.length)
  })

  it('keeps playlist order in what remains', () => {
    const plan = planResume(PLAYLIST, new Set(['b']))
    expect(plan.remaining.map((c) => c.order)).toEqual([0, 2, 3])
  })

  it('uses the same prefix the worker writes', () => {
    expect(clipSourceUrl('99')).toBe(`${CLIP_SOURCE_PREFIX}99`)
  })
})
