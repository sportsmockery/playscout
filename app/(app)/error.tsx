'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCw } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="glass-card p-10 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={22} className="text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-[var(--brand-navy)] mb-2">Something went wrong</h1>
        <p className="text-[var(--brand-muted)] text-sm mb-6">
          We hit an unexpected error loading this page. This could be a temporary connection issue —
          try again, or head back to your dashboard.
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
            href="/dashboard"
            className="px-5 py-2.5 rounded-lg border border-[var(--brand-border)] text-sm font-semibold text-[var(--brand-muted)] hover:bg-[var(--brand-bg)] transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
