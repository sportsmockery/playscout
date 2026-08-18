import Anthropic from '@anthropic-ai/sdk'

/**
 * Lazy singleton, matching lib/ai/providers/openai.ts.
 *
 * The SDK's constructor throws in any environment it considers browser-like
 * (jsdom included) and reads the API key at construction time. Building it at
 * module scope therefore made merely IMPORTING anything downstream of this
 * file fail — which is how the batch-summary runner broke the analysis-job
 * tests. Deferring construction to first use keeps this module safe to import
 * from anywhere, including code paths that never call Claude.
 */
let client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
  return client
}

export const CLAUDE_SONNET = 'claude-sonnet-4-5'
export const CLAUDE_OPUS = 'claude-opus-4-5'

export async function streamClaude(
  model: string,
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens = 1024
) {
  return getAnthropic().messages.stream({ model, max_tokens: maxTokens, system, messages })
}

export interface ClaudeResult {
  text: string
  usage: { inputTokens: number; outputTokens: number }
}

export async function callClaude(
  model: string,
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens = 2048
): Promise<ClaudeResult> {
  const response = await getAnthropic().messages.create({ model, max_tokens: maxTokens, system, messages })
  const block = response.content[0]
  return {
    text: block.type === 'text' ? block.text : '',
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  }
}
