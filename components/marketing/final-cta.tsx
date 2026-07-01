'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

export function FinalCta() {
  return (
    <section className="container mx-auto px-4 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="gold-glow mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-3xl bg-playscout-primary px-8 py-16 text-center text-white"
      >
        <h2 className="text-3xl font-bold md:text-4xl">
          Coach with evidence, not guesswork.
        </h2>
        <p className="max-w-xl text-white/85">
          Bring your film. PlayScout brings the age-appropriate, safety-first framework
          that turns it into a plan your staff can install this week.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            nativeButton={false}
            className="h-12 bg-playscout-gold px-8 text-playscout-ink hover:bg-playscout-gold/90"
            render={<Link href="/register">Start Coaching Smarter</Link>}
          />
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            className="h-12 border-white/40 bg-transparent px-8 text-white hover:bg-white/10"
            render={<Link href="/demo">Try the Interactive Demo</Link>}
          />
        </div>
      </motion.div>
    </section>
  )
}
