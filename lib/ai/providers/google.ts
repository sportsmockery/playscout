import { GoogleGenAI, Type, MediaResolution, FileState } from '@google/genai'

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

// ── Native video ──────────────────────────────────────────────────────────
//
// The rubrics grade motion — kick slide, weight transfer, hip-shoulder
// separation, hand timing, leg drive. None of that is legible in stills
// sampled ~2.7fps apart, so a frame-based read of those cues was always
// inference dressed as observation. Gemini takes video natively with a
// controllable sample rate, and can be asked to cite MM:SS, which is both a
// better read and a citation the UI can seek to.

/** How much detail each sampled frame is tokenized at. Low is 64 tokens/frame, medium and high 256. */
export type ClipResolution = 'low' | 'medium' | 'high'

const RESOLUTION_MAP: Record<ClipResolution, MediaResolution> = {
  low: MediaResolution.MEDIA_RESOLUTION_LOW,
  medium: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
  high: MediaResolution.MEDIA_RESOLUTION_HIGH,
}

/**
 * Either the clip's bytes, or a handle to one already uploaded to the Files
 * API. A merged game film is uploaded once and then referenced by every play
 * cut out of it, so the same 2GB file isn't re-sent a hundred times.
 */
export type ClipSource =
  | { kind: 'inline'; bytes: Buffer; mimeType: string }
  | { kind: 'file'; fileUri: string; mimeType: string }

export interface GeminiClipOptions {
  model?: string
  /** Frames per second sampled from the clip. Gemini's valid range is (0, 24]; defaults to 1. */
  fps?: number
  /** Analyze only this slice — how a single play is read out of a merged game film, with no re-encode. */
  startOffsetSeconds?: number
  endOffsetSeconds?: number
  mediaResolution?: ClipResolution
  temperature?: number
  maxOutputTokens?: number
  userText?: string
}

/** Gemini takes offsets as protobuf Durations ("12.5s"), not numbers. */
function toDuration(seconds: number): string {
  return `${Math.max(0, seconds).toFixed(3)}s`
}

/** Gemini rejects anything outside (0, 24]. Clamp rather than fail a coach's analysis over a config typo. */
export function clampFps(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return 1
  return Math.min(24, fps)
}

export async function analyzeClipWithGemini(
  systemPrompt: string,
  clip: ClipSource,
  responseSchema: object,
  opts: GeminiClipOptions = {}
): Promise<GeminiResult> {
  const client = getClient()

  const videoMetadata: Record<string, unknown> = {}
  if (opts.fps != null) videoMetadata.fps = clampFps(opts.fps)
  if (opts.startOffsetSeconds != null) videoMetadata.startOffset = toDuration(opts.startOffsetSeconds)
  if (opts.endOffsetSeconds != null) videoMetadata.endOffset = toDuration(opts.endOffsetSeconds)

  const media =
    clip.kind === 'inline'
      ? { inlineData: { mimeType: clip.mimeType, data: clip.bytes.toString('base64') } }
      : { fileData: { fileUri: clip.fileUri, mimeType: clip.mimeType } }

  const parts: object[] = [
    Object.keys(videoMetadata).length ? { ...media, videoMetadata } : media,
  ]
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
      ...(opts.mediaResolution ? { mediaResolution: RESOLUTION_MAP[opts.mediaResolution] } : {}),
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

export interface UploadedClip {
  fileUri: string
  /** When Gemini will delete it. Cached alongside the URI so a stale handle is never reused. */
  expiresAt: string | null
}

/** Files stay PROCESSING for a few seconds after upload and cannot be referenced until ACTIVE. */
const FILE_ACTIVE_POLL_MS = 2000
const FILE_ACTIVE_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Uploads a clip too large to inline and waits for Gemini to finish processing
 * it. Callers cache the returned URI against the video row: one upload of a
 * whole game film serves every play analyzed out of it.
 */
export async function uploadClipToGemini(
  bytes: Buffer,
  mimeType: string,
  displayName?: string,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<UploadedClip> {
  const client = getClient()
  const uploaded = await client.files.upload({
    file: new Blob([new Uint8Array(bytes)], { type: mimeType }),
    config: { mimeType, ...(displayName ? { displayName } : {}) },
  })

  if (!uploaded.name) throw new Error('Gemini file upload returned no file name')

  let file = uploaded
  const deadline = Date.now() + FILE_ACTIVE_TIMEOUT_MS
  while (file.state === FileState.PROCESSING) {
    if (Date.now() > deadline) {
      throw new Error(`Gemini is still processing this film after ${FILE_ACTIVE_TIMEOUT_MS / 1000}s`)
    }
    await sleep(FILE_ACTIVE_POLL_MS)
    file = await client.files.get({ name: uploaded.name })
  }

  if (file.state === FileState.FAILED || !file.uri) {
    throw new Error(`Gemini could not process this film: ${file.error?.message ?? 'unknown error'}`)
  }

  return { fileUri: file.uri, expiresAt: file.expirationTime ?? null }
}
