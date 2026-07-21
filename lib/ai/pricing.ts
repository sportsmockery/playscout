/**
 * USD per 1M tokens, by provider + model. Point-in-time estimates from each
 * provider's public pricing pages — update here if a provider changes
 * pricing; nothing else in the codebase should hardcode a rate.
 */
interface ModelPrice {
  inputPer1M: number
  outputPer1M: number
}

const PRICING: Record<string, ModelPrice> = {
  'google:gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.0 },
  'anthropic:claude-sonnet-4-5': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'anthropic:claude-opus-4-5': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'perplexity:sonar-pro': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'openai:text-embedding-3-small': { inputPer1M: 0.02, outputPer1M: 0 },
}

export function estimateCostUsd(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING[`${provider}:${model}`]
  if (!price) return 0
  return (inputTokens / 1_000_000) * price.inputPer1M + (outputTokens / 1_000_000) * price.outputPer1M
}
