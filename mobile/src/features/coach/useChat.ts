import { useCallback, useRef, useState } from 'react';
import { streamChat, type ChatMessage } from '@/lib/api/chat';

export interface ChatTurn extends ChatMessage {
  id: string;
  /** Set when output safety redacted the stream. */
  redacted?: boolean;
  error?: boolean;
}

const MAX_LOCAL_HISTORY = 50; // matches server MAX_MESSAGES

let idCounter = 0;
const nextId = () => `t${Date.now()}_${idCounter++}`;

/**
 * Chat controller for PlayScoutIQ. Streams replies, supports stop/retry, caps
 * local history to the server's limit, and surfaces redacted / error states
 * honestly. Team context is passed as teamId only — never trusted client text.
 */
export function useChat(teamId: string | null, context?: { teamName?: string; ageGroup?: string }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runStream = useCallback(
    async (history: ChatTurn[]) => {
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const assistantId = nextId();
      setTurns((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      await streamChat({
        teamId: teamId ?? undefined,
        context,
        signal: controller.signal,
        messages: history.map((t) => ({ role: t.role, content: t.content })),
        onFrame: (frame) => {
          setTurns((prev) =>
            prev.map((t) => {
              if (t.id !== assistantId) return t;
              if (frame.type === 'delta') return { ...t, content: t.content + frame.text };
              if (frame.type === 'redacted') return { ...t, content: t.content + frame.text, redacted: true };
              if (frame.type === 'error') return { ...t, content: t.content, error: true };
              return t;
            }),
          );
        },
      });

      setStreaming(false);
      abortRef.current = null;
    },
    [teamId, context],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      const userTurn: ChatTurn = { id: nextId(), role: 'user', content: trimmed };
      const history = [...turns, userTurn].slice(-MAX_LOCAL_HISTORY);
      setTurns(history);
      void runStream(history);
    },
    [turns, streaming, runStream],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const retry = useCallback(() => {
    if (streaming) return;
    // Drop the last assistant turn and re-run from the last user message.
    setTurns((prev) => {
      const lastUserIdx = [...prev].reverse().findIndex((t) => t.role === 'user');
      if (lastUserIdx === -1) return prev;
      const cutoff = prev.length - lastUserIdx;
      const history = prev.slice(0, cutoff);
      void runStream(history);
      return history;
    });
  }, [streaming, runStream]);

  return { turns, streaming, send, stop, retry };
}
