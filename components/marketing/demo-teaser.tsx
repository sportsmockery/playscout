'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, MessageSquareText, Film, Gauge, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const EVIDENCE_CHIPS = [
  { icon: Film, label: 'Frame 7 of 16' },
  { icon: Gauge, label: 'Confidence 0.82' },
  { icon: CheckCircle2, label: 'Evidence-backed' },
]

export function DemoTeaser() {
  return (
    <section className="container mx-auto px-4 py-20 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 overflow-hidden rounded-3xl border border-playscout-gold/25 bg-playscout-primary px-8 py-14 text-center md:p-16"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,rgba(201,162,39,0.16),transparent_60%)]" />

        <div className="relative flex size-14 items-center justify-center rounded-2xl bg-playscout-gold text-playscout-primary">
          <MessageSquareText className="size-6" />
        </div>
        <h2 className="relative text-2xl font-bold text-white md:text-3xl">
          See a real coaching answer, not a marketing screenshot
        </h2>
        <p className="relative max-w-xl text-white/75">
          Ask PlayScout a question the way you&rsquo;d ask an assistant coach — a sweep getting
          blown up, a fumbling problem, a Saturday practice plan. Watch it diagnose, fix,
          and cite exactly why.
        </p>

        <div className="relative flex flex-wrap items-center justify-center gap-2.5">
          {EVIDENCE_CHIPS.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80"
            >
              <Icon className="size-3.5 text-playscout-gold" />
              {label}
            </span>
          ))}
        </div>

        <Button
          size="lg"
          nativeButton={false}
          className="gold-cta-glow group relative mt-2 h-12 gap-2 px-8 bg-playscout-gold text-playscout-primary hover:bg-playscout-gold"
          render={
            <Link href="/demo">
              Launch Full Interactive Demo{' '}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          }
        />
      </motion.div>
    </section>
  )
}
