'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, MessageSquareText } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DemoTeaser() {
  return (
    <section className="container mx-auto px-4 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="glass-card mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-3xl p-10 text-center md:p-14"
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-playscout-primary text-white">
          <MessageSquareText className="size-6" />
        </div>
        <h2 className="text-2xl font-bold text-playscout-ink md:text-3xl">
          See a real coaching answer, not a marketing screenshot
        </h2>
        <p className="max-w-xl text-muted-foreground">
          Ask PlayScout a question the way you&rsquo;d ask an assistant coach — a sweep getting
          blown up, a fumbling problem, a Saturday practice plan. Watch it diagnose, fix,
          and cite exactly why.
        </p>
        <Button
          size="lg"
          nativeButton={false}
          className="h-12 px-8 bg-playscout-primary text-white hover:bg-playscout-primary/90 hover:-translate-y-0.5 transition-all"
          render={
            <Link href="/demo" className="flex items-center gap-2">
              Launch Full Interactive Demo <ArrowRight className="size-4" />
            </Link>
          }
        />
      </motion.div>
    </section>
  )
}
