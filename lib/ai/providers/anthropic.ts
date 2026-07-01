import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

export const CLAUDE_SONNET = 'claude-sonnet-4-5'
export const CLAUDE_OPUS = 'claude-opus-4-5'

export async function streamClaude(
  model: string,
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens = 1024
) {
  return anthropic.messages.stream({ model, max_tokens: maxTokens, system, messages })
}

export async function callClaude(
  model: string,
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens = 2048
): Promise<string> {
  const response = await anthropic.messages.create({ model, max_tokens: maxTokens, system, messages })
  const block = response.content[0]
  return block.type === 'text' ? block.text : ''
}
