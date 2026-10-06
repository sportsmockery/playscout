'use client';

import { AlertCircle, Target } from 'lucide-react';
import type { ScoutReport } from '@/lib/db/types';
import ScoutSides from './ScoutSides';
import { useGamePlanBuild } from './useGamePlanBuild';

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
  // Built on the server and waited for by polling, so a coach can leave the
  // page, or the app, while it is written and come back to it.
  const { report, building: loading, error, build: generate } = useGamePlanBuild(teamId, opponentId, initialReport);

  const stale =
    !!report && !!batchFinishedAt && new Date(report.created_at as string) < new Date(batchFinishedAt);

  return (
    <div className={`glass-card print-breakable p-5 mb-5 ${report ? '' : 'print:hidden'}`}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="min-w-0">
          <h2 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide">
            Game plan — {opponentName} offense and defense
          </h2>
          <p className="print:hidden text-xs text-[var(--brand-muted)] mt-0.5">
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
        <p className="print:hidden text-xs text-red-600 mb-3 flex items-center gap-1">
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

      {loading && report && (
        <p className="print:hidden text-xs text-[var(--brand-navy)] bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-lg p-2 mb-3">
          Rebuilding — about 1–2 minutes. You can leave this page or the app; come back here and the new plan will be in place.
        </p>
      )}

      {report ? (
        <div className="space-y-4">
          {report.summary && <p className="text-sm text-[var(--brand-ink)]">{report.summary}</p>}
          <ScoutSides report={report} opponentName={opponentName} />
        </div>
      ) : (
        <p className="print:hidden text-sm text-[var(--brand-muted)]">
          {loading
            ? 'Writing the plan from every scouted clip — about 1–2 minutes. You can leave this page or the app; it keeps going and will be here when you come back.'
            : `No game plan yet. Build it to see ${opponentName}'s offense and defense as separate reports.`}
        </p>
      )}
    </div>
  );
}
