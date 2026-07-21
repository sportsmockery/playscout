import { describe, it, expect } from 'vitest'
import { hashCacheKey } from './record-usage'

describe('hashCacheKey', () => {
  it('is deterministic — same inputs always produce the same hash', () => {
    const a = hashCacheKey('frame_observation', 'QBIQ:system prompt text', ['frame1data', 'frame2data'])
    const b = hashCacheKey('frame_observation', 'QBIQ:system prompt text', ['frame1data', 'frame2data'])
    expect(a).toBe(b)
  })

  it('changes when the job type changes', () => {
    const a = hashCacheKey('frame_observation', 'same prompt', ['frame'])
    const b = hashCacheKey('page_classification', 'same prompt', ['frame'])
    expect(a).not.toBe(b)
  })

  it('changes when the prompt changes', () => {
    const a = hashCacheKey('frame_observation', 'prompt A', ['frame'])
    const b = hashCacheKey('frame_observation', 'prompt B', ['frame'])
    expect(a).not.toBe(b)
  })

  it('changes when the frame content changes', () => {
    const a = hashCacheKey('frame_observation', 'prompt', ['frame1'])
    const b = hashCacheKey('frame_observation', 'prompt', ['frame2'])
    expect(a).not.toBe(b)
  })

  it('changes when frame order changes (order is semantically meaningful)', () => {
    const a = hashCacheKey('frame_observation', 'prompt', ['A', 'B'])
    const b = hashCacheKey('frame_observation', 'prompt', ['B', 'A'])
    expect(a).not.toBe(b)
  })

  it('produces a fixed-length hex digest regardless of input size', () => {
    const short = hashCacheKey('x', 'y', [])
    const long = hashCacheKey('x', 'y', Array(50).fill('a'.repeat(1000)))
    expect(short).toMatch(/^[0-9a-f]{64}$/)
    expect(long).toMatch(/^[0-9a-f]{64}$/)
  })
})
