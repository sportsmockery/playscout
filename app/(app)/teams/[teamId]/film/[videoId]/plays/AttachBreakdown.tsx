'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardPaste, Check, AlertTriangle } from 'lucide-react';

/**
 * Attaches a Hudl breakdown export to this film.
 *
 * A preview always comes first. Rows pair with clips by order, and order goes
 * wrong in ways only the coach can see — a play that never got filmed, a
 * camera cut that isn't a play — so the pairing is shown and confirmed rather
 * than applied on trust.
 */

interface MatchedRow {
  sequenceId: string;
  sequenceNumber: number;
  summary: string;
}

interface Preview {
  applied: boolean;
  rowsRead: number;
  clipsInFilm: number;
  matched: MatchedRow[];
  unmatchedRows: number;
  unmatchedClips: number[];
  attached?: number;
  failedClips?: number[];
}

export default function AttachBreakdown({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (apply: boolean) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/import/hudl/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, text, apply }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not read that breakdown.');
        setPreview(null);
        return;
      }
      setPreview(data);
      if (apply) router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-semibold text-[var(--brand-navy)] border border-[var(--brand-border)] rounded-lg px-3 py-2 hover:bg-[var(--brand-bg)] transition-colors"
      >
        <ClipboardPaste size={15} />
        Attach Hudl breakdown
      </button>
    );
  }

  const mismatch = preview && preview.rowsRead !== preview.clipsInFilm;

  return (
    <div className="glass-card p-5">
      <h3 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide mb-2">
        Attach Hudl breakdown
      </h3>
      <p className="text-xs text-[var(--brand-muted)] mb-3">
        In Hudl, open the playlist&apos;s details and choose <strong>Export Data</strong> with all
        fields selected. Paste the spreadsheet here, header row included. Down, distance, formation
        and the play call then become facts the analysis is told, instead of things it has to guess
        from the film.
      </p>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        rows={6}
        spellCheck={false}
        placeholder={'PLAY #\tODK\tDN\tDIST\tHASH\tOFF FORM\tOFF PLAY\tGN/LS\n1\tO\t1\t10\tL\tTight Double Wing\tPower Right\t6'}
        className="w-full rounded-lg border border-[var(--brand-border)] bg-white p-3 text-xs font-mono resize-y"
      />

      {error && (
        <p className="flex items-start gap-2 text-xs text-red-700 mt-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      {preview && (
        <div className="mt-3">
          <p className="text-xs text-[var(--brand-ink)]">
            {preview.rowsRead} {preview.rowsRead === 1 ? 'row' : 'rows'} read ·{' '}
            {preview.clipsInFilm} {preview.clipsInFilm === 1 ? 'clip' : 'clips'} in this film
            {preview.applied && ` · ${preview.attached} attached`}
          </p>

          {mismatch && !preview.applied && (
            <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              These don&apos;t line up. Rows pair with clips in order, so check the first and last
              few below before attaching — usually it means a play wasn&apos;t filmed, or a camera
              cut got detected as a play.
            </p>
          )}

          <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-[var(--brand-border)]">
            {preview.matched.map((m) => (
              <li key={m.sequenceId} className="py-1.5 flex gap-3 text-xs">
                <span className="shrink-0 w-14 font-mono text-[var(--brand-muted)] tabular-nums">
                  Clip {m.sequenceNumber}
                </span>
                <span className="text-[var(--brand-ink)]">{m.summary}</span>
              </li>
            ))}
          </ul>

          {preview.unmatchedRows > 0 && !preview.applied && (
            <p className="text-xs text-[var(--brand-muted)] mt-2">
              {preview.unmatchedRows} row{preview.unmatchedRows === 1 ? '' : 's'} at the end will be
              left off — there are no clips for them.
            </p>
          )}
          {preview.unmatchedClips.length > 0 && !preview.applied && (
            <p className="text-xs text-[var(--brand-muted)] mt-1">
              Clip{preview.unmatchedClips.length === 1 ? '' : 's'}{' '}
              {preview.unmatchedClips.join(', ')} will keep whatever they already have.
            </p>
          )}

          {preview.applied && (
            <p className="flex items-center gap-2 text-xs text-emerald-700 mt-2">
              <Check size={14} />
              Attached. Every analysis of these plays now gets the situation as recorded.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        {!preview?.applied && (
          <>
            <button
              type="button"
              disabled={!text.trim() || busy}
              onClick={() => send(false)}
              className="text-sm font-semibold border border-[var(--brand-border)] rounded-lg px-3 py-2 hover:bg-[var(--brand-bg)] disabled:opacity-40 transition-colors"
            >
              {busy && !preview ? 'Reading…' : 'Preview'}
            </button>
            <button
              type="button"
              disabled={!preview || busy}
              onClick={() => send(true)}
              className="text-sm font-semibold rounded-lg px-3 py-2 bg-[var(--brand-navy)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {busy && preview ? 'Attaching…' : 'Attach to these clips'}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPreview(null);
            setError('');
          }}
          className="text-sm text-[var(--brand-muted)] px-3 py-2 hover:text-[var(--brand-navy)] transition-colors"
        >
          {preview?.applied ? 'Done' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
