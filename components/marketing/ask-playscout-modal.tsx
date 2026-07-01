'use client'

import { MessageCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ChatWindow } from '@/components/demo/chat-window'

/**
 * Shared "Ask PlayScout" modal — wraps any trigger element (nav button, floating
 * button, mobile sheet item) with the same premium chat dialog.
 */
export function AskPlayScoutModal({ trigger }: { trigger: React.ReactElement }) {
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent
        showCloseButton
        className="flex h-[min(700px,85vh)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border border-black/5 p-0 shadow-2xl shadow-playscout-primary/20 data-open:zoom-in-95 data-closed:zoom-out-95"
      >
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-black/5 bg-playscout-primary px-6 py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-playscout-gold/20 text-playscout-gold">
            <MessageCircle className="size-4" />
          </div>
          <DialogTitle className="text-base font-semibold text-white">Ask PlayScout</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <ChatWindow registerSender={() => {}} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
