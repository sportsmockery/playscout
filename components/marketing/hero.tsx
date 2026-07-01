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
    <section className="hero-dark-gradient relative overflow-hidden">
      {/* Subtle bottom fade into the light-gray body */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-playscout-background" />

      {FLOATERS.map((f, i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute text-playscout-gold/25"
          style={{ top: f.top, left: f.left }}
          animate={{ y: [0, -16, 0], opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: f.duration, delay: f.delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ArrowRight style={{ width: f.size, height: f.size }} />
        </motion.div>
      ))}

      <div className="container relative mx-auto flex flex-col items-center px-4 pt-20 pb-28 text-center md:pt-28">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          whileHover={{ scale: 1.04 }}
          className="gold-glow mb-8 rounded-3xl bg-white/5 p-2 ring-1 ring-white/10"
        >
          <Image src="/logo.svg" alt="PlayScout" width={72} height={79} priority />
        </motion.div>

        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-playscout-gold/30 bg-playscout-gold/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-playscout-gold-light"
        >
          Youth Football Intelligence
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-4xl text-4xl font-bold tracking-tight text-white md:text-6xl"
        >
          The Coaching Intelligence System Built Exclusively for{' '}
          <span className="text-playscout-gold-light">Youth Football</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 max-w-2xl text-lg text-white/70 md:text-xl"
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
              className="gold-cta-glow h-12 px-8 text-base bg-playscout-gold text-playscout-primary hover:bg-playscout-gold"
              render={<Link href="/register">Start Coaching Smarter</Link>}
            />
          </Magnetic>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            className="h-12 border-white/25 bg-white/5 px-8 text-base text-white transition-all hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/10"
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
              whileHover={{ y: -4, borderColor: 'rgba(201,162,39,0.4)' }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-5 backdrop-blur-sm"
            >
              <Icon className="size-5 text-playscout-gold" />
              <span className="text-sm font-semibold text-white">{label}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-14 flex flex-col items-center gap-1 text-white/50"
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
