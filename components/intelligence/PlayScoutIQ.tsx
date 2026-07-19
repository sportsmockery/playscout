'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Send, RefreshCw, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

interface Props {
  teamId?: string;
  teamName?: string;
  ageGroup?: string;
  recentAnalysis?: string;
  /** If true, renders as a full-page panel. If false, renders as a floating sidebar widget. */
  fullPage?: boolean;
}

// Starter questions span the full range of what youth coaches actually ask.
// Rotated randomly so coaches see different suggestions each session.
const ALL_STARTER_QUESTIONS = [
  // Scheme & strategy
  'What offensive schemes exploit a 5-3 defense at 10U?',
  'What base defense should I run for a 10U team?',
  'How do I stop a team that runs jet sweep every play?',
  'What plays work best when the other team has a dominant DT?',
  'How do I attack a 6-2 defense with a spread formation?',
  'When should I blitz vs. drop into coverage at youth level?',
  // Practice planning
  'Build me a 90-minute practice plan for Tuesday',
  'We only have 60 minutes today — what do I cut?',
  'How do I structure the first practice of the season?',
  'How many plays should I install per week at 10U?',
  // Player development
  'How do I teach a 10-year-old QB to throw a spiral?',
  'My running back keeps fumbling — what drill fixes it?',
  'How do I teach safe tackling technique to beginners?',
  'What footwork drills are best for youth offensive linemen?',
  // Game day
  'What halftime adjustments do I make if we\'re getting gashed on the edge?',
  'We\'re down two scores with 4 minutes left — what do I do?',
  'How do I manage the clock at the end of the first half?',
  // Scouting
  'What tendencies should I look for in opponent film?',
  'We\'re playing a Wing-T team next week — what do I need to know?',
  'How do I build a simple scouting report for my staff?',
  // Safety & rules
  'How many contact practices can we have per week at 10U?',
  'What drills are prohibited at youth level?',
  'What do I do if a player takes a hit to the head?',
  // Roster & culture
  'Playing time is causing parent problems — how do I handle it?',
  'I have a dominant athlete — where should I play him?',
  'How do I keep kids motivated when we\'re on a losing streak?',
];

// Pick 4 random starters per session
const STARTER_QUESTIONS = ALL_STARTER_QUESTIONS
  .sort(() => Math.random() - 0.5)
  .slice(0, 4);

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function PlayScoutIQ({ teamId, teamName, ageGroup, recentAnalysis, fullPage = false }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;

    setInput('');
    setError('');

    const userMsg: Message = { role: 'user', content, id: generateId() };
    const assistantId = generateId();

    setMessages((prev) => [
      ...prev,
      userMsg,
      { role: 'assistant', content: '', id: assistantId },
    ]);
    setStreaming(true);

    try {
      const res = await fetch('/api/playscoutiq/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          teamId,
          context: { teamName, ageGroup, recentAnalysis },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Request failed');
      }

      const reader = res.body!.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'delta' && event.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.text }
                    : m
                )
              );
            }
            if (event.type === 'done' || event.type === 'error') {
              if (event.type === 'error') setError(event.message ?? 'Stream error');
              break;
            }
          } catch {
            // non-JSON line
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      // Remove the empty assistant bubble
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setStreaming(false);
      readerRef.current = null;
      inputRef.current?.focus();
    }
  }, [input, messages, streaming, teamId, teamName, ageGroup, recentAnalysis]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([]);
    setError('');
  }

  const containerClass = fullPage
    ? 'flex flex-col h-[calc(100vh-80px)]'
    : 'flex flex-col h-full max-h-[640px]';

  return (
    <div className={`glass-card overflow-hidden ${containerClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--brand-border)] bg-[var(--brand-navy)] text-white">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center p-1">
            <Image src="/logo.svg" alt="" width={16} height={18} />
          </div>
          <div>
            <p className="font-bold text-sm leading-none">PlayScoutIQ</p>
            {teamName && (
              <p className="text-xs text-white/60 mt-0.5">{teamName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-white/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Online
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
              title="Clear chat"
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--brand-navy)]/10 flex items-center justify-center mb-3">
              <Sparkles size={22} className="text-[var(--brand-navy)]" />
            </div>
            <p className="font-semibold text-[var(--brand-navy)] mb-1">Ask me anything</p>
            <p className="text-sm text-[var(--brand-muted)] mb-5 max-w-xs">
              Coaching strategy, film analysis, player development, practice planning — I&apos;m here.
            </p>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-xs p-2.5 rounded-lg border border-[var(--brand-border)] hover:border-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/5 text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-white ring-1 ring-black/5 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5 p-1">
                <Image src="/logo.svg" alt="" width={14} height={15} />
              </div>
            )}
            <div
              className={`max-w-[85%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[var(--brand-navy)] text-white rounded-tr-sm'
                  : 'bg-white border border-[var(--brand-border)] text-[var(--brand-ink)] rounded-tl-sm'
              }`}
            >
              {msg.role === 'assistant' ? (
                msg.content ? (
                  <div className="prose-chat">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                    {streaming && msg === messages[messages.length - 1] && (
                      <span className="inline-block w-1.5 h-4 bg-[var(--brand-navy)] ml-0.5 animate-pulse rounded-sm" />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[var(--brand-muted)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-navy)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-navy)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-navy)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {error && (
          <div className="flex justify-center">
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              {error}
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-[var(--brand-border)] bg-white">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask PlayScoutIQ..."
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none px-3 py-2.5 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all placeholder:text-[var(--brand-muted)] disabled:opacity-60 max-h-32"
            style={{ lineHeight: '1.4' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || streaming}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--brand-navy)] text-white hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-xs text-[var(--brand-muted)] mt-1.5 text-center">
          PlayScoutIQ · Powered by Claude
        </p>
      </div>
    </div>
  );
}
