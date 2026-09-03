import { GoogleGenAI, Type } from '@google/genai'

export { Type }
export const GEMINI_MODEL = 'gemini-2.5-pro'

/**
 * Gemini's own default output cap is low enough to truncate a full film
 * breakdown mid-observation. Reports are meant to be as long as the evidence
 * supports, so the ceiling is set deliberately here rather than inherited.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 16384

// Lazy singleton — avoids module-eval errors when env vars aren't set at build time
function getClient(): GoogleGenAI {
  // An env var set to an empty string is still "set" as far as ?? is
  // concerned, so it would never fall through to GEMINI_API_KEY — treat
  // blank the same as unset.
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || ''
  return new GoogleGenAI({ apiKey })
}

export interface GeminiResult {
  text: string
  usage: { inputTokens: number; outputTokens: number }
}

/**
 * A frame plus the two facts needed to cite it. Declared structurally rather
 * than imported from lib/intelligence so the provider layer keeps no
 * dependency on the intelligence layer; `EvidenceFrame` satisfies it.
 */
export interface LabeledFrame {
  index: number
  timestampSeconds: number | null
  /** base64 JPEG, no data-URL prefix. */
  base64: string
}

export interface GeminiFrameOptions {
  userText?: string
  model?: string
  mimeType?: string
  temperature?: number
  maxOutputTokens?: number
  /**
   * Defaults to true. Set false for images that are not a time sequence — a
   * scanned playbook page is one image of a document, and calling it
   * "FRAME 00" would invite the model to reason about it as film.
   */
  labelFrames?: boolean
}

/**
 * The text part that precedes each image.
 *
 * Frames used to be pushed as bare `inlineData` parts — sixteen anonymous
 * images — while the prompt asked the model to report "which frame indices
 * support your conclusion". It had no way to know which image was which, so
 * every `evidence_frames` citation was a guess. Naming each frame as it is
 * shown is what makes a citation checkable, and it is what lets the UI seek
 * a coach to the moment being described.
 */
function frameLabel(frame: LabeledFrame): string {
  const index = String(frame.index).padStart(2, '0')
  return frame.timestampSeconds != null
    ? `FRAME ${index} — t=${frame.timestampSeconds.toFixed(2)}s`
    : `FRAME ${index}`
}

export async function analyzeFramesWithGemini(
  systemPrompt: string,
  frames: LabeledFrame[],
  responseSchema: object,
  opts: GeminiFrameOptions = {}
): Promise<GeminiResult> {
  const client = getClient()
  const mimeType = opts.mimeType ?? 'image/jpeg'

  const labelFrames = opts.labelFrames ?? true

  const parts: object[] = []
  for (const frame of frames) {
    if (labelFrames) parts.push({ text: frameLabel(frame) })
    parts.push({ inlineData: { mimeType, data: frame.base64 } })
  }
  if (opts.userText) parts.push({ text: opts.userText })

  const response = await client.models.generateContent({
    model: opts.model ?? GEMINI_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema,
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    },
  })
  return {
    text: response.text ?? '',
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    },
  }
}
