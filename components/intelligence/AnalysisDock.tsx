'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Layers, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ActiveBatch {
  id: string;
  team_id: string;
  team_name: string | null;
  module_key: string;
  title: string | null;
  status: 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled';
  summary_status?: 'pending' | 'running' | 'complete' | 'failed' | 'not_applicable';
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  created_at: string;
}

const POLL_MS = 8000;

function isActive(b: ActiveBatch) {
  return b.status === 'queued' || b.status === 'running';
}

/**
 * App-wide view of analysis work in flight, mirroring UploadDock.
 *
 * The per-module AnalysisQueue only exists on the screen that started the
 * batch, so navigating anywhere else made running work invisible — the coach
 * had no way to tell whether 20 queued clips were progressing or stalled. This
 * sits in the app shell, so the answer is on screen from any page.
 *
 * It also pokes the runner for each team with active work, which means a batch
 * keeps draining while the coach reads their roster or watches film, not only
 * while they sit on the module page.
 */
export default function AnalysisDock() {
  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const pokingRef = useRef(false);

  const fetchActive = useCallback(async (): Promise<ActiveBatch[] | null> => {
    try {
      const res = await fetch('/api/analysis/active');
      if (!res.ok) return null;
      const data = await res.json();
      return (data.batches ?? []) as ActiveBatch[];
    } catch {
      return null;
    }
  }, []);

  const poke = useCallback(async (teamIds: string[]) => {
    if (pokingRef.current || teamIds.length === 0) return;
    pokingRef.current = true;
    try {
      // One poke per team with work outstanding. Claims are atomic, so this
      // racing the Railway worker is safe.
      await Promise.all(
        teamIds.map((teamId) =>
          fetch('/api/analysis/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId }),
          }).catch(() => null),
        ),
      );
    } finally {
      pokingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const next = await fetchActive();
      if (cancelled || !next) return;
      setBatches(next);
      const activeTeams = [...new Set(next.filter(isActive).map((b) => b.team_id))];
      if (activeTeams.length) poke(activeTeams);
    }

    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [fetchActive, poke]);

  const visible = batches.filter((b) => !dismissed.has(b.id));
  if (visible.length === 0) return null;

  const running = visible.filter(isActive);
  const heading = running.length
    ? `Analyzing ${running.reduce((n, b) => n + b.total_jobs, 0)} clip${
        running.reduce((n, b) => n + b.total_jobs, 0) === 1 ? '' : 's'
      }`
    : 'Analysis complete';

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-2xl border border-[var(--brand-border)] overflow-hidden print:hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--brand-navy)] text-white">
        <div className="flex items-center gap-2 min-w-0">
          {running.length ? (
            <Loader2 size={15} className="animate-spin shrink-0" />
          ) : (
            <CheckCircle2 size={15} className="shrink-0" />
          )}
          <p className="text-sm font-semibold truncate">{heading}</p>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 text-white/80 hover:text-white shrink-0"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {!collapsed && (
        <ul className="max-h-64 overflow-y-auto">
          {visible.map((b) => {
            const done = b.completed_jobs + b.failed_jobs;
            const pct = b.total_jobs ? Math.round((done / b.total_jobs) * 100) : 0;
            const writingReport =
              b.status === 'completed' &&
              (b.summary_status === 'pending' || b.summary_status === 'running');

            return (
              <li key={b.id} className="px-4 py-2.5 border-t border-[var(--brand-border)] first:border-t-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--brand-ink)] truncate">
                    {b.module_key}
                    {b.team_name ? <span className="text-[var(--brand-muted)]"> · {b.team_name}</span> : null}
                  </p>
                  {isActive(b) || writingReport ? (
                    <span className="text-[10px] text-[var(--brand-muted)] shrink-0">
                      {done}/{b.total_jobs}
                    </span>
                  ) : (
                    <button
                      onClick={() => setDismissed((prev) => new Set(prev).add(b.id))}
                      className="text-[10px] text-[var(--brand-muted)] hover:text-[var(--brand-ink)] shrink-0"
                    >
                      Dismiss
                    </button>
                  )}
                </div>

                {(isActive(b) || writingReport) && (
                  <div className="mt-1.5 w-full h-1 bg-[var(--brand-border)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand-gold,#d2c600)] transition-all duration-500"
                      style={{ width: `${writingReport ? 100 : pct}%` }}
                    />
                  </div>
                )}

                <p className="text-[10px] text-[var(--brand-muted)] mt-1">
                  {b.status === 'queued' && 'Queued — waiting to start'}
                  {b.status === 'running' && `Analyzing clip ${Math.min(done + 1, b.total_jobs)} of ${b.total_jobs}`}
                  {writingReport && 'Writing the combined report…'}
                  {b.status === 'completed' && !writingReport && 'Complete'}
                  {b.status === 'completed_with_errors' && `${b.completed_jobs} done · ${b.failed_jobs} failed`}
                  {b.status === 'failed' && 'Failed'}
                  {b.status === 'cancelled' && 'Cancelled'}
                </p>

                {b.completed_jobs > 0 && (
                  <Link
                    href={`/analysis/batch/${b.id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--brand-navy)] hover:underline mt-1"
                  >
                    {b.status === 'failed' || b.status === 'completed_with_errors' ? (
                      <AlertCircle size={11} />
                    ) : (
                      <Layers size={11} />
                    )}
                    {isActive(b) ? 'See progress' : 'Combined report'}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
