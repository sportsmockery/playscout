'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ChatMessage } from '@/components/demo/chat-message'
import { TypingIndicator } from '@/components/demo/typing-indicator'
import { matchDemoConversation } from '@/lib/demo-match'
import { DEMO_CONVERSATIONS, EXAMPLE_QUERIES, type DemoConversation, type DemoMessage } from '@/lib/content/demo-data'

const STARTER_QUERIES = EXAMPLE_QUERIES.slice(0, 4)

export interface ChatWindowHandle {
  sendExampleQuery: (query: string) => void
}

export function ChatWindow({ registerSender }: { registerSender: (fn: (query: string) => void) => void }) {
  const [messages, setMessages] = useState<DemoMessage[]>([])
  const [followUps, setFollowUps] = useState<string[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [isFilling, setIsFilling] = useState(false)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  function respond(coachText: string, conversation: DemoConversation) {
    setMessages((prev) => [...prev, { role: 'coach', text: coachText }])
    setFollowUps([])
    setIsTyping(true)

    setTimeout(() => {
      const reply = conversation.messages.find((m) => m.role === 'assistant')
      setMessages((prev) => (reply ? [...prev, reply] : prev))
      setFollowUps(conversation.followUps)
      setIsTyping(false)
    }, 900 + Math.random() * 500)
  }

  function handleExampleQuery(query: string) {
    if (isFilling || isTyping) return
    setIsFilling(true)
    setInput(query)
    setTimeout(() => {
      setInput('')
      setIsFilling(false)
      const exact = DEMO_CONVERSATIONS.find(
        (c) => c.messages.find((m) => m.role === 'coach')?.text === query
      )
      respond(query, exact ?? matchDemoConversation(query))
    }, 380)
  }

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || isTyping || isFilling) return
    setInput('')
    respond(trimmed, matchDemoConversation(trimmed))
  }

  useEffect(() => {
    registerSender(handleExampleQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-6 text-center">
            <Image src="/logo.svg" alt="PlayScout" width={56} height={61} />
            <div>
              <h2 className="text-xl font-bold text-playscout-ink">Ask PlayScout a coaching question</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Try one of these, or type your own question below.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTER_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => handleExampleQuery(q)}
                  className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs font-medium text-playscout-ink transition-colors hover:border-playscout-primary/40 hover:bg-playscout-primary/5"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            <AnimatePresence initial={false}>
              {messages.map((message, i) => (
                <ChatMessage key={i} message={message} />
              ))}
              {isTyping && <TypingIndicator key="typing" />}
            </AnimatePresence>

            {!isTyping && followUps.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-wrap gap-2 pl-11"
              >
                {followUps.map((f) => (
                  <button
                    key={f}
                    onClick={() => handleExampleQuery(f)}
                    className="rounded-full border border-playscout-primary/25 bg-playscout-primary/5 px-3.5 py-1.5 text-xs font-medium text-playscout-primary transition-colors hover:bg-playscout-primary/10"
                  >
                    {f}
                  </button>
                ))}
              </motion.div>
            )}
            <div ref={scrollRef} />
          </div>
        )}
      </div>

      <div className="border-t border-black/5 bg-white/60 p-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <motion.div
            animate={isFilling ? { boxShadow: '0 0 0 3px rgba(72,89,149,0.18)' } : { boxShadow: '0 0 0 0px rgba(72,89,149,0)' }}
            transition={{ duration: 0.3 }}
            className="flex-1 rounded-lg"
          >
            <Textarea
              value={input}
              readOnly={isFilling}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Ask about a fundamental, a tendency, a mistake, or a practice plan..."
              rows={1}
              className="max-h-32 min-h-11 resize-none bg-white"
            />
          </motion.div>
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isTyping || isFilling}
            aria-label="Send message"
            className="h-11 shrink-0 bg-playscout-primary text-white hover:bg-playscout-primary/90"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
