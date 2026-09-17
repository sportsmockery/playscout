'use client';

import { useEffect, useState } from 'react';
import { Pencil, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  OFFENSIVE_POSITIONS,
  DEFENSIVE_POSITIONS,
  POSITION_LABELS,
  type StatPosition,
} from '@/lib/intelligence/positions';
import type { StatLine, TeamStatTotals } from '@/lib/intelligence/stat-lines';

/**
 * "Fix a stat" — the coach's override on a charted play.
 *
 * The coach was at the game. When they say the quarterback kept it, they are
 * right and the film read was wrong, and this is where that gets said. It
 * writes the ledger rather than the rendered sheet, so the fix carries into
 * every later total instead of living in one report.
 *
 * Only the things a coach can be certain of from memory are editable: who got
 * the credit, how far it went, whether it scored, and whether it happened at
 * all. Changing a rush into a reception would break the pairing rules the
 * tally checks, so that path is a removal and a re-chart instead.
 */

export interface EditableCredit {
  id: string;
  playIndex: number;
  side: 'offense' | 'defense';
  stat: string;
  positionId: string;
  positionLabel: string;
  identifier: string;
  yards: number | null;
  touchdown: boolean;
  note: string | null;
}

interface Patch {
  position_id?: string;
  yards?: number | null;
  touchdown?: boolean;
  remove?: boolean;
}

interface Props {
  analysisId: string;
  /** Called with the re-totalled sheet so the page can re-render in place. */
  onCorrected?: (next: { lines: StatLine[]; team: TeamStatTotals; warnings: string[] }) => void;
}

function titleCase(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StatCorrections({ analysisId, onCorrected }: Props) {
  const [credits, setCredits] = useState<EditableCredit[] | null>(null);
  const [patches, setPatches] = useState<Record<string, Patch>>({});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || credits) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/intelligence/analysis/${analysisId}/stat-credits`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load the charted stats.');
        if (!cancelled) setCredits(data.credits ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the charted stats.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, credits, analysisId]);

  function patch(id: string, change: Patch) {
    setSaved(false);
    setPatches((p) => ({ ...p, [id]: { ...p[id], ...change } }));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/intelligence/analysis/${analysisId}/stat-credits`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patches }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save the correction.');
      onCorrected?.({ lines: data.lines, team: data.team, warnings: data.warnings });
      setPatches({});
      setCredits(null);
      setSaved(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the correction.');
    } finally {
      setSaving(false);
    }
  }

  const changeCount = Object.keys(patches).length;

  if (!open) {
    return (
      <div className="glass-card p-4 print:hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-[var(--brand-ink)]">
              {saved ? 'Correction saved' : 'Something charted wrong?'}
            </p>
            <p className="text-[11px] text-[var(--brand-muted)]">
              {saved
                ? 'The sheet was re-totalled from your correction, and it carries into season totals.'
                : 'Fix who got a stat, the yardage, or remove one that did not happen. Your fix updates the season record, not just this report.'}
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[var(--brand-border)] text-[var(--brand-navy)] hover:bg-[var(--brand-bg)] transition-colors"
          >
            {saved ? <CheckCircle2 size={13} /> : <Pencil size={13} />}
            Fix a stat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 print:hidden">
      <h3 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide mb-1">
        Fix A Stat
      </h3>
      <p className="text-[11px] text-[var(--brand-muted)] mb-4">
        You were at the game — what you say outranks what the film read. Moving a stat to a
        different position drops any jersey number attached to it, since that number was read for
        the player the model thought it saw.
      </p>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {!credits ? (
        <p className="text-sm text-[var(--brand-muted)]">Loading the charted plays…</p>
      ) : credits.length === 0 ? (
        <p className="text-sm text-[var(--brand-muted)]">
          This report has no charted stats in the ledger to correct.
        </p>
      ) : (
        <ul className="space-y-2 mb-4">
          {credits.map((c) => {
            const p = patches[c.id] ?? {};
            const removed = p.remove === true;
            const options = c.side === 'offense' ? OFFENSIVE_POSITIONS : DEFENSIVE_POSITIONS;
            return (
              <li
                key={c.id}
                className={`rounded-xl border p-3 ${
                  removed
                    ? 'border-red-200 bg-red-50/60 opacity-70'
                    : 'border-[var(--brand-border)] bg-white/60'
                }`}
              >
                <div className="flex items-baseline gap-2 flex-wrap mb-2">
                  <span className="text-[10px] font-bold text-[var(--brand-muted)]">
                    PLAY {c.playIndex}
                  </span>
                  <span className="text-sm font-semibold text-[var(--brand-ink)]">
                    {titleCase(c.stat)}
                  </span>
                  <span className="text-xs text-[var(--brand-muted)]">{c.identifier}</span>
                </div>
                {c.note && (
                  <p className="text-[11px] text-[var(--brand-muted)] mb-2 leading-snug">{c.note}</p>
                )}

                <div className="flex items-end gap-2 flex-wrap">
                  <label className="flex-1 min-w-[10rem]">
                    <span className="block text-[10px] uppercase tracking-wide text-[var(--brand-muted)] mb-1">
                      Credit to
                    </span>
                    <select
                      disabled={removed}
                      value={p.position_id ?? c.positionId}
                      onChange={(e) => patch(c.id, { position_id: e.target.value })}
                      className="w-full text-sm px-2 py-1.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] disabled:opacity-50"
                    >
                      {options.map((id) => (
                        <option key={id} value={id}>
                          {POSITION_LABELS[id as StatPosition]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="w-24">
                    <span className="block text-[10px] uppercase tracking-wide text-[var(--brand-muted)] mb-1">
                      Yards
                    </span>
                    <input
                      type="number"
                      disabled={removed}
                      value={('yards' in p ? p.yards : c.yards) ?? ''}
                      placeholder="—"
                      onChange={(e) =>
                        patch(c.id, { yards: e.target.value === '' ? null : Number(e.target.value) })
                      }
                      className="w-full text-sm px-2 py-1.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] disabled:opacity-50"
                    />
                  </label>

                  <label className="flex items-center gap-1.5 pb-1.5">
                    <input
                      type="checkbox"
                      disabled={removed}
                      checked={p.touchdown ?? c.touchdown}
                      onChange={(e) => patch(c.id, { touchdown: e.target.checked })}
                      className="accent-[var(--brand-navy)]"
                    />
                    <span className="text-xs text-[var(--brand-ink)]">TD</span>
                  </label>

                  <button
                    onClick={() => patch(c.id, { remove: !removed })}
                    className={`flex items-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg border transition-colors mb-0.5 ${
                      removed
                        ? 'border-red-300 text-red-700 bg-white'
                        : 'border-[var(--brand-border)] text-[var(--brand-muted)] hover:text-red-600'
                    }`}
                  >
                    <Trash2 size={12} />
                    {removed ? 'Keep' : 'Remove'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving || changeCount === 0}
          className="bg-[var(--brand-navy)] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving
            ? 'Saving…'
            : `Save ${changeCount || ''} correction${changeCount === 1 ? '' : 's'}`.trim()}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setPatches({});
            setError('');
          }}
          className="text-sm text-[var(--brand-muted)] px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
