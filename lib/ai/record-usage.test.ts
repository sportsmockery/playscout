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

describe('promptVersion', () => {
  it('changes when the prompt changes', async () => {
    const { promptVersion } = await import('./record-usage')
    // The point of deriving it: a global constant has to be remembered on the
    // way past, and PROMPT_VERSION never once was. A hash cannot be forgotten.
    expect(promptVersion('QBIQ', 'grade the throw')).not.toBe(
      promptVersion('QBIQ', 'grade the throw and the footwork')
    )
  })

  it('differs per module for identical text', async () => {
    const { promptVersion } = await import('./record-usage')
    expect(promptVersion('QBIQ', 'same')).not.toBe(promptVersion('OLIQ', 'same'))
  })

  it('is stable and names its module, so rows group readably', async () => {
    const { promptVersion } = await import('./record-usage')
    const v = promptVersion('QBIQ', 'grade the throw')
    expect(v).toBe(promptVersion('QBIQ', 'grade the throw'))
    expect(v).toMatch(/^qbiq-[0-9a-f]{10}$/)
  })
})
