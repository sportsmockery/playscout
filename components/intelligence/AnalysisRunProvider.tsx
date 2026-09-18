'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Owns every in-flight INLINE analysis, above the page that started it.
 *
 * Queued batches already survive navigation: the POST returns as soon as the
 * queue rows exist, a Railway worker drains them, and AnalysisDock shows the
 * progress from anywhere. The single-clip path does not go through any of
 * that — it is a plain `fetch` inside the module screen's own component, and
 * that had two consequences the moment a coach clicked anything in the sidebar:
 *
 *   1. The request itself kept running (nothing aborts it), the server
 *      finished, and `saveAnalysisResult` wrote the row — but the `setResult`
 *      landed on an unmounted component, so the report the coach had just paid
 *      for simply never appeared. It was in Analysis History, and nothing told
 *      them that.
 *   2. Nothing anywhere said a run was happening. The dock covers batches
 *      only, so from any other page the app looked idle while it was working.
 *
 * Moving ownership up to the shell fixes both, and it is the same move
 * UploadDockProvider already makes for uploads: the work belongs to something
 * that outlives the page, the page subscribes to it, and the dock reports it.
 *
 * What this deliberately does NOT do is make a run survive a full page RELOAD
 * or a closed tab. The request dies with the document, and a quick-clip run
 * cannot be resumed at all because its frames only ever existed in the
 * browser. `useBeforeUnloadWhileRunning` warns rather than pretending.
 */

export type RunStatus = 'running' | 'complete' | 'failed';

export interface AnalysisRun {
  id: string;
  moduleKey: string;
  teamId: string;
  teamName?: string;
  /** What is being read, for the dock: "3 clips" or a film title. */
  label: string;
  status: RunStatus;
  startedAt: number;
  /** Set when it lands. The page re-attaches to this on return. */
  result?: unknown;
  analysisId?: string | null;
  error?: string;
}

interface StartInput {
  moduleKey: string;
  teamId: string;
  teamName?: string;
  label: string;
  /** The body posted to /api/intelligence/analyze. */
  payload: Record<string, unknown>;
}

interface AnalysisRunContextValue {
  runs: AnalysisRun[];
  /**
   * Starts a run and resolves when it settles. The caller may await this for
   * the in-page happy path, and may equally walk away — the run is tracked
   * here either way, so nothing depends on the caller still being mounted.
   */
  startRun: (input: StartInput) => Promise<AnalysisRun>;
  /** The newest run for a module, so a screen can re-attach after navigation. */
  latestFor: (moduleKey: string, teamId: string) => AnalysisRun | undefined;
  dismiss: (id: string) => void;
}

const AnalysisRunContext = createContext<AnalysisRunContextValue | null>(null);

export function useAnalysisRuns(): AnalysisRunContextValue {
  const ctx = useContext(AnalysisRunContext);
  if (!ctx) {
    throw new Error('useAnalysisRuns must be used inside AnalysisRunProvider (mounted in AppShell)');
  }
  return ctx;
}

/** How long a finished run stays visible in the dock. */
const KEEP_DONE_MS = 30 * 60 * 1000;

export default function AnalysisRunProvider({ children }: { children: React.ReactNode }) {
  const [runs, setRuns] = useState<AnalysisRun[]>([]);

  const update = useCallback((id: string, patch: Partial<AnalysisRun>) => {
    setRuns((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const startRun = useCallback(
    async (input: StartInput): Promise<AnalysisRun> => {
      const id = `${input.moduleKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const run: AnalysisRun = {
        id,
        moduleKey: input.moduleKey,
        teamId: input.teamId,
        teamName: input.teamName,
        label: input.label,
        status: 'running',
        startedAt: Date.now(),
      };
      setRuns((list) => [run, ...list]);

      try {
        // No AbortSignal, and that is the point: the request must not be tied
        // to the lifetime of whatever component called this.
        const res = await fetch('/api/intelligence/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input.payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Analysis failed');

        const done: AnalysisRun = {
          ...run,
          status: 'complete',
          result: data.result,
          analysisId: data.analysisId ?? null,
        };
        update(id, done);
        return done;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed';
        const failed: AnalysisRun = { ...run, status: 'failed', error: message };
        update(id, failed);
        return failed;
      }
    },
    [update]
  );

  // Newest first, because startRun unshifts — so a module screen always sees
  // the run the coach started most recently, not a stale earlier one.
  const latestFor = useCallback(
    (moduleKey: string, teamId: string) =>
      runs.find((r) => r.moduleKey === moduleKey && r.teamId === teamId),
    [runs]
  );

  const dismiss = useCallback((id: string) => {
    setRuns((list) => list.filter((r) => r.id !== id));
  }, []);

  // Finished runs age out so the dock does not accumulate a session's history.
  useEffect(() => {
    if (!runs.some((r) => r.status !== 'running')) return;
    const timer = setInterval(() => {
      setRuns((list) =>
        list.filter((r) => r.status === 'running' || Date.now() - r.startedAt < KEEP_DONE_MS)
      );
    }, 60_000);
    return () => clearInterval(timer);
  }, [runs]);

  return (
    <AnalysisRunContext.Provider value={{ runs, startRun, latestFor, dismiss }}>
      {children}
    </AnalysisRunContext.Provider>
  );
}

/**
 * Warns before a reload or tab close while a run is in flight.
 *
 * Navigating inside the app is safe — the provider outlives the page. Tearing
 * down the document is not: the request dies with it, and a quick-clip run
 * cannot be restarted because its frames were never anywhere but this browser.
 * Better to say so than to lose a paid analysis silently.
 */
export function useBeforeUnloadWhileRunning(): void {
  const { runs } = useAnalysisRuns();
  const running = runs.some((r) => r.status === 'running');

  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Browsers show their own wording; assigning returnValue is what arms it.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [running]);
}
