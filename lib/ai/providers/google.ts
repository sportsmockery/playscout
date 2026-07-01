import { GoogleGenAI, Type } from '@google/genai'

export { Type }
export const GEMINI_MODEL = 'gemini-2.5-pro'

// Lazy singleton — avoids module-eval errors when env vars aren't set at build time
function getClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? '',
  })
}

export async function analyzeFramesWithGemini(
  systemPrompt: string,
  frames: string[],
  responseSchema: object,
  userText?: string
): Promise<string> {
  const client = getClient()
  const parts: object[] = frames.map((frame) => {
    const base64Data = frame.includes(',') ? frame.split(',')[1] : frame
    return { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
  })
  if (userText) parts.push({ text: userText })

  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0.2,
    },
  })
  return response.text ?? ''
}
