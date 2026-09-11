import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useActiveBatches } from '@/hooks/queries';
import { runBatchQueue } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/AuthContext';

/**
 * Keeps a batch draining while the coach has the app open.
 *
 * The Railway worker is what finishes a batch when nobody is watching; this is
 * the companion for when someone is. It pokes /api/analysis/run per team with
 * live work, which claims jobs the same atomic way the worker does — so poking
 * never double-analyzes a clip, and a deployment with no worker running still
 * makes progress.
 *
 * Renders nothing. One poke per team is in flight at a time: the route runs for
 * minutes by design, and stacking pokes would just burn connections.
 */
export function AnalysisRunner() {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const { data } = useActiveBatches(signedIn);
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!signedIn) return;
    if (AppState.currentState !== 'active') return;

    const teamIds = new Set(
      (data?.batches ?? [])
        .filter((b) => b.status === 'queued' || b.status === 'running')
        .map((b) => b.team_id),
    );

    for (const teamId of teamIds) {
      if (inFlight.current.has(teamId)) continue;
      inFlight.current.add(teamId);
      runBatchQueue(teamId)
        .catch(() => {
          // A poke is best-effort. The worker is the guarantee, and the next
          // render pokes again if there is still work.
        })
        .finally(() => {
          inFlight.current.delete(teamId);
        });
    }
  }, [data, signedIn]);

  return null;
}
