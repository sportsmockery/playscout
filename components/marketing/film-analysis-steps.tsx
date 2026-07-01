'use client'

import { motion } from 'framer-motion'
import { UploadCloud, Layers, Eye, Gauge, Wrench, BrainCircuit, type LucideIcon } from 'lucide-react'
import { FILM_ANALYSIS_STEPS } from '@/lib/content/film-framework'
import { SectionHeading } from '@/components/marketing/section-heading'
import { EASE_PREMIUM } from '@/lib/motion'

const STEP_ICONS: LucideIcon[] = [UploadCloud, Layers, Eye, Gauge, Wrench, BrainCircuit]

export function FilmAnalysisSteps() {
  return (
    <section id="how-it-works" className="container mx-auto px-4 py-20 md:py-24">
      <SectionHeading
        eyebrow="How PlayScout Works"
        title="Here are the frames. Here is what was visible."
        description="PlayScout never says 'AI watched your game.' Every step below is designed to keep evidence and interpretation separate."
        className="mb-14"
      />

      <div className="relative mx-auto max-w-3xl">
        <div className="connector-gold absolute left-7 top-2 bottom-2 hidden w-px md:block" />
        <div className="space-y-5">
          {FILM_ANALYSIS_STEPS.map((step, i) => {
            const Icon = STEP_ICONS[i % STEP_ICONS.length]
            return (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: EASE_PREMIUM }}
                className="glass-card relative flex items-start gap-5 rounded-2xl p-6"
              >
                <div className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-playscout-primary text-playscout-gold">
                  <Icon className="size-6" />
                  <span className="absolute -bottom-2 -right-2 flex size-6 items-center justify-center rounded-full bg-playscout-gold text-[11px] font-bold text-playscout-primary ring-4 ring-background">
                    {step.step}
                  </span>
                </div>
                <div className="pt-1.5">
                  <h3 className="font-semibold text-playscout-ink">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
