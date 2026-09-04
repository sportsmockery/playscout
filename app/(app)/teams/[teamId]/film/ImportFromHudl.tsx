'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, X, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { parseHudlUrl } from '@/lib/import/hudl-url';

interface ImportJob {
  id: string;
  status: string;
  current_step: string | null;
  clips_found: number;
  clips_imported: number;
  clips_failed: number;
  error_message: string | null;
  title: string | null;
  created_at: string;
}

const LIVE_STATUSES = ['queued', 'running', 'retrying'];
const POLL_MS = 5000;

interface Props {
  teamId: string;
  folders?: { id: string; name: string }[];
  defaultFolderId?: string;
  opponentId?: string;
}

/**
 * Starts a Hudl playlist import and shows it running.
 *
 * The same parser the API route and the worker use runs here on every
 * keystroke, so a coach who pastes the wrong Hudl page is told what to copy
 * instead before they press the button.
 */
export default function ImportFromHudl({ teamId, folders, defaultFolderId, opponentId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState(defaultFolderId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  // Whether the last poll saw film arrive, so the library refreshes once
  // rather than on every tick.
  const importedCount = useRef(0);

  // Fetches without touching state; the effect owns the setState so the poll
  // and the submit handler can share one request shape.
  const fetchJobs = useCallback(async (): Promise<ImportJob[] | null> => {
    const res = await fetch(`/api/integrations/hudl/import?teamId=${teamId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { jobs: ImportJob[] };
    return data.jobs ?? [];
  }, [teamId]);

  const apply = useCallback(
    (next: ImportJob[] | null) => {
      if (!next) return;
      setJobs(next);
      // Clips land one at a time, so the library is refreshed when the count
      // moves rather than on every poll.
      const total = next.reduce((sum, job) => sum + job.clips_imported, 0);
      if (total > importedCount.current) {
        importedCount.current = total;
        router.refresh();
      }
    },
    [router]
  );

  const live = jobs.some((job) => LIVE_STATUSES.includes(job.status));

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const next = await fetchJobs();
      if (!cancelled) apply(next);
    }
    tick();
    if (!live) return () => {
      cancelled = true;
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fetchJobs, apply, live]);

  const check = url.trim() ? parseHudlUrl(url) : null;
  const linkProblem = check && !check.ok ? check.reason : '';

  function reset() {
    setOpen(false);
    setUrl('');
    setTitle('');
    setFolderId(defaultFolderId ?? '');
    setError('');
  }

  async function submit() {
    if (!check?.ok || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/integrations/hudl/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          url: url.trim(),
          title: title.trim() || undefined,
          folderId: folderId || undefined,
          opponentId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not start that import.');
      reset();
      apply(await fetchJobs());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start that import.');
    } finally {
      setSaving(false);
    }
  }

  const visible = jobs.filter(
    (job) => LIVE_STATUSES.includes(job.status) || job.status === 'partial' || job.status === 'failed'
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg border border-[var(--brand-border)] text-[var(--brand-ink)] hover:bg-[var(--brand-bg)] transition-colors"
      >
        <Download size={16} />
        Import from Hudl
      </button>

      {visible.length > 0 && (
        <div className="w-full mt-3 space-y-2">
          {visible.map((job) => (
            <HudlJobRow key={job.id} job={job} teamId={teamId} />
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-[var(--brand-navy)] text-lg">Import From Hudl</h2>
              <button
                onClick={reset}
                className="p-1 text-[var(--brand-muted)] hover:text-[var(--brand-ink)]"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-[var(--brand-muted)] mb-4">
              Open the playlist or game in Hudl, copy the address bar, and paste it here. PlayScout
              signs in with the Hudl account connected in{' '}
              <Link
                href={`/teams/${teamId}/settings`}
                className="underline hover:text-[var(--brand-navy)]"
              >
                team settings
              </Link>{' '}
              and pulls each clip into your film library. You can leave this page — it runs in the
              background.
            </p>

            <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
              Hudl link
            </label>
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://app.hudl.com/watch/team/95968/analyze?v=97226551&l=…"
              className="w-full px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] mb-1"
            />
            {linkProblem && <p className="text-xs text-amber-700 mb-2">{linkProblem}</p>}

            <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5 mt-3">
              Name these clips (optional)
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Week 3 vs Wildcats — defense"
              className="w-full px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
            />

            {folders && folders.length > 0 && (
              <>
                <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5 mt-3">
                  Folder (optional)
                </label>
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
                >
                  <option value="">No folder</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={reset}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-[var(--brand-border)] text-[var(--brand-ink)] hover:bg-[var(--brand-bg)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!check?.ok || saving}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-[var(--brand-navy)] text-white disabled:opacity-40 transition-opacity"
              >
                {saving ? 'Starting…' : 'Start import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function HudlJobRow({ job, teamId }: { job: ImportJob; teamId: string }) {
  const live = LIVE_STATUSES.includes(job.status);
  const progress =
    job.clips_found > 0
      ? Math.round(((job.clips_imported + job.clips_failed) / job.clips_found) * 100)
      : 0;

  async function cancel() {
    await fetch(`/api/integrations/hudl/import?jobId=${job.id}&teamId=${teamId}`, {
      method: 'DELETE',
    });
  }

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-white/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {live ? (
            <Loader2 size={15} className="animate-spin text-[var(--brand-navy)] shrink-0" />
          ) : job.status === 'partial' ? (
            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
          ) : (
            <AlertTriangle size={15} className="text-red-600 shrink-0" />
          )}
          <span className="text-sm font-medium text-[var(--brand-ink)] truncate">
            {job.title || 'Hudl import'}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-[var(--brand-muted)]">
            {job.clips_found > 0
              ? `${job.clips_imported}/${job.clips_found} clips`
              : (job.current_step ?? 'Queued')}
          </span>
          {job.status === 'queued' && (
            <button onClick={cancel} className="text-xs text-[var(--brand-muted)] hover:underline">
              Cancel
            </button>
          )}
        </div>
      </div>

      {live && job.clips_found > 0 && (
        <div className="mt-2 h-1.5 rounded-full bg-[var(--brand-bg)] overflow-hidden">
          <div
            className="h-full bg-[var(--brand-navy)] transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {live && job.current_step && job.clips_found > 0 && (
        <p className="text-[11px] text-[var(--brand-muted)] mt-1.5">{job.current_step}</p>
      )}

      {job.error_message && (
        <p className="text-xs text-amber-700 mt-2">{job.error_message}</p>
      )}

      {job.status === 'partial' && (
        <p className="text-[11px] text-[var(--brand-muted)] mt-1 flex items-center gap-1">
          <CheckCircle2 size={12} className="text-green-600" />
          {job.clips_imported} clip{job.clips_imported === 1 ? '' : 's'} are in your library.
        </p>
      )}
    </div>
  );
}
