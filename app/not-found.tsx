import Link from 'next/link';
import Image from 'next/image';
import { Home } from 'lucide-react';

export default function RootNotFound() {
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
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--brand-gold)] mb-2">
            404
          </p>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)] mb-2">Page not found</h1>
          <p className="text-[var(--brand-muted)] text-sm mb-6">
            The page you&apos;re looking for doesn&apos;t exist or may have moved.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-[var(--brand-navy)] text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors"
          >
            <Home size={16} />
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
