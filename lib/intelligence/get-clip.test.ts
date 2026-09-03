import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const uploadClipToGemini = vi.fn()
vi.mock('@/lib/ai/providers/google', () => ({ uploadClipToGemini }))

const { getAnalysisClip, mimeTypeForPath } = await import('./get-clip')

type VideoRow = {
  storage_path: string | null
  duration_seconds: number | null
  gemini_file_uri: string | null
  gemini_file_expires_at: string | null
}
type PlayRow = {
  start_time_seconds: number | null
  end_time_seconds: number | null
  video_id: string
}

const HOUR = 60 * 60 * 1000

function fakeSupabase(opts: {
  video: VideoRow | null
  play?: PlayRow | null
  bytes?: Buffer
  downloadFails?: boolean
  onUpdate?: (patch: Record<string, unknown>) => void
}): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'videos' ? opts.video : (opts.play ?? null),
            error: null,
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          opts.onUpdate?.(patch)
          return { error: null }
        },
      }),
    }),
    storage: {
      from: () => ({
        download: async () =>
          opts.downloadFails
            ? { data: null, error: new Error('nope') }
            : {
                data: { arrayBuffer: async () => opts.bytes ?? Buffer.from('small') },
                error: null,
              },
      }),
    },
  } as unknown as SupabaseClient
}

const video = (over: Partial<VideoRow> = {}): VideoRow => ({
  storage_path: 'team/game.mp4',
  duration_seconds: 42,
  gemini_file_uri: null,
  gemini_file_expires_at: null,
  ...over,
})

describe('getAnalysisClip', () => {
  beforeEach(() => uploadClipToGemini.mockReset())

  it('inlines a clip small enough to put in the request', async () => {
    const clip = await getAnalysisClip('v1', fakeSupabase({ video: video() }))

    expect(clip?.source).toEqual({
      kind: 'inline',
      bytes: Buffer.from('small'),
      mimeType: 'video/mp4',
    })
    expect(clip?.durationSeconds).toBe(42)
    expect(uploadClipToGemini).not.toHaveBeenCalled()
  })

  it('falls back to frames for film with no stored copy', async () => {
    // External-link film keeps the coach's host as the source of truth, so
    // there is nothing to send — the caller uses frames instead of failing.
    expect(await getAnalysisClip('v1', fakeSupabase({ video: video({ storage_path: null }) }))).toBeNull()
    expect(await getAnalysisClip('v1', fakeSupabase({ video: null }))).toBeNull()
    expect(
      await getAnalysisClip('v1', fakeSupabase({ video: video(), downloadFails: true }))
    ).toBeNull()
  })

  it('uploads a large film once and caches the handle on the video row', async () => {
    // A 60-play breakdown of one game film should cost one upload, not sixty.
    uploadClipToGemini.mockResolvedValue({
      fileUri: 'files/abc',
      expiresAt: new Date(Date.now() + 48 * HOUR).toISOString(),
    })
    const patches: Record<string, unknown>[] = []
    const clip = await getAnalysisClip(
      'v1',
      fakeSupabase({
        video: video(),
        bytes: Buffer.alloc(21 * 1024 * 1024),
        onUpdate: (p) => patches.push(p),
      })
    )

    expect(clip?.source).toEqual({ kind: 'file', fileUri: 'files/abc', mimeType: 'video/mp4' })
    expect(uploadClipToGemini).toHaveBeenCalledOnce()
    expect(patches[0].gemini_file_uri).toBe('files/abc')
  })

  it('reuses a cached handle without downloading at all', async () => {
    const clip = await getAnalysisClip(
      'v1',
      fakeSupabase({
        video: video({
          gemini_file_uri: 'files/cached',
          gemini_file_expires_at: new Date(Date.now() + 40 * HOUR).toISOString(),
        }),
      })
    )

    expect(clip?.source).toEqual({ kind: 'file', fileUri: 'files/cached', mimeType: 'video/mp4' })
    expect(uploadClipToGemini).not.toHaveBeenCalled()
  })

  it('re-uploads rather than reusing a handle about to expire mid-batch', async () => {
    uploadClipToGemini.mockResolvedValue({ fileUri: 'files/fresh', expiresAt: null })
    const clip = await getAnalysisClip(
      'v1',
      fakeSupabase({
        video: video({
          gemini_file_uri: 'files/stale',
          gemini_file_expires_at: new Date(Date.now() + 60_000).toISOString(),
        }),
        bytes: Buffer.alloc(21 * 1024 * 1024),
      })
    )

    expect(clip?.source).toMatchObject({ fileUri: 'files/fresh' })
  })

  describe('single play out of a longer film', () => {
    it('carries the play offsets and reports the slice duration', async () => {
      const clip = await getAnalysisClip(
        'v1',
        fakeSupabase({
          video: video({ duration_seconds: 3600 }),
          play: { start_time_seconds: 124.5, end_time_seconds: 131, video_id: 'v1' },
        }),
        { playSequenceId: 'p1' }
      )

      expect(clip?.startOffsetSeconds).toBe(124.5)
      expect(clip?.endOffsetSeconds).toBe(131)
      // The slice, not the whole hour of film.
      expect(clip?.durationSeconds).toBeCloseTo(6.5)
    })

    it('ignores a play belonging to a different video', async () => {
      // Otherwise the offsets of one game would be applied to another's film.
      const clip = await getAnalysisClip(
        'v1',
        fakeSupabase({
          video: video(),
          play: { start_time_seconds: 10, end_time_seconds: 20, video_id: 'OTHER' },
        }),
        { playSequenceId: 'p1' }
      )

      expect(clip?.startOffsetSeconds).toBeUndefined()
    })

    it('ignores boundaries that are missing or inverted', async () => {
      for (const play of [
        { start_time_seconds: null, end_time_seconds: 20, video_id: 'v1' },
        { start_time_seconds: 30, end_time_seconds: 20, video_id: 'v1' },
        { start_time_seconds: 20, end_time_seconds: 20, video_id: 'v1' },
      ]) {
        const clip = await getAnalysisClip('v1', fakeSupabase({ video: video(), play }), {
          playSequenceId: 'p1',
        })
        expect(clip?.startOffsetSeconds).toBeUndefined()
      }
    })
  })
})

describe('mimeTypeForPath', () => {
  it('maps the container the coach actually uploaded', () => {
    expect(mimeTypeForPath('a/b/game.mov')).toBe('video/quicktime')
    expect(mimeTypeForPath('a/b/game.MP4')).toBe('video/mp4')
    expect(mimeTypeForPath('a/b/game.webm')).toBe('video/webm')
    expect(mimeTypeForPath('a/b/noextension')).toBe('video/mp4')
  })
})
