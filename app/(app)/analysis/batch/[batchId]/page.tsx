import { getAnalysisBatchById } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Film, Layers, TrendingDown, TrendingUp } from 'lucide-react';
import type { BatchAggregate } from '@/lib/intelligence/aggregate-batch';
import type { BatchSummary } from '@/lib/intelligence/batch-summary';
import ClipBreakdown from './ClipBreakdown';

export async function generateMetadata({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const data = await getAnalysisBatchById(batchId);
  return { title: data ? `${data.batch.module_key} — Combined Report` : 'Combined Report' };
}

type StoredSummary = BatchSummary & { aggregate?: BatchAggregate };

function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-[var(--brand-muted)]';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

export default async function BatchReportPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const data = await getAnalysisBatchById(batchId);
  if (!data) notFound();

  const { batch, jobs, results } = data;
  const teamId = batch.team_id as string;
  const summary = (batch.summary ?? null) as StoredSummary | null;
  const aggregate = summary?.aggregate ?? null;

  const resultById = new Map(results.map((r) => [r.id, r]));
  const commentByVideo = new Map((summary?.per_video ?? []).map((p) => [p.video_id, p.comment]));

  const clips = jobs.map((job) => {
    const v = (job as { videos?: { title?: string } | { title?: string }[] }).videos;
    const video = Array.isArray(v) ? v[0] : v;
    return {
      jobId: job.id as string,
      videoId: job.video_id as string,
      videoTitle: video?.title ?? 'Film',
      status: job.status as string,
      errorMessage: job.error_message as string | null,
      result: job.analysis_result_id ? resultById.get(job.analysis_result_id) ?? null : null,
      comment: commentByVideo.get(job.video_id as string) ?? null,
    };
  });

  const stillRunning = ['queued', 'running'].includes(batch.status as string);
  const completed = clips.filter((c) => c.result).length;

  return (
    <div className="p-6 max-w-4xl mx-auto print:p-0">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href={`/teams/${teamId}/intelligence`}
          className="flex items-center gap-2 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors"
        >
          <ArrowLeft size={16} />
          Intelligence
        </Link>
      </div>

      {/* Header */}
      <div className="glass-card p-6 mb-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-xl bg-[var(--brand-navy)]/10 flex items-center justify-center shrink-0">
            <Layers size={22} className="text-[var(--brand-navy)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--brand-muted)]">
              {batch.module_key} · Combined Report
            </p>
            <h1 className="text-2xl font-bold text-[var(--brand-navy)] leading-tight mt-0.5">
              {summary?.headline ?? batch.title ?? `${clips.length} clips analyzed`}
            </h1>
            <p className="text-sm text-[var(--brand-muted)] mt-1">
              {completed} of {clips.length} clip{clips.length === 1 ? '' : 's'} analyzed
              {aggregate?.averageScore != null && (
                <>
                  {' · '}
                  average <span className={`font-bold ${scoreColor(aggregate.averageScore)}`}>{aggregate.averageScore}</span>
                </>
              )}
              {aggregate?.playsObserved ? ` · ${aggregate.playsObserved} plays observed` : ''}
              {' · '}
              {new Date(batch.created_at as string).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Summary states */}
      {stillRunning && (
        <div className="glass-card p-5 mb-5 flex items-start gap-3 border border-amber-200 bg-amber-50">
          <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Still analyzing</p>
            <p className="text-sm text-amber-800">
              The combined report is written once every clip finishes. Clips already done are
              listed below — this page updates as the rest land.
            </p>
          </div>
        </div>
      )}

      {batch.summary_status === 'failed' && (
        <div className="glass-card p-5 mb-5 flex items-start gap-3 border border-red-200 bg-red-50">
          <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">The combined write-up couldn&apos;t be generated</p>
            <p className="text-sm text-red-700">
              Every clip&apos;s own analysis below is unaffected. {batch.summary_error as string}
            </p>
          </div>
        </div>
      )}

      {batch.summary_status === 'not_applicable' && !stillRunning && (
        <div className="glass-card p-5 mb-5 text-sm text-[var(--brand-muted)]">
          A combined write-up needs at least two analyzed clips — this batch has {completed}.
        </div>
      )}

      {/* Cumulative narrative */}
      {summary && (
        <>
          <div className="glass-card p-6 mb-5">
            <h2 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">
              Across All {completed} Clips
            </h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed whitespace-pre-wrap">
              {summary.cumulative_summary}
            </p>
            {summary.evidence_note && (
              <p className="text-xs text-[var(--brand-muted)] mt-4 pt-4 border-t border-[var(--brand-border)]">
                <span className="font-semibold">How much to trust this: </span>
                {summary.evidence_note}
              </p>
            )}
          </div>

          {summary.what_repeats?.length > 0 && (
            <div className="glass-card p-6 mb-5">
              <h2 className="font-bold text-[var(--brand-navy)] mb-1 text-sm uppercase tracking-wide">
                What Keeps Happening
              </h2>
              <p className="text-[11px] text-[var(--brand-muted)] mb-4">
                Patterns that show up across multiple clips — not one-off reps.
              </p>
              <ul className="space-y-3">
                {summary.what_repeats.map((r, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 text-[11px] font-bold bg-[var(--brand-navy)] text-white rounded-full px-2 py-0.5 mt-0.5">
                      {r.clips_seen} clip{r.clips_seen === 1 ? '' : 's'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--brand-ink)]">{r.pattern}</p>
                      <p className="text-xs text-[var(--brand-muted)] mt-0.5">{r.why_it_matters}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.priorities?.length > 0 && (
            <div className="glass-card p-6 mb-5">
              <h2 className="font-bold text-[var(--brand-navy)] mb-4 text-sm uppercase tracking-wide">
                Fix First
              </h2>
              <ol className="space-y-4">
                {summary.priorities.map((p, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[var(--brand-gold,#d2c600)] text-[var(--brand-ink)] text-xs flex items-center justify-center font-bold shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--brand-ink)]">{p.title}</p>
                      <p className="text-xs text-[var(--brand-muted)] mt-0.5">{p.why}</p>
                      <p className="text-sm text-[var(--brand-ink)] mt-1">{p.fix}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {/* Player rollup — RankerIQ batches */}
      {aggregate?.playerRollup && aggregate.playerRollup.length > 0 && (
        <div className="glass-card p-6 mb-5">
          <h2 className="font-bold text-[var(--brand-navy)] mb-1 text-sm uppercase tracking-wide">
            Player Grades Across The Batch
          </h2>
          <p className="text-[11px] text-[var(--brand-muted)] mb-4">
            Average grade over every rep graded in these clips. More reps means a more reliable number.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--brand-muted)] border-b border-[var(--brand-border)]">
                  <th className="text-left font-semibold py-2">Player</th>
                  <th className="text-left font-semibold py-2">Pos</th>
                  <th className="text-right font-semibold py-2">Reps</th>
                  <th className="text-right font-semibold py-2">Avg</th>
                  <th className="text-right font-semibold py-2">Range</th>
                  <th className="text-right font-semibold py-2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {aggregate.playerRollup.map((p) => (
                  <tr key={p.key} className="border-b border-[var(--brand-border)] last:border-0">
                    <td className="py-2 font-semibold text-[var(--brand-ink)]">{p.identifier}</td>
                    <td className="py-2 text-xs text-[var(--brand-muted)]">{p.positions.join(', ')}</td>
                    <td className="py-2 text-right text-xs text-[var(--brand-muted)]">{p.reps}</td>
                    <td className={`py-2 text-right font-bold ${scoreColor(p.averageGrade)}`}>
                      {p.averageGrade}
                      <span className="text-[10px] font-medium text-[var(--brand-muted)] ml-1">{p.letter}</span>
                    </td>
                    <td className="py-2 text-right text-xs text-[var(--brand-muted)]">
                      {p.worstGrade}–{p.bestGrade}
                    </td>
                    <td className="py-2 text-right text-xs">
                      {p.trend == null ? (
                        <span className="text-[var(--brand-muted)]">—</span>
                      ) : p.trend > 0 ? (
                        <span className="text-emerald-600 inline-flex items-center gap-0.5">
                          <TrendingUp size={11} />+{p.trend}
                        </span>
                      ) : p.trend < 0 ? (
                        <span className="text-red-600 inline-flex items-center gap-0.5">
                          <TrendingDown size={11} />{p.trend}
                        </span>
                      ) : (
                        <span className="text-[var(--brand-muted)]">flat</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recurring items + mistakes */}
      {aggregate && (aggregate.recurringStrengths.length > 0 || aggregate.recurringWeaknesses.length > 0) && (
        <div className="grid md:grid-cols-2 gap-5 mb-5">
          <div className="glass-card p-5">
            <h3 className="font-bold text-emerald-600 mb-3 text-sm uppercase tracking-wide">
              Consistent Strengths
            </h3>
            <ul className="space-y-2">
              {aggregate.recurringStrengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
                  <span className="shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5 mt-0.5">
                    {s.clips}×
                  </span>
                  {s.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass-card p-5">
            <h3 className="font-bold text-red-500 mb-3 text-sm uppercase tracking-wide">
              Recurring Problems
            </h3>
            <ul className="space-y-2">
              {aggregate.recurringWeaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
                  <span className="shrink-0 text-[10px] font-bold text-red-700 bg-red-50 rounded-full px-1.5 py-0.5 mt-0.5">
                    {w.clips}×
                  </span>
                  {w.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {aggregate?.mistakeRollup && aggregate.mistakeRollup.length > 0 && (
        <div className="glass-card p-5 mb-5">
          <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">
            Mistakes By Type
          </h3>
          <div className="flex flex-wrap gap-2">
            {aggregate.mistakeRollup.map((m) => (
              <span
                key={m.category}
                className="text-xs font-medium border border-[var(--brand-border)] rounded-full px-2.5 py-1 text-[var(--brand-ink)]"
              >
                {m.category.replace(/_/g, ' ')} <span className="font-bold">×{m.count}</span>
                <span className="text-[var(--brand-muted)]"> · worst {m.worstSeverity.replace(/_/g, ' ')}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {summary?.practice_focus && summary.practice_focus.length > 0 && (
        <div className="glass-card p-6 mb-5">
          <h2 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">
            This Week&apos;s Practice Focus
          </h2>
          <div className="space-y-3">
            {summary.practice_focus.map((d, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-[var(--brand-bg)] rounded-lg">
                <span className="w-6 h-6 rounded-full bg-[var(--brand-navy)] text-white text-xs flex items-center justify-center font-bold shrink-0">
                  {i + 1}
                </span>
                <p className="text-sm text-[var(--brand-ink)]">{d}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-clip breakdown — every clip on this page, not a separate one */}
      <div className="glass-card p-6">
        <h2 className="font-bold text-[var(--brand-navy)] mb-1 text-sm uppercase tracking-wide">
          Clip By Clip
        </h2>
        <p className="text-[11px] text-[var(--brand-muted)] mb-4">
          Every clip in this batch, with its comment. Open one to read its full analysis.
        </p>

        <ul className="space-y-2">
          {clips.map((clip) => (
            <li key={clip.jobId}>
              {clip.result ? (
                <ClipBreakdown
                  teamId={teamId}
                  videoId={clip.videoId}
                  videoTitle={clip.videoTitle}
                  comment={clip.comment}
                  result={{
                    id: clip.result.id,
                    overall_score: clip.result.overall_score ?? null,
                    summary: clip.result.summary ?? null,
                    strengths: clip.result.strengths ?? [],
                    weaknesses: clip.result.weaknesses ?? [],
                    drills: clip.result.drills ?? [],
                    evidence: clip.result.evidence ?? null,
                  }}
                />
              ) : (
                <div className="rounded-xl border border-[var(--brand-border)] p-3 flex items-center gap-3">
                  {clip.status === 'failed' ? (
                    <AlertCircle size={16} className="text-red-500 shrink-0" />
                  ) : clip.status === 'cancelled' ? (
                    <AlertCircle size={16} className="text-[var(--brand-muted)] shrink-0" />
                  ) : (
                    <Clock size={16} className="text-[var(--brand-muted)] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--brand-ink)] truncate">{clip.videoTitle}</p>
                    <p className="text-xs text-[var(--brand-muted)]">
                      {clip.status === 'failed'
                        ? clip.errorMessage ?? 'Analysis failed'
                        : clip.status === 'cancelled'
                          ? 'Cancelled'
                          : clip.status === 'waiting_for_film'
                            ? 'Waiting for this film to finish processing'
                            : 'Queued'}
                    </p>
                  </div>
                  <Link
                    href={`/teams/${teamId}/film/${clip.videoId}`}
                    className="shrink-0 text-xs font-semibold text-[var(--brand-navy)] hover:underline"
                  >
                    <Film size={13} className="inline mr-1" />
                    Film
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>

        {completed === clips.length && clips.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700 mt-4">
            <CheckCircle2 size={13} />
            All {clips.length} clips analyzed.
          </p>
        )}
      </div>
    </div>
  );
}
