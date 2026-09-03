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

export const CLAUDE_SONNET = 'claude-sonnet-5'
export const CLAUDE_OPUS = 'claude-opus-5'

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
  usage: {
    inputTokens: number
    outputTokens: number
    /** Tokens served from the prompt cache — verify caching is actually working. */
    cacheReadTokens: number
    cacheWriteTokens: number
  }
}

export interface ClaudeOptions {
  maxTokens?: number
  /**
   * Cache the system prompt. Worth it whenever the same system prefix is sent
   * across many calls — a batch of 60 clips shares its rubric, level
   * calibration and football brain byte for byte, and that prefix is most of
   * the input cost.
   */
  cacheSystem?: boolean
  /** Adaptive thinking. On by default for Opus 5; harmless to state explicitly. */
  thinking?: boolean
  /** How hard to think. Defaults to the API's own default when unset. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

export async function callClaude(
  model: string,
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  optsOrMaxTokens: ClaudeOptions | number = {}
): Promise<ClaudeResult> {
  const opts: ClaudeOptions =
    typeof optsOrMaxTokens === 'number' ? { maxTokens: optsOrMaxTokens } : optsOrMaxTokens

  const response = await getAnthropic().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.cacheSystem
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system,
    messages,
    ...(opts.thinking ? { thinking: { type: 'adaptive' as const } } : {}),
    ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
  })

  // Find the text block rather than taking content[0]: with thinking enabled
  // the first block is a thinking block, and indexing would silently return
  // an empty response.
  const text = response.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')

  return {
    text,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  }
}
