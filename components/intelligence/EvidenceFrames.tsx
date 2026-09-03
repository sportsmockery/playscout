'use client';

import { useEffect, useState } from 'react';
import { Film, ShieldCheck } from 'lucide-react';

interface Frame {
  frame_index: number;
  url: string;
}

interface Props {
  videoId: string;
  frameIndices: number[];
  confidence?: number;
  /** Why confidence is what it is. A low number a coach can't interrogate is just a decoration. */
  confidenceReasons?: string[];
}

function confidenceLabel(confidence?: number) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const tone =
    confidence >= 0.75 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
    confidence >= 0.5 ? 'text-amber-700 bg-amber-50 border-amber-200' :
    'text-red-700 bg-red-50 border-red-200';
  return { pct, tone };
}

export default function EvidenceFrames({ videoId, frameIndices, confidence, confidenceReasons }: Props) {
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!videoId || frameIndices.length === 0) return;
    let cancelled = false;

    fetch(`/api/videos/${videoId}/frames`)
      .then((res) => res.json())
      .then((data: { frames?: Frame[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setFrames([]);
          return;
        }
        const wanted = new Set(frameIndices);
        setFrames((data.frames ?? []).filter((f) => wanted.has(f.frame_index)));
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load evidence frames.');
          setFrames([]);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, frameIndices.join(',')]);

  const hasFrames = frameIndices.length > 0;
  const hasConfidence = confidence != null || (confidenceReasons?.length ?? 0) > 0;
  // Video-mode analyses cite timestamps, not frames, so there is no strip to
  // draw — but the confidence read still belongs on the report.
  if (!hasFrames && !hasConfidence) return null;

  const badge = confidenceLabel(confidence);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide flex items-center gap-2">
          <Film size={15} />
          {hasFrames ? 'Evidence Frames' : 'Evidence Quality'}
        </h3>
        {badge && (
          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.tone}`}>
            <ShieldCheck size={12} />
            {badge.pct}% confidence
          </span>
        )}
      </div>

      {hasFrames && error && (
        <p className="text-xs text-[var(--brand-muted)]">{error}</p>
      )}

      {hasFrames && frames === null && !error && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {frameIndices.map((i) => (
            <div key={i} className="w-32 h-20 flex-shrink-0 rounded-lg bg-[var(--brand-bg)] animate-pulse" />
          ))}
        </div>
      )}

      {hasFrames && frames && frames.length === 0 && !error && (
        <p className="text-xs text-[var(--brand-muted)]">
          The frames this finding was based on aren&apos;t available anymore.
        </p>
      )}

      {hasFrames && frames && frames.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {frames.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f.frame_index}
              src={f.url}
              alt={`Evidence frame ${f.frame_index + 1}`}
              loading="lazy"
              className="w-32 h-20 flex-shrink-0 object-cover rounded-lg border border-[var(--brand-border)] bg-black"
              title={`Frame ${f.frame_index + 1}`}
            />
          ))}
        </div>
      )}
      {hasFrames && (
        <p className="text-[11px] text-[var(--brand-muted)] mt-2">
          These are the specific frames the analysis above was based on.
        </p>
      )}

      {confidenceReasons && confidenceReasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {confidenceReasons.map((reason, i) => (
            <li key={i} className="text-[11px] text-[var(--brand-muted)]">
              &middot; {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
