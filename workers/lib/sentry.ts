import * as Sentry from '@sentry/node'

/**
 * No 'server-only' guard (workers run outside Next.js entirely — see the
 * same note in lib/ai/record-usage.ts). Safe to call with no DSN: like the
 * Next.js SDK, @sentry/node no-ops capture calls when dsn is unset rather
 * than throwing. No Sentry account/DSN exists yet; set SENTRY_DSN once one
 * does and this starts reporting with zero code changes.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.SENTRY_DSN,
})

export { Sentry }
