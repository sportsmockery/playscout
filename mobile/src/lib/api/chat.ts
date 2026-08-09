import { fetch as expoFetch } from 'expo/fetch';
import { apiUrl, authHeaders } from './client';
import { parseSSEBuffer, type ChatFrame } from './sse';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamChatArgs {
  messages: ChatMessage[];
  teamId?: string;
  context?: { teamName?: string; ageGroup?: string };
  signal?: AbortSignal;
  onFrame: (frame: ChatFrame) => void;
}

/**
 * Streams a PlayScoutIQ reply. Uses Expo's streaming fetch so we can read the
 * SSE body incrementally on-device. The mobile client NEVER builds trusted team
 * context from arbitrary text — it passes only teamId (server-authorized) and
 * light display hints. Provider/model names never appear here.
 */
export async function streamChat({ messages, teamId, context, signal, onFrame }: StreamChatArgs): Promise<void> {
  const headers = await authHeaders();
  const res = await expoFetch(apiUrl('/api/playscoutiq/chat'), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, teamId, context }),
    signal,
  });

  if (!res.ok || !res.body) {
    onFrame({
      type: 'error',
      message:
        res.status === 429
          ? 'PlayScoutIQ is busy right now. Please try again in a moment.'
          : 'PlayScoutIQ is unavailable right now. Please try again.',
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { frames, remainder } = parseSSEBuffer(buffer);
      buffer = remainder;
      for (const frame of frames) onFrame(frame);
    }
    // Flush any trailing complete frame.
    const { frames } = parseSSEBuffer(buffer + '\n\n');
    for (const frame of frames) onFrame(frame);
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      onFrame({ type: 'error', message: 'The connection was interrupted.' });
    }
  }
}
