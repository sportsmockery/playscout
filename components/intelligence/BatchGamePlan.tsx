'use client';

import { useState } from 'react';
import { AlertCircle, Target } from 'lucide-react';
import type { ScoutReport } from '@/lib/db/types';
import ScoutSides from './ScoutSides';

/**
 * The game plan on a ScoutIQ batch page: the opponent's offense and defense as
 * two separate reports, built from the latest read of every one of their clips.
 *
 * A ScoutIQ batch used to end at the generic combined write-up, which mixes
 * both sides of the ball into one list, while the split game plan lived only
 * on the module screen behind a button. A coach who opened the batch they had
 * just run reasonably concluded there was no game plan at all.
 */
export default function BatchGamePlan({
  teamId,
  opponentId,
  opponentName,
  initialReport,
  batchFinishedAt,
}: {
  teamId: string;
  opponentId: string;
  opponentName: string;
  initialReport: ScoutReport | null;
  /** When the batch's last clip settled; a plan built before that predates these reads. */
  batchFinishedAt: string | null;
}) {
  const [report, setReport] = useState<ScoutReport | null>(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const stale =
    !!report && !!batchFinishedAt && new Date(report.created_at as string) < new Date(batchFinishedAt);

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/scoutiq/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, opponentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate game plan');
      setReport(data.scoutReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate game plan');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-card p-5 mb-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="min-w-0">
          <h2 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide">
            Game plan — {opponentName} offense and defense
          </h2>
          <p className="text-xs text-[var(--brand-muted)] mt-0.5">
            Built from the latest read of every {opponentName} clip you have scouted.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="print:hidden flex items-center gap-1.5 text-xs font-semibold bg-[var(--brand-navy)] text-white px-3 py-2 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-50"
        >
          <Target size={14} />
          {loading ? 'Building game plan…' : report ? 'Rebuild game plan' : 'Build game plan'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 mb-3 flex items-center gap-1">
          <AlertCircle size={13} />
          {error}
        </p>
      )}

      {stale && !loading && (
        <p className="print:hidden text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
          This game plan was built before these clips finished, so it does not include this run.
          Rebuild it to use them.
        </p>
      )}

      {report ? (
        <div className="space-y-4">
          {report.summary && <p className="text-sm text-[var(--brand-ink)]">{report.summary}</p>}
          <ScoutSides report={report} opponentName={opponentName} />
        </div>
      ) : (
        <p className="text-sm text-[var(--brand-muted)]">
          {loading
            ? 'Reading every scouted clip and writing the plan — this takes about a minute.'
            : `No game plan yet. Build it to see ${opponentName}'s offense and defense as separate reports.`}
        </p>
      )}
    </div>
  );
}
