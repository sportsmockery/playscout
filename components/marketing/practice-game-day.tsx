'use client'

import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { SectionHeading } from '@/components/marketing/section-heading'
import {
  DAILY_PRACTICE_TEMPLATE,
  SEASON_PHASES,
  GAME_DAY_FRAMEWORK,
} from '@/lib/content/practice-framework'

export function PracticeGameDay() {
  return (
    <section className="bg-white/40 py-24">
      <div className="container mx-auto px-4">
        <SectionHeading
          eyebrow="Practice & Game Day"
          title="A season-long framework, not a one-off plan"
          className="mb-14"
        />

        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="glass-card rounded-2xl p-6"
          >
            <h3 className="mb-4 font-semibold text-playscout-ink">90-minute practice template</h3>
            <div className="space-y-2">
              {DAILY_PRACTICE_TEMPLATE.map((seg) => (
                <div
                  key={seg.segment}
                  className="flex items-start justify-between gap-3 border-b border-black/5 py-2 text-sm last:border-0"
                >
                  <div>
                    <p className="font-medium text-playscout-ink">{seg.segment}</p>
                    <p className="text-xs text-muted-foreground">{seg.content}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-playscout-primary/10 px-2.5 py-1 text-xs font-semibold text-playscout-primary">
                    {seg.minutes} min
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          <div className="flex flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="glass-card rounded-2xl p-6"
            >
              <h3 className="mb-4 font-semibold text-playscout-ink">Season phases</h3>
              <div className="flex flex-wrap gap-2">
                {SEASON_PHASES.map((p, i) => (
                  <div
                    key={p.phase}
                    className="rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-xs"
                    title={p.goal}
                  >
                    <span className="font-semibold text-playscout-primary">{i + 1}.</span>{' '}
                    <span className="font-medium text-playscout-ink">{p.phase}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="gold-glow rounded-2xl bg-playscout-primary p-6 text-white"
            >
              <h3 className="mb-2 font-semibold">The Halftime Rule</h3>
              <p className="text-sm leading-relaxed text-white/90">{GAME_DAY_FRAMEWORK.halftimeRule}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="glass-card rounded-2xl p-6"
            >
              <h3 className="mb-3 font-semibold text-playscout-ink">Pre-game checklist</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {GAME_DAY_FRAMEWORK.pregame.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-playscout-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
