import { describe, it, expect, vi, beforeEach } from 'vitest'

const generateContent = vi.fn()

// Only the client is faked — the enums (MediaResolution, FileState) come from
// the real SDK so a mismatch with its actual values fails the test.
vi.mock('@google/genai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@google/genai')>()),
  GoogleGenAI: class {
    models = { generateContent }
  },
}))

const { analyzeFramesWithGemini, analyzeClipWithGemini, clampFps, DEFAULT_MAX_OUTPUT_TOKENS } =
  await import('./google')
const { MediaResolution } = await import('@google/genai')

type Part = { text?: string; inlineData?: { mimeType: string; data: string } }

function lastParts(): Part[] {
  return generateContent.mock.calls.at(-1)![0].contents[0].parts
}
function lastConfig(): Record<string, unknown> {
  return generateContent.mock.calls.at(-1)![0].config
}

const frame = (index: number, timestampSeconds: number | null) => ({
  index,
  timestampSeconds,
  base64: `data${index}`,
})

describe('analyzeFramesWithGemini', () => {
  beforeEach(() => {
    generateContent.mockReset()
    generateContent.mockResolvedValue({ text: '{}', usageMetadata: {} })
  })

  it('names every frame immediately before showing it', async () => {
    // Without this, the model receives anonymous images while the prompt asks
    // it to cite frame indices — so every citation is a guess.
    await analyzeFramesWithGemini('sys', [frame(0, 0), frame(7, 2.345)], {})

    expect(lastParts()).toEqual([
      { text: 'FRAME 00 — t=0.00s' },
      { inlineData: { mimeType: 'image/jpeg', data: 'data0' } },
      { text: 'FRAME 07 — t=2.35s' },
      { inlineData: { mimeType: 'image/jpeg', data: 'data7' } },
    ])
  })

  it('labels by real frame index, not array position', async () => {
    // Frames 4 and 5 failed to download; the survivors must keep their
    // identity so a cited "frame 9" means the ninth extracted frame.
    await analyzeFramesWithGemini('sys', [frame(3, 1.5), frame(9, 4.5)], {})

    const labels = lastParts().filter((p) => p.text).map((p) => p.text)
    expect(labels).toEqual(['FRAME 03 — t=1.50s', 'FRAME 09 — t=4.50s'])
  })

  it('omits a timestamp it does not have rather than inventing 0.00s', async () => {
    await analyzeFramesWithGemini('sys', [frame(0, null)], {})
    expect(lastParts()[0]).toEqual({ text: 'FRAME 00' })
  })

  it('appends user text after the frames', async () => {
    await analyzeFramesWithGemini('sys', [frame(0, 0)], {}, { userText: 'note' })
    expect(lastParts().at(-1)).toEqual({ text: 'note' })
  })

  it('sets an explicit output ceiling so a full breakdown is not truncated', async () => {
    await analyzeFramesWithGemini('sys', [frame(0, 0)], {})
    expect(lastConfig().maxOutputTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS)

    await analyzeFramesWithGemini('sys', [frame(0, 0)], {}, { maxOutputTokens: 999, temperature: 0.7 })
    expect(lastConfig().maxOutputTokens).toBe(999)
    expect(lastConfig().temperature).toBe(0.7)
  })
})

describe('analyzeClipWithGemini', () => {
  beforeEach(() => {
    generateContent.mockReset()
    generateContent.mockResolvedValue({ text: '{}', usageMetadata: {} })
  })

  const inline = { kind: 'inline' as const, bytes: Buffer.from('mp4'), mimeType: 'video/mp4' }

  it('sends the clip as video with the requested sample rate', async () => {
    await analyzeClipWithGemini('sys', inline, {}, { fps: 8 })

    expect(lastParts()[0]).toEqual({
      inlineData: { mimeType: 'video/mp4', data: Buffer.from('mp4').toString('base64') },
      videoMetadata: { fps: 8 },
    })
  })

  it('reads one play out of a longer film by offset, with no re-encode', async () => {
    // The defect this closes: the frame path has no play filter, so analyzing
    // play 12 of a merged playlist showed the model all 100 plays.
    await analyzeClipWithGemini(
      'sys',
      { kind: 'file', fileUri: 'files/abc', mimeType: 'video/mp4' },
      {},
      { fps: 6, startOffsetSeconds: 124.5, endOffsetSeconds: 131 }
    )

    expect(lastParts()[0]).toEqual({
      fileData: { fileUri: 'files/abc', mimeType: 'video/mp4' },
      videoMetadata: { fps: 6, startOffset: '124.500s', endOffset: '131.000s' },
    })
  })

  it('omits videoMetadata entirely when there is nothing to say', async () => {
    await analyzeClipWithGemini('sys', inline, {})
    expect(lastParts()[0]).not.toHaveProperty('videoMetadata')
  })

  it('maps clip resolution onto the SDK enum', async () => {
    await analyzeClipWithGemini('sys', inline, {}, { mediaResolution: 'low' })
    expect(lastConfig().mediaResolution).toBe(MediaResolution.MEDIA_RESOLUTION_LOW)

    await analyzeClipWithGemini('sys', inline, {})
    expect(lastConfig()).not.toHaveProperty('mediaResolution')
  })
})

describe('clampFps', () => {
  it('keeps fps inside the range Gemini accepts', () => {
    // Gemini rejects anything outside (0, 24] — a config typo should not cost
    // a coach their analysis.
    expect(clampFps(8)).toBe(8)
    expect(clampFps(100)).toBe(24)
    expect(clampFps(0)).toBe(1)
    expect(clampFps(-3)).toBe(1)
    expect(clampFps(Number.NaN)).toBe(1)
  })
})
