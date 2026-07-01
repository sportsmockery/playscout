'use client'

import { motion } from 'framer-motion'
import { Target, ShieldCheck, TrendingUp, AlertTriangle, type LucideIcon } from 'lucide-react'
import { INTELLIGENCE_MODULES, type IntelligenceModule } from '@/lib/content/modules'
import { SectionHeading } from '@/components/marketing/section-heading'
import { fadeInUp, staggerContainer, viewportOnce } from '@/lib/motion'

const ICONS: Record<IntelligenceModule['icon'], LucideIcon> = {
  Target,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
}

export function IntelligenceModules() {
  return (
    <section id="modules" className="bg-playscout-bg-alt py-20 md:py-24">
      <div className="container mx-auto px-4">
        <SectionHeading
          eyebrow="Intelligence Modules"
          title="Four specialized systems, one evidence trail"
          description="Each module reasons over film evidence for a specific dimension of the game — never a generic grade."
          className="mb-14"
        />

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={staggerContainer(0.1)}
          className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2"
        >
          {INTELLIGENCE_MODULES.map((mod) => {
            const Icon = ICONS[mod.icon]
            return (
              <motion.div
                key={mod.key}
                variants={fadeInUp}
                whileHover={{ y: -6 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="glass-card group flex flex-col gap-4 rounded-2xl p-7"
              >
                <motion.div
                  whileHover={{ scale: 1.1, rotate: -4 }}
                  transition={{ duration: 0.25 }}
                  className="flex size-12 items-center justify-center rounded-xl bg-playscout-gold/10 text-playscout-gold transition-colors group-hover:bg-playscout-gold group-hover:text-playscout-primary"
                >
                  <Icon className="size-6" />
                </motion.div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-xl font-bold text-playscout-ink">{mod.name}</h3>
                  <span className="text-sm font-medium text-muted-foreground">{mod.tagline}</span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{mod.description}</p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
