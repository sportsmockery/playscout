'use client'

import { motion } from 'framer-motion'
import {
  Film,
  ShieldCheck,
  Users,
  Target,
  ClipboardList,
  TrendingUp,
  Gauge,
  BrainCircuit,
  type LucideIcon,
} from 'lucide-react'
import { FEATURES, type Feature } from '@/lib/content/features'
import { SectionHeading } from '@/components/marketing/section-heading'
import { fadeInUp, staggerContainer, viewportOnce, cardHover, iconHover } from '@/lib/motion'

const ICONS: Record<Feature['icon'], LucideIcon> = {
  Film,
  ShieldCheck,
  Users,
  Target,
  ClipboardList,
  TrendingUp,
  Gauge,
  BrainCircuit,
}

export function FeatureGrid() {
  return (
    <section id="features" className="container mx-auto px-4 py-24">
      <SectionHeading
        eyebrow="Features"
        title="Built on evidence, not guesswork"
        description="Every module below exists to turn game film into a specific, coachable action — never a vague grade."
        className="mb-14"
      />
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={viewportOnce}
        variants={staggerContainer(0.08)}
        className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        {FEATURES.map((feature) => {
          const Icon = ICONS[feature.icon]
          return (
            <motion.div key={feature.title} variants={fadeInUp}>
              <motion.div
                initial="rest"
                whileHover="hover"
                animate="rest"
                variants={cardHover}
                className="glass-card group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl p-6"
              >
                <motion.div
                  variants={iconHover}
                  className="flex size-11 items-center justify-center rounded-xl bg-playscout-gold/10 text-playscout-gold transition-colors group-hover:bg-playscout-gold group-hover:text-playscout-primary"
                >
                  <Icon className="size-5" />
                </motion.div>
                <h3 className="font-semibold text-playscout-ink">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>

                <motion.span
                  variants={{ rest: { scaleX: 0 }, hover: { scaleX: 1 } }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-gradient-to-r from-playscout-gold to-playscout-gold-light"
                />
              </motion.div>
            </motion.div>
          )
        })}
      </motion.div>
    </section>
  )
}
