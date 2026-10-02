'use client';

import { useCallback, useEffect, useState } from 'react';
import { HelpCircle, CheckCircle2, SkipForward, AlertCircle, XCircle } from 'lucide-react';
import {
  OFFENSIVE_POSITIONS,
  DEFENSIVE_POSITIONS,
  POSITION_LABELS,
  type StatPosition,
} from '@/lib/intelligence/positions';

/**
 * The questions StatsIQ could not answer from the film, asked one at a time.
 *
 * The design constraint is volume: a charted game produces these in a batch,
 * and a coach will answer forty in a sitting or none at all. So it is one
 * question on screen, the likely answers as buttons, number keys bound to
 * them, and no Save — each answer commits and advances. Anything that costs a
 * scroll or a modal per item turns forty answers into four.
 *
 * Skipping is a first-class outcome. A coach who genuinely does not remember
 * should leave the stat on no player's line rather than be pushed into a guess,
 * which is the same mistake the model was making. A skipped stat still counts
 * in the TEAM totals (see stat-lines.ts), and the copy says so.
 *
 * "Didn't happen" is the other exit: the question itself can be wrong — a kick
 * charted as a touchdown run — and no answer about WHO fixes a WHAT. It removes
 * the credit and keeps the coach's description of the real play.
 */

export interface StatQuestion {
  id: string;
  analysisId: string | null;
  videoTitle: string;
  playIndex: number;
  side: 'offense' | 'defense';
  stat: string;
  yards: number | null;
  touchdown: boolean;
  note: string | null;
  question: string | null;
  candidates: string[];
  evidenceTimestamps: number[];
}

function titleCase(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function whatHappened(q: StatQuestion): string {
  const bits = [titleCase(q.stat)];
  if (q.yards != null) bits.push(`${q.yards} yd`);
  if (q.touchdown) bits.push('touchdown');
  return bits.join(' · ');
}

export default function StatQuestionQueue({
  teamId,
  onAnswered,
}: {
  teamId: string;
  /** Fires after each answer, so a sheet on the same page can refresh. */
  onAnswered?: () => void;
}) {
  const [questions, setQuestions] = useState<StatQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}/stat-questions`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load the queue.');
        if (!cancelled) setQuestions(data.questions ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the queue.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const current = questions?.[index] ?? null;

  // A question can be wrong at its root — the film showed a kick and StatsIQ
  // charted a touchdown run. Naming a player would put a play that never
  // happened on a child's line, so the coach can strike it and say what it was.
  const [striking, setStriking] = useState(false);
  const [whatHappenedText, setWhatHappenedText] = useState('');
  const [removed, setRemoved] = useState(0);

  const submit = useCallback(
    async (patch: { position_id: string } | { remove: true; what_happened?: string }) => {
      if (!current?.analysisId || busy) return;
      setBusy(true);
      setError('');
      try {
        const res = await fetch(`/api/intelligence/analysis/${current.analysisId}/stat-credits`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patches: { [current.id]: patch } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not save that answer.');
        if ('remove' in patch) setRemoved((n) => n + 1);
        else setAnswered((n) => n + 1);
        setStriking(false);
        setWhatHappenedText('');
        setIndex((i) => i + 1);
        onAnswered?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save that answer.');
      } finally {
        setBusy(false);
      }
    },
    [current, busy, onAnswered],
  );

  const answer = useCallback((positionId: string) => submit({ position_id: positionId }), [submit]);

  const strike = useCallback(() => {
    const text = whatHappenedText.trim();
    return submit(text ? { remove: true, what_happened: text } : { remove: true });
  }, [submit, whatHappenedText]);

  const skip = useCallback(() => {
    setStriking(false);
    setWhatHappenedText('');
    setIndex((i) => i + 1);
  }, []);

  // Number keys pick a candidate, S skips, D says it didn't happen. Forty
  // questions is a lot of mousing.
  useEffect(() => {
    if (!current) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= (current?.candidates.length ?? 0)) {
        e.preventDefault();
        answer(current!.candidates[n - 1]);
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        skip();
      } else if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setStriking(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, answer, skip]);

  if (!questions || (questions.length === 0 && answered === 0 && removed === 0)) return null;

  const remaining = questions.length - index;
  const skipped = questions.length - answered - removed;

  if (!current) {
    return (
      <div className="glass-card p-5 border border-emerald-200 bg-emerald-50/60">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              {answered > 0
                ? `${answered} stat${answered === 1 ? '' : 's'} attributed`
                : 'Nothing left to answer'}
              {removed > 0 && ` · ${removed} removed`}
            </p>
            <p className="text-sm text-emerald-800">
              {answered > 0
                ? 'Those are on players’ lines now, in this report and in the season totals.'
                : 'Every charted stat has a player on it.'}
              {removed > 0 && ' Stats you said didn’t happen are out of every total.'}
              {skipped > 0 &&
                ` ${skipped} skipped — they stay in the team totals, on no player’s line, until someone says who it was.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const options = current.side === 'offense' ? OFFENSIVE_POSITIONS : DEFENSIVE_POSITIONS;

  return (
    <div className="glass-card p-5 border border-amber-200 bg-amber-50/50">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h3 className="flex items-center gap-1.5 font-bold text-amber-900 text-sm uppercase tracking-wide">
          <HelpCircle size={15} />
          StatsIQ needs your call
        </h3>
        <span className="text-[11px] text-amber-800">
          {remaining} left{answered > 0 ? ` · ${answered} answered` : ''}
          {removed > 0 ? ` · ${removed} removed` : ''}
        </span>
      </div>
      <p className="text-[11px] text-amber-800 mb-4">
        These are stats StatsIQ charted but could not attribute. Each one counts in the team totals
        and on no player&apos;s line until you say who it was. If the play never happened the way
        it&apos;s described, choose &quot;Didn&apos;t happen&quot; and it comes out of every total.
      </p>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="rounded-xl bg-white border border-[var(--brand-border)] p-4">
        <p className="text-[11px] text-[var(--brand-muted)]">
          {current.videoTitle} · Play {current.playIndex}
          {current.evidenceTimestamps.length > 0 && ` · at ${current.evidenceTimestamps[0]}s`}
        </p>
        <p className="text-base font-semibold text-[var(--brand-ink)] mt-1">
          {current.question ?? 'Which player should this go to?'}
        </p>
        <p className="text-sm text-[var(--brand-muted)] mt-0.5">{whatHappened(current)}</p>
        {current.note && (
          <p className="text-xs text-[var(--brand-muted)] mt-2 leading-snug">{current.note}</p>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          {current.candidates.map((c, i) => (
            <button
              key={c}
              onClick={() => answer(c)}
              disabled={busy}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--brand-navy)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              <span className="text-[10px] opacity-70 border border-white/40 rounded px-1">
                {i + 1}
              </span>
              {POSITION_LABELS[c as StatPosition] ?? c}
            </button>
          ))}

          <select
            disabled={busy}
            defaultValue=""
            onChange={(e) => e.target.value && answer(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)]"
          >
            <option value="" disabled>
              {current.candidates.length ? 'Someone else…' : 'Pick a position…'}
            </option>
            {options.map((id) => (
              <option key={id} value={id}>
                {POSITION_LABELS[id as StatPosition]}
              </option>
            ))}
          </select>

          <button
            onClick={skip}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--brand-border)] text-sm text-[var(--brand-muted)] hover:bg-[var(--brand-bg)] transition-colors"
          >
            <SkipForward size={13} />
            <span className="text-[10px] border border-[var(--brand-border)] rounded px-1">S</span>
            Don&apos;t remember
          </button>

          <button
            onClick={() => setStriking((s) => !s)}
            disabled={busy}
            aria-expanded={striking}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-sm text-red-700 hover:bg-red-50 transition-colors"
          >
            <XCircle size={13} />
            <span className="text-[10px] border border-red-200 rounded px-1">D</span>
            Didn&apos;t happen
          </button>
        </div>

        {striking && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              strike();
            }}
            className="mt-3 rounded-lg border border-red-200 bg-red-50/60 p-3"
          >
            <label
              htmlFor="stat-what-happened"
              className="block text-xs font-semibold text-red-900 mb-1.5"
            >
              What actually happened on this play? (optional)
            </label>
            <input
              id="stat-what-happened"
              autoFocus
              value={whatHappenedText}
              onChange={(e) => setWhatHappenedText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setStriking(false);
              }}
              maxLength={280}
              placeholder="e.g. Extra point kick — no run, no touchdown"
              className="w-full px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)]"
            />
            <p className="text-[10px] text-red-800 mt-1.5">
              Removes this {whatHappened(current).toLowerCase()} from the team totals and every
              player&apos;s line. Your note is saved with the correction.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="submit"
                disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-red-700 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              >
                Remove stat
              </button>
              <button
                type="button"
                onClick={() => setStriking(false)}
                className="px-3 py-1.5 rounded-lg border border-[var(--brand-border)] text-sm text-[var(--brand-muted)] hover:bg-white"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <p className="text-[10px] text-[var(--brand-muted)] mt-3">
          Press a number to answer, S to skip, D if it didn&apos;t happen. Skipping keeps the stat
          in the team totals but off every player&apos;s line.
        </p>
      </div>
    </div>
  );
}
