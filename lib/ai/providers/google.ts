import { GoogleGenAI, Type } from '@google/genai'

export const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? '' })

export { Type }

export const GEMINI_MODEL = 'gemini-2.5-pro'

export async function analyzeFramesWithGemini(
  systemPrompt: string,
  frames: string[],
  responseSchema: object,
  userText?: string
): Promise<string> {
  const parts: object[] = frames.map(frame => {
    const base64Data = frame.includes(',') ? frame.split(',')[1] : frame
    return { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
  })
  if (userText) parts.push({ text: userText })

  const response = await genai.models.generateContent({
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
