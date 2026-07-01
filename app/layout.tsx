import type { Metadata, Viewport } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'PlayScout — Football Intelligence Platform',
    template: '%s | PlayScout',
  },
  description:
    'AI-powered football scouting and coaching intelligence. Analyze film, build rosters, develop players, and outsmart the competition.',
  keywords: [
    'football scouting',
    'AI coaching',
    'film analysis',
    'youth football',
    'PlayScout',
    'player development',
  ],
  authors: [{ name: 'PlayScout' }],
  creator: 'PlayScout',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://playscout.ai'
  ),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://playscout.ai',
    siteName: 'PlayScout',
    title: 'PlayScout — Football Intelligence Platform',
    description:
      'AI-powered football scouting and coaching intelligence. Analyze film, build rosters, develop players.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'PlayScout' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PlayScout — Football Intelligence Platform',
    description:
      'AI-powered football scouting and coaching intelligence.',
    images: ['/og-image.png'],
  },
  manifest: '/site.webmanifest',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#485995',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} font-sans antialiased`}>
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
