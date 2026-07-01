'use client'

import { useRef } from 'react'
import { Navbar } from '@/components/layout/navbar'
import { QuickReferenceSidebar } from '@/components/demo/quick-reference-sidebar'
import { ChatWindow } from '@/components/demo/chat-window'
import { Sparkles } from 'lucide-react'

export default function DemoPage() {
  const senderRef = useRef<(query: string) => void>(() => {})

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar />

      <div className="flex items-center justify-center gap-2 border-b border-black/5 bg-playscout-gold/10 px-4 py-2 text-center text-xs font-medium text-playscout-ink">
        <Sparkles className="size-3.5 text-playscout-gold" />
        This is a high-fidelity demo with pre-built responses. Real PlayScout uses advanced
        multimodal AI for actual film analysis.
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[280px_1fr]">
        <aside className="hidden overflow-hidden border-r border-black/5 bg-white/40 md:block">
          <QuickReferenceSidebar onSelectQuery={(q) => senderRef.current(q)} />
        </aside>
        <main className="overflow-hidden">
          <ChatWindow registerSender={(fn) => (senderRef.current = fn)} />
        </main>
      </div>
    </div>
  )
}
