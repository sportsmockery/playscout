'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, Stethoscope, HelpCircle, Wrench, Dumbbell, Flag, LineChart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { staggerContainer, fadeInUp } from '@/lib/motion'
import type { DemoMessage } from '@/lib/content/demo-data'

const SECTION_META = [
  { key: 'diagnosis', label: 'Diagnosis', icon: Stethoscope },
  { key: 'why', label: 'Why It Is Happening', icon: HelpCircle },
  { key: 'immediateFix', label: 'Immediate Fix', icon: Wrench },
  { key: 'practiceDrill', label: 'Practice Drill', icon: Dumbbell },
  { key: 'gameAdjustment', label: 'Game Adjustment', icon: Flag },
  { key: 'whatToTrack', label: 'What to Track Next', icon: LineChart },
] as const

function sectionsToPlainText(message: DemoMessage): string {
  if (!message.sections) return message.text ?? ''
  return SECTION_META.map(
    ({ key, label }) => `${label}\n${message.sections![key]}`
  ).join('\n\n')
}

export function ChatMessage({ message }: { message: DemoMessage }) {
  const [copied, setCopied] = useState(false)
  const isCoach = message.role === 'coach'

  async function handleCopy() {
    await navigator.clipboard.writeText(sectionsToPlainText(message))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (isCoach) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex justify-end"
      >
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-playscout-primary px-4 py-3 text-sm text-white">
          {message.text}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="flex gap-3"
    >
      <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5">
        <Image src="/logo.svg" alt="PlayScout" width={18} height={20} />
      </div>

      <div className="glass-card relative max-w-[85%] rounded-2xl rounded-tl-sm p-5 ring-1 ring-inset ring-white/60">
        {message.citation && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-3 text-xs font-medium italic text-muted-foreground"
          >
            {message.citation}
          </motion.p>
        )}

        {message.sections ? (
          <motion.div initial="hidden" animate="show" variants={staggerContainer(0.12, 0.05)} className="space-y-4">
            {SECTION_META.map(({ key, label, icon: Icon }) => (
              <motion.div key={key} variants={fadeInUp}>
                <h4 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-playscout-primary">
                  <Icon className="size-3.5" />
                  {label}
                </h4>
                <p className="text-sm leading-relaxed text-playscout-ink">
                  {message.sections![key]}
                </p>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <p className="whitespace-pre-line text-sm leading-relaxed text-playscout-ink">
            {message.text}
          </p>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCopy}
          aria-label="Copy response"
          className="absolute -bottom-3 -right-3 rounded-full bg-white shadow-md ring-1 ring-black/5 hover:bg-white"
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="check"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className={cn('flex')}
              >
                <Check className="size-3.5 text-playscout-primary" />
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className="flex"
              >
                <Copy className="size-3.5" />
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </div>
    </motion.div>
  )
}
