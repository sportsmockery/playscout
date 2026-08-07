'use client';

import { Printer } from 'lucide-react';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-navy)] border border-[var(--brand-border)] px-3 py-2 rounded-lg hover:bg-[var(--brand-bg)] transition-colors"
    >
      <Printer size={15} />
      Print / Save PDF
    </button>
  );
}
