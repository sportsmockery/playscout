'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="flex gap-3"
    >
      <motion.div
        animate={{ boxShadow: ['0 0 0 0 rgba(72,89,149,0)', '0 0 0 6px rgba(72,89,149,0.08)', '0 0 0 0 rgba(72,89,149,0)'] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/5"
      >
        <Image src="/logo.svg" alt="PlayScout" width={18} height={20} />
      </motion.div>
      <div className="glass-card flex items-center gap-1.5 rounded-2xl rounded-tl-sm px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-playscout-primary/60"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </motion.div>
  )
}
