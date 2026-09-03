import { describe, it, expect } from 'vitest'
import { framesFromBase64, getVideoFrames } from './get-frames'
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = { storage_path: string; frame_index: number; timestamp_seconds: number | null }

/**
 * Minimal stand-in for the two Supabase surfaces getVideoFrames touches: the
 * `video_frames` query and the `frames` storage bucket. `failPaths` marks the
 * storage objects that should come back as errors, which is the case the real
 * bug lived in.
 */
function fakeSupabase(rows: Row[], failPaths: string[] = []): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        download: async (path: string) =>
          failPaths.includes(path)
            ? { data: null, error: new Error('gone') }
            : { data: { arrayBuffer: async () => Buffer.from(`jpeg:${path}`) }, error: null },
      }),
    },
  } as unknown as SupabaseClient
}

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    storage_path: `f${i}.jpg`,
    frame_index: i,
    timestamp_seconds: i * 0.5,
  }))

describe('getVideoFrames', () => {
  it('carries each frame_index and timestamp through', async () => {
    const frames = await getVideoFrames('v1', fakeSupabase(rows(4)))

    expect(frames.map((f) => f.index)).toEqual([0, 1, 2, 3])
    expect(frames.map((f) => f.timestampSeconds)).toEqual([0, 0.5, 1, 1.5])
    expect(frames[2].base64).toBe(Buffer.from('jpeg:f2.jpg').toString('base64'))
  })

  it('keeps surviving frames on their real index when one download fails', async () => {
    // The regression this guards: the old implementation compacted the array,
    // so frame 5 became "frame 4" and every citation after the gap silently
    // pointed a coach at the wrong moment.
    const frames = await getVideoFrames('v1', fakeSupabase(rows(8), ['f4.jpg']))

    expect(frames).toHaveLength(7)
    expect(frames.map((f) => f.index)).toEqual([0, 1, 2, 3, 5, 6, 7])
    expect(frames.find((f) => f.index === 5)?.timestampSeconds).toBe(2.5)
  })

  it('fails loudly rather than grading a fraction of the play', async () => {
    await expect(
      getVideoFrames('v1', fakeSupabase(rows(8), ['f0.jpg', 'f1.jpg', 'f2.jpg']))
    ).rejects.toThrow(/Only 5 of 8 frames/)
  })

  it('returns nothing when the video has no frames yet', async () => {
    expect(await getVideoFrames('v1', fakeSupabase([]))).toEqual([])
  })

  it('treats a null timestamp as unknown rather than zero', async () => {
    const frames = await getVideoFrames(
      'v1',
      fakeSupabase([{ storage_path: 'f0.jpg', frame_index: 0, timestamp_seconds: null }])
    )
    expect(frames[0].timestampSeconds).toBeNull()
  })
})

describe('framesFromBase64', () => {
  it('strips the data-URL prefix browser extraction adds', () => {
    const frames = framesFromBase64(['data:image/jpeg;base64,AAAA', 'BBBB'])
    expect(frames.map((f) => f.base64)).toEqual(['AAAA', 'BBBB'])
  })

  it('indexes positionally and claims no timing it does not have', () => {
    const frames = framesFromBase64(['a', 'b', 'c'])
    expect(frames.map((f) => f.index)).toEqual([0, 1, 2])
    expect(frames.every((f) => f.timestampSeconds === null)).toBe(true)
  })
})
