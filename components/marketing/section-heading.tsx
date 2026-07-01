'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { viewportOnce } from '@/lib/motion'

interface SectionHeadingProps {
  eyebrow?: string
  title: string
  description?: string
  align?: 'left' | 'center'
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className
      )}
    >
      {eyebrow && (
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-playscout-gold">
          {eyebrow}
        </span>
      )}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-playscout-ink">{title}</h2>
        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={viewportOnce}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'h-[3px] w-16 origin-left rounded-full bg-gradient-to-r from-playscout-primary to-playscout-gold',
            align === 'center' && 'self-center'
          )}
        />
      </div>
      {description && (
        <p className={cn('text-muted-foreground text-lg', align === 'center' && 'max-w-2xl')}>
          {description}
        </p>
      )}
    </div>
  )
}
