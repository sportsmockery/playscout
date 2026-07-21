import * as Sentry from '@sentry/nextjs'

// No DSN set (NEXT_PUBLIC_SENTRY_DSN unset) means the SDK safely no-ops —
// safe to always call init. A real Sentry project/DSN doesn't exist yet
// (HUMAN prerequisite, same as the Stripe account for 0B.1); set the env
// var once one does and this starts reporting with zero code changes.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
