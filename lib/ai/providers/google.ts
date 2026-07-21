import { GoogleGenAI, Type } from '@google/genai'

export { Type }
export const GEMINI_MODEL = 'gemini-2.5-pro'

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

export async function analyzeFramesWithGemini(
  systemPrompt: string,
  frames: string[],
  responseSchema: object,
  userText?: string,
  model: string = GEMINI_MODEL,
  mimeType: string = 'image/jpeg'
): Promise<GeminiResult> {
  const client = getClient()
  const parts: object[] = frames.map((frame) => {
    const base64Data = frame.includes(',') ? frame.split(',')[1] : frame
    return { inlineData: { mimeType, data: base64Data } }
  })
  if (userText) parts.push({ text: userText })

  const response = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0.2,
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
