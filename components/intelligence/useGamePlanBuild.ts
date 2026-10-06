'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScoutReport } from '@/lib/db/types';

/**
 * Builds a ScoutIQ game plan on the SERVER and waits for it by polling.
 *
 * POST /api/scoutiq/report returns at once (202) and the plan is written in
 * `after()`. Holding the request open instead tied a one-to-two-minute build to
 * the browser tab, and on a phone switching apps killed it — "the build failed
 * when I left the page". The moment it was asked for is kept in localStorage,
 * so a coach who leaves and comes back picks the wait back up and sees the plan
 * land rather than a page that has forgotten anything was happening.
 */

const POLL_MS = 5_000;
/** A build that has not landed by now is treated as failed. */
const GIVE_UP_MS = 6 * 60 * 1000;

const keyFor = (opponentId: string) => `playscout:gameplan-build:${opponentId}`;

function readPending(opponentId: string): string | null {
  try {
    const at = window.localStorage.getItem(keyFor(opponentId));
    if (!at || Date.now() - new Date(at).getTime() > GIVE_UP_MS) return null;
    return at;
  } catch {
    return null;
  }
}

function writePending(opponentId: string, at: string | null) {
  try {
    if (at) window.localStorage.setItem(keyFor(opponentId), at);
    else window.localStorage.removeItem(keyFor(opponentId));
  } catch {
    /* storage unavailable — the in-page wait still works */
  }
}

export function useGamePlanBuild(teamId: string, opponentId: string | null | undefined, initial: ScoutReport | null) {
  // What a build fetched. What is SHOWN is derived — the newer of that and the
  // plan the page was rendered with — so a fresh server render is never hidden
  // behind an older fetched copy, and no effect has to copy props into state.
  const [fetched, setFetched] = useState<ScoutReport | null>(null);
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const report =
    fetched && fetched.opponent_id === opponentId &&
    (!initial || new Date(fetched.created_at as string) > new Date(initial.created_at as string))
      ? fetched
      : initial;

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const poll = useCallback(
    (since: string) => {
      if (!opponentId) return;
      stop();
      setRequestedAt(since);
      const check = async () => {
        try {
          const res = await fetch(`/api/scoutiq/report?teamId=${teamId}&opponentId=${opponentId}`, { cache: 'no-store' });
          const data = await res.json().catch(() => ({}));
          const latest = data.scoutReport as ScoutReport | null;
          if (latest && new Date(latest.created_at as string) > new Date(since)) {
            stop();
            setFetched(latest);
            setRequestedAt(null);
            writePending(opponentId, null);
            return;
          }
        } catch {
          /* a dropped poll is retried on the next tick */
        }
        if (Date.now() - new Date(since).getTime() > GIVE_UP_MS) {
          stop();
          setRequestedAt(null);
          writePending(opponentId, null);
          setError('The game plan did not finish. Try again — if it keeps failing, tell us.');
        }
      };
      void check();
      timer.current = setInterval(check, POLL_MS);
    },
    [opponentId, teamId, stop]
  );

  // Coming back to the page mid-build resumes the wait.
  useEffect(() => {
    if (!opponentId) return;
    const pending = readPending(opponentId);
    // Deferred a tick: starting the wait sets state, which an effect body must not do synchronously.
    const resume = pending ? setTimeout(() => poll(pending), 0) : null;
    return () => {
      if (resume) clearTimeout(resume);
      stop();
    };
  }, [opponentId, poll, stop]);

  const build = useCallback(async () => {
    if (!opponentId) return;
    setError('');
    try {
      const res = await fetch('/api/scoutiq/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, opponentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not start the game plan');
      const at = (data.requestedAt as string) ?? new Date().toISOString();
      writePending(opponentId, at);
      poll(at);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the game plan');
    }
  }, [opponentId, teamId, poll]);

  return { report, building: requestedAt !== null, error, build };
}
