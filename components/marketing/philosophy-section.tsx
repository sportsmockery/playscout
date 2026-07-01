'use client'

import { motion } from 'framer-motion'
import { CORE_BELIEF, PHILOSOPHY_PRINCIPLES } from '@/lib/content/philosophy'
import { SectionHeading } from '@/components/marketing/section-heading'
import { fadeInUp, staggerContainer, viewportOnce } from '@/lib/motion'

export function PhilosophySection() {
  return (
    <section id="philosophy" className="bg-white py-20 md:py-24">
      <div className="container mx-auto px-4">
        <motion.blockquote
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.6 }}
          className="gold-glow relative mx-auto mb-20 max-w-3xl rounded-3xl bg-playscout-primary px-8 py-12 text-center text-xl font-semibold leading-relaxed text-white md:text-2xl"
        >
          <span className="pointer-events-none absolute left-6 top-4 select-none font-serif text-6xl leading-none text-playscout-gold/30">
            &ldquo;
          </span>
          &ldquo;{CORE_BELIEF}&rdquo;
        </motion.blockquote>

        <SectionHeading
          eyebrow="Core Philosophy"
          title="Ten principles behind every recommendation"
          className="mb-14"
        />

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={staggerContainer(0.06)}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {PHILOSOPHY_PRINCIPLES.map((principle, i) => (
            <motion.div
              key={principle.title}
              variants={fadeInUp}
              whileHover={{ y: -6 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="glass-card flex flex-col gap-3 rounded-2xl p-6"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-playscout-gold/10 text-xs font-bold text-playscout-gold">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="font-semibold text-playscout-ink">{principle.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {principle.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
