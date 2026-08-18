'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, Layers, Loader2, X } from 'lucide-react';
import type { AnalysisBatchJobStatus, AnalysisBatchStatus } from '@/lib/db/types';

interface BatchJob {
  id: string;
  video_id: string;
  video_title: string;
  status: AnalysisBatchJobStatus;
  error_message: string | null;
  analysis_result_id: string | null;
}

interface Batch {
  id: string;
  module_key: string;
  title: string | null;
  status: AnalysisBatchStatus;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  summary_status?: 'pending' | 'running' | 'complete' | 'failed' | 'not_applicable';
  created_at: string;
  jobs: BatchJob[];
}

interface Props {
  teamId: string;
  /** Limit the queue to one module's batches (module screens); omit for all. */
  moduleKey?: string;
  /** Bumped by the parent after queueing a batch, to refetch immediately. */
  refreshKey?: number;
}

const POLL_MS = 6000;
const ACTIVE: AnalysisBatchStatus[] = ['queued', 'running'];

function isActive(b: Batch) {
  return ACTIVE.includes(b.status);
}

/**
 * Live view of background analysis batches.
 *
 * This is the piece that makes "queue it and come back" true: progress lives
 * in the database, so the coach can close the tab mid-batch and this panel
 * shows exactly where things stand when they return — including per-clip
 * links to the reports that already landed.
 *
 * While it's mounted it also pokes /api/analysis/run, which drains the queue
 * from the web side. The Railway worker does the same job independently (and
 * is what keeps a batch moving with no browser open at all); both claim jobs
 * atomically, so the overlap is safe.
 */
export default function AnalysisQueue({ teamId, moduleKey, refreshKey }: Props) {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const pokingRef = useRef(false);
  const completedRef = useRef<Set<string>>(new Set());

  const apply = useCallback(
    (next: Batch[]) => {
      setBatches(next);
      setLoaded(true);

      // A batch that just finished has new reports behind it — refresh the
      // server-rendered "Past Analyses" list on the page beneath us.
      for (const b of next) {
        if (!isActive(b) && !completedRef.current.has(b.id)) {
          completedRef.current.add(b.id);
          if (b.completed_jobs > 0) router.refresh();
        } else if (isActive(b)) {
          completedRef.current.delete(b.id);
        }
      }
    },
    [router],
  );

  const fetchBatches = useCallback(async (): Promise<Batch[] | null> => {
    try {
      const params = new URLSearchParams({ teamId, limit: '5' });
      if (moduleKey) params.set('moduleKey', moduleKey);
      const res = await fetch(`/api/analysis/batches?${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      return (data.batches ?? []) as Batch[];
    } catch {
      // transient — the next poll retries
      return null;
    }
  }, [teamId, moduleKey]);

  const load = useCallback(async () => {
    const next = await fetchBatches();
    if (next) apply(next);
  }, [fetchBatches, apply]);

  const poke = useCallback(async () => {
    if (pokingRef.current) return;
    pokingRef.current = true;
    try {
      await fetch('/api/analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
    } catch {
      // The worker will pick these up regardless.
    } finally {
      pokingRef.current = false;
    }
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;
    async function read() {
      const next = await fetchBatches();
      if (!cancelled && next) apply(next);
    }
    read();
    return () => {
      cancelled = true;
    };
  }, [fetchBatches, apply, refreshKey]);

  const anyActive = batches.some(isActive);

  useEffect(() => {
    if (!anyActive) return;
    let cancelled = false;
    // Refresh on every tick regardless of the poke, which can legitimately
    // stay in flight for minutes while it works through clips.
    async function tick() {
      if (cancelled) return;
      const next = await fetchBatches();
      if (!cancelled && next) apply(next);
      if (!cancelled) poke();
    }
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [anyActive, poke, fetchBatches, apply]);

  async function cancel(batchId: string) {
    await fetch(`/api/analysis/batches/${batchId}`, { method: 'DELETE' });
    load();
  }

  if (!loaded || batches.length === 0) return null;

  return (
    <div className="glass-card p-5">
      <h2 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">
        Analysis Queue
      </h2>
      <p className="text-[11px] text-[var(--brand-muted)] mb-3">
        Runs in the background — you can leave this page or close PlayScout and come back.
      </p>

      <ul className="space-y-4">
        {batches.map((batch) => {
          const done = batch.completed_jobs + batch.failed_jobs;
          const pct = batch.total_jobs ? Math.round((done / batch.total_jobs) * 100) : 0;
          return (
            <li key={batch.id} className="border-t border-[var(--brand-border)] pt-3 first:border-0 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--brand-ink)] truncate">
                    {batch.title || `${batch.module_key} — ${batch.total_jobs} clip${batch.total_jobs === 1 ? '' : 's'}`}
                  </p>
                  <p className="text-[11px] text-[var(--brand-muted)]">
                    {batch.status === 'queued' && 'Queued'}
                    {batch.status === 'running' && `Analyzing — ${done} of ${batch.total_jobs} done`}
                    {batch.status === 'completed' &&
                      (batch.summary_status === 'running' || batch.summary_status === 'pending'
                        ? `${batch.completed_jobs} clips done — writing the combined report…`
                        : `Complete — ${batch.completed_jobs} clip${batch.completed_jobs === 1 ? '' : 's'}`)}
                    {batch.status === 'completed_with_errors' && `${batch.completed_jobs} done · ${batch.failed_jobs} failed`}
                    {batch.status === 'failed' && 'Failed'}
                    {batch.status === 'cancelled' && 'Cancelled'}
                  </p>
                </div>
                {isActive(batch) ? (
                  <button
                    onClick={() => cancel(batch.id)}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-[var(--brand-muted)] hover:text-red-600"
                  >
                    <X size={12} />
                    Cancel
                  </button>
                ) : (
                  batch.completed_jobs > 0 && (
                    <Link
                      href={`/analysis/batch/${batch.id}`}
                      className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-white bg-[var(--brand-navy)] px-2.5 py-1 rounded-lg hover:bg-[var(--brand-navy-dark)]"
                    >
                      <Layers size={12} />
                      Combined report
                    </Link>
                  )
                )}
              </div>

              {isActive(batch) && (
                <div className="mt-2 h-1 w-full rounded-full bg-[var(--brand-border)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--brand-navy)] transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              <ul className="mt-2 space-y-1">
                {batch.jobs.map((job) => (
                  <li key={job.id} className="flex items-center gap-2 text-xs">
                    <JobIcon status={job.status} />
                    <span className="min-w-0 flex-1 truncate text-[var(--brand-ink)]">{job.video_title}</span>
                    {job.analysis_result_id ? (
                      <Link
                        href={`/analysis/batch/${batch.id}`}
                        className="shrink-0 text-[11px] font-semibold text-[var(--brand-navy)] hover:underline"
                      >
                        View
                      </Link>
                    ) : (
                      <span className="shrink-0 text-[10px] text-[var(--brand-muted)]">
                        {job.status === 'waiting_for_film'
                          ? 'Waiting on film'
                          : job.status === 'running'
                            ? 'Analyzing'
                            : job.status === 'failed'
                              ? 'Failed'
                              : job.status === 'cancelled'
                                ? 'Cancelled'
                                : 'Queued'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {batch.jobs.some((j) => j.status === 'failed' && j.error_message) && (
                <p className="mt-1.5 text-[11px] text-red-600 line-clamp-2">
                  {batch.jobs.find((j) => j.status === 'failed' && j.error_message)?.error_message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function JobIcon({ status }: { status: AnalysisBatchJobStatus }) {
  if (status === 'completed') return <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />;
  if (status === 'failed') return <AlertCircle size={13} className="shrink-0 text-red-500" />;
  if (status === 'running') return <Loader2 size={13} className="shrink-0 text-[var(--brand-navy)] animate-spin" />;
  return <Clock size={13} className="shrink-0 text-[var(--brand-muted)]" />;
}
