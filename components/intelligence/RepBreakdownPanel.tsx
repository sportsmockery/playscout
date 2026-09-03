'use client';

import { useRef, useState } from 'react';
import { Clapperboard, EyeOff, Target, MessageSquareQuote } from 'lucide-react';

/**
 * Renders the per-rep film breakdown.
 *
 * The point of the panel is that a coach can click any observation and watch
 * the moment it came from. That is what turns "his front foot lands closed"
 * from an assertion into something they can check in two seconds — and it is
 * why every observation is required to carry an anchor in the first place.
 */

export interface PhaseRead {
  phase: string;
  at_seconds?: number | null;
  at_frame?: number | null;
  observed: string;
  verdict?: string | null;
}
export interface CueNote {
  cue: string;
  dimension: string;
  verdict: string;
  visible_marker: string;
  at_seconds?: number | null;
  at_frame?: number | null;
}
export interface NotEvaluable {
  cue: string;
  dimension: string;
  why: string;
}
export interface RepBreakdown {
  phases?: PhaseRead[];
  cue_notes?: CueNote[];
  not_evaluable?: NotEvaluable[];
  key_moment?: { at_seconds?: number | null; at_frame?: number | null; why_it_decided_the_rep: string } | null;
  coaching_point?: string;
}

interface Props {
  breakdown: RepBreakdown;
  /** Signed URL for the clip. When present, anchors become seek buttons. */
  videoSrc?: string | null;
  /** Seconds into the source file where this play starts, for film holding many plays. */
  playStartSeconds?: number;
}

const VERDICT_TONE: Record<string, string> = {
  elite: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  above_standard: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  at_standard: 'bg-slate-100 text-slate-700 border-slate-300',
  below_standard: 'bg-amber-50 text-amber-800 border-amber-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};

const label = (s: string) => s.replace(/_/g, ' ');

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** An anchor is a button only when there is film behind it to seek. */
function Anchor({
  at,
  frame,
  seekable,
  active,
  onSeek,
}: {
  at?: number | null;
  frame?: number | null;
  seekable: boolean;
  active: number | null;
  onSeek: (seconds: number) => void;
}) {
  if (at == null && frame == null) return null;
  const text = at != null ? formatTime(at) : `frame ${frame}`;

  if (at == null || !seekable) {
    return (
      <span className="shrink-0 font-mono text-[11px] text-[var(--brand-muted)] tabular-nums">{text}</span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSeek(at)}
      aria-label={`Play the film at ${text}`}
      className={`shrink-0 font-mono text-[11px] tabular-nums rounded px-1.5 py-0.5 border transition-colors ${
        active === at
          ? 'bg-[var(--brand-navy)] text-white border-[var(--brand-navy)]'
          : 'border-[var(--brand-border)] text-[var(--brand-navy)] hover:bg-[var(--brand-bg)]'
      }`}
    >
      {text}
    </button>
  );
}

export default function RepBreakdownPanel({ breakdown, videoSrc, playStartSeconds = 0 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const phases = breakdown.phases ?? [];
  const notes = breakdown.cue_notes ?? [];
  const notEvaluable = breakdown.not_evaluable ?? [];
  if (!phases.length && !notes.length && !notEvaluable.length && !breakdown.coaching_point) {
    return null;
  }

  const seek = (seconds: number) => {
    const el = videoRef.current;
    if (!el) return;
    // Breakdown times are measured from the start of the clip the model was
    // shown, which is not the start of the file when the film holds many plays.
    el.currentTime = playStartSeconds + seconds;
    void el.play().catch(() => {});
    setActive(seconds);
  };

  const anchor = (at?: number | null, frame?: number | null) => (
    <Anchor at={at} frame={frame} seekable={!!videoSrc} active={active} onSeek={seek} />
  );

  const byDimension = notes.reduce<Record<string, CueNote[]>>((acc, note) => {
    (acc[note.dimension] ??= []).push(note);
    return acc;
  }, {});

  return (
    <div className="glass-card p-5 mb-5 print:border print:shadow-none">
      <h3 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide flex items-center gap-2 mb-4">
        <Clapperboard size={15} />
        Rep Breakdown
      </h3>

      {videoSrc && (
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          playsInline
          preload="metadata"
          className="w-full rounded-lg bg-black mb-4 print:hidden"
        />
      )}

      {phases.length > 0 && (
        <ol className="mb-5 space-y-2">
          {phases.map((p, i) => (
            <li key={`${p.phase}-${i}`} className="flex gap-3 items-start text-sm">
              {anchor(p.at_seconds, p.at_frame)}
              <span className="shrink-0 w-20 text-xs font-semibold uppercase tracking-wide text-[var(--brand-navy)] pt-0.5">
                {label(p.phase)}
              </span>
              <span className="text-[var(--brand-ink)] leading-relaxed">{p.observed}</span>
            </li>
          ))}
        </ol>
      )}

      {Object.entries(byDimension).map(([dimension, cues]) => (
        <div key={dimension} className="mb-4">
          <p className="text-[var(--brand-navy)] text-xs font-bold uppercase tracking-wide mb-2">
            {label(dimension)}
          </p>
          <ul className="space-y-2">
            {cues.map((c, i) => (
              <li key={`${c.cue}-${i}`} className="flex gap-3 items-start text-sm">
                {anchor(c.at_seconds, c.at_frame)}
                <span
                  className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                    VERDICT_TONE[c.verdict] ?? VERDICT_TONE.at_standard
                  }`}
                >
                  {label(c.verdict)}
                </span>
                <span className="text-[var(--brand-ink)] leading-relaxed">
                  <span className="font-medium">{label(c.cue)}</span>
                  {' — '}
                  {c.visible_marker}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {breakdown.key_moment && (
        <div className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] p-3 mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--brand-navy)] flex items-center gap-2 mb-1">
            <Target size={13} />
            The moment it turned
          </p>
          <div className="flex gap-3 items-start text-sm">
            {anchor(breakdown.key_moment.at_seconds, breakdown.key_moment.at_frame)}
            <span className="text-[var(--brand-ink)] leading-relaxed">
              {breakdown.key_moment.why_it_decided_the_rep}
            </span>
          </div>
        </div>
      )}

      {breakdown.coaching_point && (
        <div className="rounded-lg border border-[var(--brand-gold)] bg-amber-50/60 p-3 mb-4 gold-glow">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--brand-navy)] flex items-center gap-2 mb-1">
            <MessageSquareQuote size={13} />
            Say this to the player
          </p>
          <p className="text-sm text-[var(--brand-ink)] leading-relaxed">{breakdown.coaching_point}</p>
        </div>
      )}

      {notEvaluable.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-[var(--brand-muted)] flex items-center gap-2">
            <EyeOff size={13} />
            Couldn&apos;t grade from this angle ({notEvaluable.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {notEvaluable.map((n, i) => (
              <li key={`${n.cue}-${i}`} className="text-[var(--brand-muted)] text-xs leading-relaxed">
                <span className="font-medium text-[var(--brand-ink)]">{label(n.cue)}</span> — {n.why}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-[var(--brand-muted)] mt-2">
            These weren&apos;t judged either way. A wider or tighter angle next game would cover them.
          </p>
        </details>
      )}
    </div>
  );
}
