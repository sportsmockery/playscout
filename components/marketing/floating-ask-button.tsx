'use client'

import { motion } from 'framer-motion'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AskPlayScoutModal } from '@/components/marketing/ask-playscout-modal'

export function FloatingAskButton() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 1 }}
      className="fixed bottom-6 right-6 z-40"
    >
      <AskPlayScoutModal
        trigger={
          <Button
            size="lg"
            className="gold-cta-glow h-14 gap-2 rounded-full bg-playscout-gold px-5 text-playscout-primary shadow-lg shadow-playscout-gold/30 hover:bg-playscout-gold"
          >
            <MessageCircle className="size-5" />
            <span className="hidden sm:inline">Ask PlayScout</span>
          </Button>
        }
      />
    </motion.div>
  )
}
