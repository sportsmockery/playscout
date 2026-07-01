'use client'

import { motion } from 'framer-motion'
import { FILM_ANALYSIS_STEPS } from '@/lib/content/film-framework'
import { SectionHeading } from '@/components/marketing/section-heading'

export function FilmAnalysisSteps() {
  return (
    <section id="how-it-works" className="container mx-auto px-4 py-24">
      <SectionHeading
        eyebrow="Film Analysis Framework"
        title="Here are the frames. Here is what was visible."
        description="PlayScout never says 'AI watched your game.' Every step below is designed to keep evidence and interpretation separate."
        className="mb-14"
      />

      <div className="relative mx-auto max-w-3xl">
        <div className="absolute left-5 top-2 bottom-2 hidden w-px bg-playscout-primary/20 md:block" />
        <div className="space-y-6">
          {FILM_ANALYSIS_STEPS.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="glass-card relative flex gap-5 rounded-2xl p-6 md:ml-12"
            >
              <div className="absolute -left-12 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-playscout-primary text-sm font-bold text-white md:flex">
                {step.step}
              </div>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-playscout-primary text-sm font-bold text-white md:hidden">
                {step.step}
              </div>
              <div>
                <h3 className="font-semibold text-playscout-ink">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
