'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, X } from 'lucide-react';
import { validateRemoteVideoUrl } from '@/lib/video/remote-source';

interface Props {
  teamId: string;
  /** Folders the film can be filed into. */
  folders?: { id: string; name: string }[];
  /** Folder the coach is currently browsing — pre-selected as the destination. */
  defaultFolderId?: string;
  /** Tags the film film_type='opponent' for this opponent (ScoutIQ). */
  opponentId?: string;
}

/**
 * Registers film that already lives somewhere else — a school server, a
 * Drive/S3 link, a signed export — instead of re-uploading it.
 *
 * The same validator the API and worker use runs here on every keystroke, so
 * a coach pasting a YouTube or Hudl watch page is told why it won't work (and
 * what to paste instead) before they hit the button, not after.
 */
export default function AddFilmLinkButton({ teamId, folders, defaultFolderId, opponentId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState(defaultFolderId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const check = url.trim() ? validateRemoteVideoUrl(url) : null;
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
      const res = await fetch('/api/videos/from-link', {
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
      if (!res.ok) throw new Error(data.error || 'Could not add film from that link.');
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add film from that link.');
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg border border-[var(--brand-border)] text-[var(--brand-ink)] hover:bg-[var(--brand-bg)] transition-colors"
      >
        <Link2 size={16} />
        Add from Link
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-[var(--brand-navy)] text-lg">Add Film From a Link</h2>
              <button onClick={reset} className="p-1 text-[var(--brand-muted)] hover:text-[var(--brand-ink)]">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-[var(--brand-muted)] mb-4">
              Paste a direct link to a film file you&apos;re allowed to use — your school&apos;s server, a
              Drive or S3 link, or an export from your own film account. PlayScout fetches it in the
              background and extracts frames; the file stays where it is.
            </p>

            <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">Film link</label>
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://films.yourschool.org/week3-vs-wildcats.mp4"
              className="w-full px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] mb-1"
            />
            {linkProblem && <p className="text-xs text-amber-700 mb-2">{linkProblem}</p>}

            <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5 mt-3">
              Title (optional)
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Taken from the file name if left blank"
              className="w-full px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
            />

            {folders && folders.length > 0 && (
              <>
                <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5 mt-3">
                  File into
                </label>
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
                >
                  <option value="">No folder (unfiled)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </>
            )}

            {error && (
              <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-5">
              <button
                type="button"
                onClick={reset}
                className="flex-1 py-2.5 rounded-lg border border-[var(--brand-border)] text-sm font-semibold text-[var(--brand-muted)] hover:bg-[var(--brand-bg)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!check?.ok || saving}
                className="flex-1 flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white font-semibold py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-50"
              >
                <Link2 size={15} />
                {saving ? 'Adding…' : 'Add Film'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
