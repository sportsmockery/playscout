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
  /**
   * Why the model stopped. Needed by callers that parse the text: a parse
   * failure means something completely different depending on whether the
   * model finished its thought or was cut off, and without this the two are
   * indistinguishable at the point where they matter.
   */
  stopReason: string | null
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
  /**
   * A structured-output format (see `zodOutputFormat`), which CONSTRAINS the
   * model's generation to the schema rather than asking it nicely.
   *
   * The difference matters: a prompt that describes a JSON shape produces
   * JSON that is usually valid, and "usually" over a 191-clip report is a
   * coin-flip the coach loses. With a format set, malformed JSON stops being
   * a failure mode instead of being retried until it goes away.
   */
  outputFormat?: unknown
  /**
   * Stream the response instead of waiting for it whole.
   *
   * Required above roughly 16k max_tokens: the SDK's HTTP timeout is what
   * fails first on a long non-streaming generation, and it fails as a dropped
   * connection rather than anything that names the cause.
   */
  stream?: boolean
}

/**
 * The model hit `max_tokens` and stopped mid-sentence.
 *
 * Its own class because the caller's next move is different from every other
 * failure: this is a budget to raise, not a prompt to fix or a call to retry.
 * Left as a generic error it surfaced as "Invalid JSON from batch summary:
 * {" followed by 200 characters of a perfectly good report, which reads as a
 * broken model rather than a truncated one.
 */
export class ClaudeTruncatedError extends Error {
  constructor(public readonly outputTokens: number) {
    super(
      `Claude hit its output limit after ${outputTokens} tokens and the response was cut off mid-sentence.`
    )
    this.name = 'ClaudeTruncatedError'
  }
}

export async function callClaude(
  model: string,
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  optsOrMaxTokens: ClaudeOptions | number = {}
): Promise<ClaudeResult> {
  const opts: ClaudeOptions =
    typeof optsOrMaxTokens === 'number' ? { maxTokens: optsOrMaxTokens } : optsOrMaxTokens

  const params = {
    model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.cacheSystem
      ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }]
      : system,
    messages,
    ...(opts.thinking ? { thinking: { type: 'adaptive' as const } } : {}),
    ...(opts.effort || opts.outputFormat
      ? {
          output_config: {
            ...(opts.effort ? { effort: opts.effort } : {}),
            ...(opts.outputFormat ? { format: opts.outputFormat } : {}),
          },
        }
      : {}),
  }

  const client = getAnthropic()
  // `format` reaches output_config through a cast because the SDK's published
  // params type does not carry it yet; the wire shape is what the API
  // documents, and zodOutputFormat builds it.
  const request = params as Parameters<typeof client.messages.create>[0]
  const response = opts.stream
    ? await client.messages.stream(request).finalMessage()
    : ((await client.messages.create(request)) as Anthropic.Message)

  // Checked before the text is read, so a truncated response never reaches a
  // parser that can only report it as malformed.
  if (response.stop_reason === 'max_tokens') {
    throw new ClaudeTruncatedError(response.usage.output_tokens)
  }

  // Find the text block rather than taking content[0]: with thinking enabled
  // the first block is a thinking block, and indexing would silently return
  // an empty response.
  const text = response.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')

  return {
    text,
    stopReason: response.stop_reason ?? null,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  }
}
