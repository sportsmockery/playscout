import { describe, it, expect, vi, beforeEach } from 'vitest'

const generateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent }
  },
  Type: {},
}))

const { analyzeFramesWithGemini, DEFAULT_MAX_OUTPUT_TOKENS } = await import('./google')

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
