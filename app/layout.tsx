import type { Metadata, Viewport } from 'next'
import { Space_Grotesk } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { MotionProvider } from '@/components/providers/motion-provider'
import { ScrollProgress } from '@/components/layout/scroll-progress'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
})

const SITE_URL = 'https://playscout.ai'
const TITLE = 'PlayScout — Youth Football Coaching Intelligence'
const DESCRIPTION =
  'Film-driven AI coaching intelligence built exclusively for youth football. Age-appropriate practice design, safe player development, opponent scouting, and evidence-backed game plans for 6U–14U coaches.'

export const metadata: Metadata = {
  title: { default: TITLE, template: '%s | PlayScout' },
  description: DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'PlayScout',
    images: [
      {
        url: '/og',
        width: 1200,
        height: 630,
        alt: 'PlayScout — Youth Football Coaching Intelligence',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og'],
  },
}

export const viewport: Viewport = {
  themeColor: '#485995',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light">
          <MotionProvider>
            <ScrollProgress />
            {children}
            <Toaster richColors position="bottom-right" />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
