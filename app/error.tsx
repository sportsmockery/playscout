'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RotateCw } from 'lucide-react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] flex flex-col">
      <div className="px-6 py-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <Image src="/logo.svg" alt="PlayScout" width={26} height={28} />
          <span className="font-bold text-[var(--brand-navy)] text-lg">PlayScout</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="glass-card w-full max-w-md p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={22} className="text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-[var(--brand-navy)] mb-2">Something went wrong</h1>
          <p className="text-[var(--brand-muted)] text-sm mb-6">
            We hit an unexpected error loading this page. You can try again, or head back home.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={reset}
              className="flex items-center gap-2 bg-[var(--brand-navy)] text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors"
            >
              <RotateCw size={15} />
              Try again
            </button>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-lg border border-[var(--brand-border)] text-sm font-semibold text-[var(--brand-muted)] hover:bg-[var(--brand-bg)] transition-colors"
            >
              Back home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
