import type { Variants, Transition } from 'framer-motion'

/** Premium ease curve — used across the marketing site for all scroll reveals & hovers. */
export const EASE_PREMIUM: Transition['ease'] = [0.16, 1, 0.3, 1]

/** Standard durations (seconds) for the motion system. 150–350ms range. */
export const DURATION = {
  fast: 0.15,
  base: 0.25,
  slow: 0.35,
} as const

/** Reusable spring presets. */
export const SPRING_SNAPPY: Transition = { type: 'spring', stiffness: 380, damping: 32 }
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 200, damping: 22, mass: 0.5 }

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_PREMIUM } },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: EASE_PREMIUM } },
}

export const staggerContainer = (stagger = 0.08, delayChildren = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren },
  },
})

/** Card lift + gold-tinted navy shadow on hover — used by every card grid. */
export const cardHover: Variants = {
  rest: { y: 0, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' },
  hover: {
    y: -8,
    boxShadow: '0 20px 40px -14px rgba(15,23,42,0.22), 0 8px 20px -10px rgba(201,162,39,0.2)',
    transition: { duration: DURATION.slow, ease: EASE_PREMIUM },
  },
}

/** Icon gentle scale + micro-rotate, paired with cardHover on the parent. */
export const iconHover: Variants = {
  rest: { scale: 1, rotate: 0 },
  hover: { scale: 1.1, rotate: -4, transition: { duration: DURATION.base, ease: EASE_PREMIUM } },
}

/** Gold CTA press/hover scale — pairs with the .gold-cta-glow CSS class for shadow. */
export const ctaHover = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: SPRING_SOFT,
}

/** Modal (Ask PlayScout) elegant scale + fade entrance. */
export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_PREMIUM } },
  exit: { opacity: 0, scale: 0.97, y: 4, transition: { duration: DURATION.fast, ease: EASE_PREMIUM } },
}

export const viewportOnce = { once: true, amount: 0.2 } as const
