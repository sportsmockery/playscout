/**
 * Queues a background analysis batch from a module screen.
 *
 * The POST returns as soon as the queue rows exist — nothing is analyzed
 * inside the request — so the coach can navigate away (or quit) the moment
 * this resolves. AnalysisQueue is what shows them the progress afterwards.
 */
export async function queueAnalysisBatch(input: {
  teamId: string;
  moduleKey: string;
  videoIds: string[];
  playerId?: string;
  title?: string;
  /** The module context the coach configured, replayed for every clip. */
  context: Record<string, unknown>;
}): Promise<{ batchId: string; queued: number }> {
  const res = await fetch('/api/analysis/batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not queue the analysis.');
  return data as { batchId: string; queued: number };
}

/** "12 clips" / "Week 3 vs Wildcats" style label for a queued batch. */
export function batchTitle(moduleKey: string, count: number): string {
  return `${moduleKey} — ${count} clip${count === 1 ? '' : 's'}`;
}
