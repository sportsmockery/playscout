'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';

/**
 * Writes the combined report again after a failed synthesis.
 *
 * Worth stating why this exists at all: the per-clip analyses are already
 * saved, so the synthesis is ONE model call over them. Without this button the
 * only route back to the report was re-queuing the batch, which re-analyzes
 * every clip — 188 paid vision calls to redo work already on disk.
 */
export default function RetrySummaryButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function retry() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/analysis/batches/${batchId}/summary`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Could not write the report.');
      // Server component — the new report only appears on a refetch.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write the report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={retry}
        disabled={busy}
        className="flex items-center gap-1.5 text-xs font-semibold bg-[var(--brand-navy)] text-white px-3 py-2 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {busy ? 'Writing the report…' : 'Try the write-up again'}
      </button>
      <p className="text-[11px] text-red-700 mt-1.5">
        {busy
          ? 'This can take up to a minute on a large batch.'
          : 'Uses the clip analyses already saved below — no clip is analyzed again.'}
      </p>
      {error && <p className="text-xs text-red-700 mt-1.5 font-medium">{error}</p>}
    </div>
  );
}
