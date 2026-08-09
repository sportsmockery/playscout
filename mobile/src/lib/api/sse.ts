/**
 * Pure SSE frame parser for the PlayScoutIQ chat stream. The server emits
 * `data: {json}\n\n` frames whose payloads are one of:
 *   { type: 'delta', text }      — append streamed text
 *   { type: 'done' }             — stream finished
 *   { type: 'redacted', text }   — output safety cut the stream (followed by done)
 *   { type: 'error', message }   — server-side error
 * Kept dependency-free so it is unit-testable in isolation.
 */
export type ChatFrame =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'redacted'; text: string }
  | { type: 'error'; message: string };

export interface SSEParseResult {
  frames: ChatFrame[];
  /** Bytes after the last complete `\n\n` boundary — carry into the next chunk. */
  remainder: string;
}

export function parseSSEBuffer(buffer: string): SSEParseResult {
  const frames: ChatFrame[] = [];
  const segments = buffer.split('\n\n');
  const remainder = segments.pop() ?? '';

  for (const segment of segments) {
    const dataLines = segment
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length === 0) continue;
    const payload = dataLines.join('\n');
    if (payload === '' || payload === '[DONE]') {
      frames.push({ type: 'done' });
      continue;
    }
    const frame = safeParseFrame(payload);
    if (frame) frames.push(frame);
  }

  return { frames, remainder };
}

function safeParseFrame(payload: string): ChatFrame | null {
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    switch (obj.type) {
      case 'delta':
        return { type: 'delta', text: typeof obj.text === 'string' ? obj.text : '' };
      case 'done':
        return { type: 'done' };
      case 'redacted':
        return { type: 'redacted', text: typeof obj.text === 'string' ? obj.text : '' };
      case 'error':
        return { type: 'error', message: typeof obj.message === 'string' ? obj.message : 'Chat error' };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
