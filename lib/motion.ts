import type { Variants, Transition } from 'framer-motion'

export const EASE_PREMIUM: Transition['ease'] = [0.16, 1, 0.3, 1]

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

export const cardHover = {
  rest: { y: 0, boxShadow: '0 1px 2px rgba(17,24,39,0.04)' },
  hover: {
    y: -8,
    boxShadow: '0 20px 45px -12px rgba(72,89,149,0.35)',
    transition: { duration: 0.3, ease: EASE_PREMIUM },
  },
}

export const viewportOnce = { once: true, amount: 0.2 } as const
