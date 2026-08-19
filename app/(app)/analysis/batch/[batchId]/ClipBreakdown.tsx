'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Film } from 'lucide-react';
import EvidenceFrames from '@/components/intelligence/EvidenceFrames';
import type { Json } from '@/lib/db/types';

interface PlayerGradeShape {
  identifier: string;
  position?: string;
  grade?: number;
  letter?: string;
  note: string;
  rank?: number;
  number_rejected_reason?: string | null;
}

interface EvidenceShape {
  frames?: number[];
  confidence?: number;
  player_grades?: PlayerGradeShape[] | null;
  mistakes?: { title: string; category: string; severity: string; description?: string }[] | null;
}

interface Props {
  teamId: string;
  videoId: string;
  videoTitle: string;
  /** The batch-level one-liner on this specific clip. */
  comment: string | null;
  result: {
    id: string;
    overall_score: number | null;
    summary: string | null;
    strengths: string[];
    weaknesses: string[];
    drills: string[];
    evidence: Json | null;
  };
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-[var(--brand-muted)]';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

/**
 * One clip inside the combined report. Collapsed it shows the score and the
 * batch's comment on this clip; expanded it shows that clip's full analysis
 * inline.
 *
 * Deliberately not a link to a separate report page — a coach reviewing a
 * game wants the whole session in one place, and bouncing through forty tabs
 * is what this page exists to replace. The per-clip report still has its own
 * URL for sharing or printing; it just isn't the default way in.
 */
export default function ClipBreakdown({ teamId, videoId, videoTitle, comment, result }: Props) {
  const [open, setOpen] = useState(false);
  const evidence = (result.evidence ?? {}) as EvidenceShape;
  const grades = evidence.player_grades ?? [];
  const mistakes = evidence.mistakes ?? [];

  return (
    <div className="rounded-xl border border-[var(--brand-border)] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-[var(--brand-bg)] transition-colors"
        aria-expanded={open}
      >
        <span className="shrink-0 mt-0.5 text-[var(--brand-muted)]">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>

        <span className={`shrink-0 text-lg font-bold w-9 text-center ${scoreColor(result.overall_score)}`}>
          {result.overall_score ?? '—'}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--brand-ink)] truncate">{videoTitle}</span>
          {comment ? (
            <span className="block text-xs text-[var(--brand-ink)] mt-0.5 leading-snug">{comment}</span>
          ) : (
            result.summary && (
              <span className="block text-xs text-[var(--brand-muted)] mt-0.5 line-clamp-1">
                {result.summary}
              </span>
            )
          )}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-4 pt-1 border-t border-[var(--brand-border)] space-y-4">
          {result.summary && (
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed whitespace-pre-wrap pt-3">
              {result.summary}
            </p>
          )}

          {grades.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-[var(--brand-muted)] mb-2">
                Player grades in this clip
              </h4>
              <ul className="space-y-1.5">
                {grades.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className={`font-bold w-7 shrink-0 ${scoreColor(g.grade ?? null)}`}>
                      {g.grade ?? '—'}
                    </span>
                    <span className="font-semibold text-[var(--brand-ink)] shrink-0">
                      {g.identifier}
                      {g.position ? <span className="text-[var(--brand-muted)]"> {g.position}</span> : null}
                      {g.number_rejected_reason && (
                        <span
                          className="ml-1 text-[10px] font-normal text-[var(--brand-muted)]"
                          title={`A jersey number was reported but discarded: ${g.number_rejected_reason}`}
                        >
                          (by role)
                        </span>
                      )}
                    </span>
                    <span className="text-[var(--brand-muted)] min-w-0">{g.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mistakes.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-[var(--brand-muted)] mb-2">
                Mistakes in this clip
              </h4>
              <ul className="space-y-1.5">
                {mistakes.map((m, i) => (
                  <li key={i} className="text-xs">
                    <span className="font-semibold text-[var(--brand-ink)]">{m.title}</span>
                    <span className="text-[var(--brand-muted)]">
                      {' '}
                      · {m.category.replace(/_/g, ' ')} · {m.severity.replace(/_/g, ' ')}
                    </span>
                    {m.description && <p className="text-[var(--brand-muted)] mt-0.5">{m.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(result.strengths.length > 0 || result.weaknesses.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-4">
              {result.strengths.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 mb-1.5">
                    Strengths
                  </h4>
                  <ul className="space-y-1">
                    {result.strengths.map((s, i) => (
                      <li key={i} className="text-xs text-[var(--brand-ink)]">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.weaknesses.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-red-500 mb-1.5">
                    Needs work
                  </h4>
                  <ul className="space-y-1">
                    {result.weaknesses.map((w, i) => (
                      <li key={i} className="text-xs text-[var(--brand-ink)]">• {w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {evidence.frames && evidence.frames.length > 0 && (
            <EvidenceFrames
              videoId={videoId}
              frameIndices={evidence.frames}
              confidence={evidence.confidence}
            />
          )}

          <div className="flex items-center gap-4 pt-1">
            <Link
              href={`/teams/${teamId}/film/${videoId}`}
              className="text-xs font-semibold text-[var(--brand-navy)] hover:underline inline-flex items-center gap-1"
            >
              <Film size={12} />
              Watch this clip
            </Link>
            <Link
              href={`/analysis/${result.id}`}
              className="text-xs font-semibold text-[var(--brand-muted)] hover:text-[var(--brand-navy)] hover:underline"
            >
              Open this clip&apos;s own report
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
