'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ShieldCheck, Film, GraduationCap, HeartHandshake, ArrowRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Magnetic } from '@/components/marketing/magnetic'

const PILLARS = [
  { icon: ShieldCheck, label: 'Safety First' },
  { icon: Film, label: 'Film-Driven' },
  { icon: GraduationCap, label: 'Age-Appropriate' },
  { icon: HeartHandshake, label: 'Player Confidence' },
]

const FLOATERS = [
  { top: '18%', left: '8%', size: 22, duration: 9, delay: 0 },
  { top: '65%', left: '12%', size: 16, duration: 11, delay: 1.2 },
  { top: '28%', left: '88%', size: 18, duration: 10, delay: 0.6 },
  { top: '70%', left: '90%', size: 14, duration: 8, delay: 2 },
]

export function Hero() {
  return (
    <section className="relative overflow-hidden field-lines">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-playscout-primary/[0.06] via-transparent to-transparent" />

      {FLOATERS.map((f, i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute text-playscout-primary/10"
          style={{ top: f.top, left: f.left }}
          animate={{ y: [0, -16, 0], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: f.duration, delay: f.delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ArrowRight style={{ width: f.size, height: f.size }} />
        </motion.div>
      ))}

      <div className="container mx-auto flex flex-col items-center px-4 pt-20 pb-24 text-center md:pt-28">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          whileHover={{ scale: 1.04 }}
          className="mb-8 rounded-3xl p-2 gold-glow"
        >
          <Image src="/logo.svg" alt="PlayScout" width={72} height={79} priority />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-4xl text-4xl font-bold tracking-tight text-playscout-ink md:text-6xl"
        >
          The Coaching Intelligence System Built Exclusively for{' '}
          <span className="text-playscout-primary">Youth Football</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl"
        >
          Evidence first. Football interpretation second. Coaching recommendation third.
          Team memory forever. PlayScout turns game film into age-appropriate, safety-first
          coaching your volunteer staff can install at practice this week.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Magnetic>
            <Button
              size="lg"
              nativeButton={false}
              className="h-12 px-8 text-base bg-playscout-primary text-white transition-shadow hover:bg-playscout-primary/90 hover:shadow-xl hover:shadow-playscout-primary/40"
              render={<Link href="/register">Start Coaching Smarter</Link>}
            />
          </Magnetic>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            className="h-12 px-8 text-base transition-all hover:-translate-y-0.5 hover:border-playscout-primary/40 hover:shadow-md"
            render={<Link href="/demo">Try the Interactive Demo</Link>}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {PILLARS.map(({ icon: Icon, label }) => (
            <motion.div
              key={label}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.25 }}
              className="glass-card flex flex-col items-center gap-2 rounded-2xl px-4 py-5"
            >
              <Icon className="size-5 text-playscout-primary" />
              <span className="text-sm font-semibold text-playscout-ink">{label}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-14 flex flex-col items-center gap-1 text-muted-foreground"
        >
          <motion.div
            animate={{ y: [0, 5, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown className="size-5" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
