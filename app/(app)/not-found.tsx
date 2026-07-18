import Link from 'next/link';
import { SearchX } from 'lucide-react';

export default function AppNotFound() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="glass-card p-10 text-center">
        <div className="w-12 h-12 rounded-full bg-[var(--brand-navy)]/10 flex items-center justify-center mx-auto mb-4">
          <SearchX size={22} className="text-[var(--brand-navy)]" />
        </div>
        <h1 className="text-xl font-bold text-[var(--brand-navy)] mb-2">Not found</h1>
        <p className="text-[var(--brand-muted)] text-sm mb-6">
          This team, video, or report doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-[var(--brand-navy)] text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
