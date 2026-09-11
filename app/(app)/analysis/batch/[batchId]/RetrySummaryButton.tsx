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
/** The worker sweeps for pending summaries about once a minute. */
const POLL_MS = 5000;
const MAX_POLLS = 36; // three minutes before handing it back to the coach

export default function RetrySummaryButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState('');

  async function retry() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // Returns as soon as the batch is queued — it does NOT wait for the
      // model. The first version ran the synthesis inside this request, and a
      // 188-clip write-up outlived the phone's patience: Safari gave up with
      // "Load failed" (a fetch with no response), leaving the batch claimed by
      // a function nobody was listening to any more.
      const res = await fetch(`/api/analysis/batches/${batchId}/summary`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Could not write the report.');

      if (data.alreadyComplete) {
        router.refresh();
        return;
      }

      // The worker writes it; this watches for it to land. Refreshing the
      // server component is what re-reads summary_status.
      setQueued(true);
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const check = await fetch(`/api/analysis/batches/${batchId}`).catch(() => null);
        const state = await check?.json().catch(() => null);
        const status = state?.batch?.summary_status;
        if (status === 'complete' || status === 'failed') {
          router.refresh();
          return;
        }
      }
      // Still going. Not an error — a long batch genuinely takes a while, and
      // the report lands whether or not this page is open.
      setError(
        'Still being written. It finishes in the background — reload this page in a minute.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write the report.');
    } finally {
      setBusy(false);
      setQueued(false);
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
        {queued ? 'Writing the report…' : busy ? 'Queueing…' : 'Try the write-up again'}
      </button>
      <p className="text-[11px] text-red-700 mt-1.5">
        {busy
          ? 'Runs in the background — it finishes even if you close this page.'
          : 'Uses the clip analyses already saved below — no clip is analyzed again.'}
      </p>
      {error && <p className="text-xs text-red-700 mt-1.5 font-medium">{error}</p>}
    </div>
  );
}
