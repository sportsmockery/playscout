'use client'

import { motion } from 'framer-motion'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ChatWindow } from '@/components/demo/chat-window'

export function FloatingAskButton() {
  return (
    <Dialog>
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 1 }}
        className="fixed bottom-6 right-6 z-40"
      >
        <DialogTrigger
          render={
            <Button
              size="lg"
              className="h-14 gap-2 rounded-full bg-playscout-primary px-5 text-white shadow-lg shadow-playscout-primary/30 hover:bg-playscout-primary/90 hover:shadow-xl hover:shadow-playscout-primary/40"
            >
              <MessageCircle className="size-5" />
              <span className="hidden sm:inline">Ask PlayScout</span>
            </Button>
          }
        />
      </motion.div>

      <DialogContent className="flex h-[min(700px,85vh)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-black/5 px-6 py-4">
          <DialogTitle>Ask PlayScout</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <ChatWindow registerSender={() => {}} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
