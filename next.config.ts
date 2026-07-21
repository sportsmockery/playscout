import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  serverExternalPackages: ['ffmpeg-static', 'pdf-parse', 'mammoth', 'pptx2json'],
  turbopack: {
    root: __dirname,
  },
}

// Safe to always wrap — with no SENTRY_AUTH_TOKEN/org/project set (no
// Sentry account exists yet), the plugin just skips source-map upload and
// falls through to plain output. Silences its "no auth token" console
// warning during local dev/CI builds until that account exists.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
})
