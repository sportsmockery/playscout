'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Watches for the combined write-up to land, then re-renders the page.
 *
 * The waiting banner told a coach to "refresh in a moment" and then never
 * changed on its own, so the only way to learn the report had arrived was to
 * keep pulling the page down — on a phone, next to a spinner that looks like
 * it is doing the watching for you. The synthesis runs on the worker and the
 * page is a server component, so something has to ask.
 */
const POLL_MS = 6000;
/** Twelve minutes. Past that a page left open overnight stops hammering. */
const MAX_POLLS = 120;

export default function AwaitSummary({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let polls = 0;

    const timer = setInterval(async () => {
      if (cancelled) return;
      if (++polls > MAX_POLLS) {
        clearInterval(timer);
        setGaveUp(true);
        return;
      }
      const res = await fetch(`/api/analysis/batches/${batchId}`).catch(() => null);
      const data = await res?.json().catch(() => null);
      const status = data?.batch?.summary_status;
      // 'failed' too, so a second failure surfaces its reason and the retry
      // button rather than leaving this banner up forever claiming progress.
      if (status === 'complete' || status === 'failed' || status === 'not_applicable') {
        clearInterval(timer);
        if (!cancelled) router.refresh();
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [batchId, router]);

  if (!gaveUp) return null;

  return (
    <p className="text-sm text-amber-800 mt-2">
      This is taking longer than expected. The report still finishes in the background — reload
      the page to check.
    </p>
  );
}
