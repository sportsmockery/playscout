import { describe, it, expect } from 'vitest'
import { buildSegments } from './ffmpeg'

describe('buildSegments', () => {
  it('turns cut timestamps into segments spanning the full duration', () => {
    const segments = buildSegments([10, 20, 30], 40)
    expect(segments).toEqual([
      { startSeconds: 0, endSeconds: 10 },
      { startSeconds: 10, endSeconds: 20 },
      { startSeconds: 20, endSeconds: 30 },
      { startSeconds: 30, endSeconds: 40 },
    ])
  })

  it('returns one segment spanning the whole video when there are no cuts', () => {
    const segments = buildSegments([], 100)
    expect(segments).toEqual([{ startSeconds: 0, endSeconds: 100 }])
  })

  it('merges a segment shorter than minSegmentSeconds into its predecessor', () => {
    // Cut at 10s and 10.5s creates a 0.5s sliver segment — should merge
    // forward into the segment ending at 10.5 instead of standing alone.
    const segments = buildSegments([10, 10.5, 30], 40, 1.5)
    expect(segments).toEqual([
      { startSeconds: 0, endSeconds: 10.5 },
      { startSeconds: 10.5, endSeconds: 30 },
      { startSeconds: 30, endSeconds: 40 },
    ])
  })

  it('ignores cut timestamps outside (0, duration)', () => {
    const segments = buildSegments([0, 15, 40], 40)
    expect(segments).toEqual([
      { startSeconds: 0, endSeconds: 15 },
      { startSeconds: 15, endSeconds: 40 },
    ])
  })

  it('sorts out-of-order cut input', () => {
    const segments = buildSegments([30, 10, 20], 40)
    expect(segments.map((s) => s.startSeconds)).toEqual([0, 10, 20, 30])
  })

  it('handles the real Carter Burhans highlight tape shape (30 cuts, 280.71s)', () => {
    // Actual scene-cut timestamps detected via ffmpeg on the real file.
    const realCuts = [
      9.45, 17.792, 24.875, 37.536, 45.269, 50.96, 61.205, 68.446, 74.551,
      91.542, 101.911, 111.173, 117.006, 123.787, 129.378, 142.687, 156.48,
      161.775, 174.028, 180.27, 189.575, 197.346, 203.5, 215.343, 229.901,
      235.805, 241.543, 246.791, 252.891, 277.711,
    ]
    const segments = buildSegments(realCuts, 280.71)
    expect(segments).toHaveLength(31)
    expect(segments[0].startSeconds).toBe(0)
    expect(segments[segments.length - 1].endSeconds).toBe(280.71)
    // Every segment should be non-empty and in order.
    for (let i = 0; i < segments.length; i++) {
      expect(segments[i].endSeconds).toBeGreaterThan(segments[i].startSeconds)
      if (i > 0) expect(segments[i].startSeconds).toBe(segments[i - 1].endSeconds)
    }
  })
})
