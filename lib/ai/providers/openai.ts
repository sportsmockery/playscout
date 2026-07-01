import OpenAI from 'openai'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

// Lazy singleton — avoids module-eval errors when OPENAI_API_KEY isn't present at build time
function getClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
}

export async function createEmbedding(text: string): Promise<number[]> {
  const client = getClient()
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
    dimensions: EMBEDDING_DIMENSIONS,
  })
  return response.data[0].embedding
}
