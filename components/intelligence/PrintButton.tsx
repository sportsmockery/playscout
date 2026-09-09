'use client';

import { Printer } from 'lucide-react';

/**
 * Print / Save PDF.
 *
 * `window.print()` rather than a server-side renderer on purpose: it is the
 * flow every coach already knows, it needs no dependency, and it cannot drift
 * from what is on screen the way a second implementation of the same page
 * would. The work of making the output usable lives in the `@media print`
 * block in globals.css, not here.
 */
export default function PrintButton({ label = 'Print / Save PDF' }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-navy)] border border-[var(--brand-border)] px-3 py-2 rounded-lg hover:bg-[var(--brand-bg)] transition-colors"
    >
      <Printer size={15} />
      {label}
    </button>
  );
}
