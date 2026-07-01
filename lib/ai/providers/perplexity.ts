export const PERPLEXITY_MODEL = 'sonar-pro'
export const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai'

export async function callPerplexity(messages: Array<{ role: string; content: string }>): Promise<string> {
  const response = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 1024,
    }),
  })
  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}
