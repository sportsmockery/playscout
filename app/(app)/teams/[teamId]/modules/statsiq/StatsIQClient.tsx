'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BarChart3, AlertCircle, Layers, Shield, Swords } from 'lucide-react';
import type { Video, PositionAnalysisResult } from '@/lib/db/types';
import type { StatLine, TeamStatTotals } from '@/lib/intelligence/stat-lines';
import type { StatPlay } from '@/lib/intelligence/schemas';
import { positionLabel } from '@/lib/intelligence/positions';
import { playIsNullified } from '@/lib/intelligence/stat-lines';
import BoxScore from '@/components/intelligence/BoxScore';
import StatCorrections from '@/components/intelligence/StatCorrections';
import StatQuestionQueue from '@/components/intelligence/StatQuestionQueue';
import EvidenceFrames from '@/components/intelligence/EvidenceFrames';
import QuickClipUpload from '@/components/intelligence/QuickClipUpload';
import FilmPicker, { isReadyNow, type FilmPickerFolder } from '@/components/intelligence/FilmPicker';
import AnalysisQueue from '@/components/intelligence/AnalysisQueue';
import { queueAnalysisBatch, batchTitle } from '@/components/intelligence/queue-batch';

interface Props {
  teamId: string;
  teamName: string;
  ageGroup?: string;
  homeJerseyColor?: string;
  awayJerseyColor?: string;
  rosterSize: number;
  rosterWithNumbers: number;
  videos: Video[];
  folders: FilmPickerFolder[];
  pastAnalyses: PositionAnalysisResult[];
  initialVideoIds?: string[];
}

interface StatsResult {
  overall_score: number;
  position_scores: {
    ball_tracking: number | null;
    player_attribution: number | null;
    yardage_measurement: number | null;
  };
  reasoning: Record<string, string>;
  stat_lines?: StatLine[];
  team_stats?: TeamStatTotals;
  stat_plays?: StatPlay[];
  stat_warnings?: string[];
  strengths: string[];
  weaknesses: string[];
  summary: string;
  confidence: number;
  plays_observed?: number;
  evidence_frames: number[];
}

type JerseyChoice = 'home' | 'away' | 'unknown';
type SideChoice = 'offense' | 'defense' | 'both' | 'unknown';

const SIDE_OPTIONS: Array<[SideChoice, string]> = [
  ['offense', 'Offense'],
  ['defense', 'Defense'],
  ['both', 'Both'],
  ['unknown', 'Not sure'],
];

const COVERAGE: Array<[keyof StatsResult['position_scores'], string, string]> = [
  ['ball_tracking', 'Ball tracking', 'Could the film be followed from snap to whistle'],
  ['player_attribution', 'Attribution', 'Could players be told apart well enough to credit'],
  ['yardage_measurement', 'Yardage', 'Could gains be measured against the field'],
];

function titleCase(id?: string | null): string {
  if (!id) return '';
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The charting trail: formation, then what happened, then who got credited.
 *
 * This is the part that makes the box score checkable. A coach who disputes a
 * carry can see the play it came from, the formation it was run out of, and
 * the moment in the film it was read at.
 */
function PlayLog({ plays }: { plays: StatPlay[] }) {
  if (!plays.length) return null;
  return (
    <div className="glass-card p-5">
      <h3 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide mb-1">
        Play-By-Play Charting
      </h3>
      <p className="text-[11px] text-[var(--brand-muted)] mb-4">
        Every stat above traces to one of these plays. Formation first, then the positions, then
        what each player did.
      </p>
      <ol className="space-y-3">
        {plays.map((p, i) => {
          const wiped = playIsNullified(p);
          return (
          <li key={i} className="rounded-xl border border-[var(--brand-border)] bg-white/60 p-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-[var(--brand-muted)]">
                PLAY {p.play_index ?? i + 1}
              </span>
              <span className="text-sm font-semibold text-[var(--brand-ink)]">
                {titleCase(p.play_type)} · {titleCase(p.result)}
              </span>
              <span className="text-xs text-[var(--brand-muted)]">
                {p.yards_basis === 'not_determinable'
                  ? 'yardage not measurable on this film'
                  : `${p.yards ?? 0} yd${p.yards_basis === 'coach_breakdown' ? ' (your breakdown)' : ''}`}
              </span>
              {p.penalty_on && p.penalty_on !== 'none' && (
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    wiped ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                  }`}
                  title={
                    wiped
                      ? 'An accepted penalty called this play back, so it produced no statistics.'
                      : 'A flag on this play that did not wipe out its statistics.'
                  }
                >
                  {titleCase(p.penalty_type) || 'Penalty'}
                  {p.penalty_on === 'them' ? ' (on them)' : ''}
                  {p.penalty_enforcement ? ` · ${p.penalty_enforcement}` : ''}
                  {wiped ? ' · no stats' : ''}
                </span>
              )}
            </div>

            <p className="text-xs text-[var(--brand-muted)] mt-1">
              {titleCase(p.offensive_formation)} vs {titleCase(p.defensive_front)}
              {p.formation_note ? ` — ${p.formation_note}` : ''}
            </p>

            {p.credits && p.credits.length > 0 && (
              <ul className={`mt-2 space-y-1 ${wiped ? 'opacity-50 line-through' : ''}`}>
                {p.credits.map((c, j) => (
                  <li key={j} className="text-xs text-[var(--brand-ink)]">
                    <span className="font-semibold">
                      {c.jersey_number ? `#${c.jersey_number} ` : ''}
                      {positionLabel(c.position)}
                    </span>
                    <span className="text-[var(--brand-muted)]"> — {titleCase(c.stat)}</span>
                    {c.yards != null && (c.stat === 'penalty' || p.yards_basis !== 'not_determinable') && (
                      <span className="text-[var(--brand-muted)]"> ({c.yards} yd)</span>
                    )}
                    {c.touchdown && <span className="text-emerald-600 font-semibold"> TD</span>}
                    {c.note && <span className="text-[var(--brand-muted)]"> · {c.note}</span>}
                  </li>
                ))}
              </ul>
            )}
            {wiped && (
              <p className="text-[11px] text-red-700 mt-1.5">
                Called back — nothing on this play was counted.
              </p>
            )}
          </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function StatsIQClient({
  teamId,
  teamName,
  ageGroup,
  homeJerseyColor,
  awayJerseyColor,
  rosterSize,
  rosterWithNumbers,
  videos,
  folders,
  pastAnalyses,
  initialVideoIds,
}: Props) {
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>(initialVideoIds ?? []);
  const [quickClipFrames, setQuickClipFrames] = useState<string[] | null>(null);
  const [jerseyChoice, setJerseyChoice] = useState<JerseyChoice>(
    homeJerseyColor ? 'home' : awayJerseyColor ? 'away' : 'unknown',
  );
  const [sideChoice, setSideChoice] = useState<SideChoice>('unknown');
  const [isScrimmage, setIsScrimmage] = useState(false);
  const [coachNote, setCoachNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StatsResult | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [queued, setQueued] = useState('');
  const [queueVersion, setQueueVersion] = useState(0);
  const [error, setError] = useState('');

  const resolvedJerseyColor =
    jerseyChoice === 'home' ? homeJerseyColor : jerseyChoice === 'away' ? awayJerseyColor : undefined;

  const selectedVideos = videos.filter((v) => selectedVideoIds.includes(v.id));
  const runsInline = !!quickClipFrames || (selectedVideos.length === 1 && isReadyNow(selectedVideos[0]));
  const selectedVideo = selectedVideos.length === 1 ? selectedVideos[0] : null;

  function selectVideos(ids: string[]) {
    setSelectedVideoIds(ids);
    if (ids.length) setQuickClipFrames(null);
  }

  function useQuickClip(frames: string[]) {
    setQuickClipFrames(frames);
    setSelectedVideoIds([]);
  }

  async function runAnalysis() {
    if (!quickClipFrames && selectedVideoIds.length === 0) return;
    setLoading(true);
    setError('');
    setQueued('');

    try {
      const payload = {
        moduleKey: 'STATSIQ',
        teamId,
        coachNote: coachNote || undefined,
        filmConditions: isScrimmage ? 'scrimmage' : 'game',
        team: {
          name: teamName,
          age_group: ageGroup,
          jersey_color: resolvedJerseyColor,
          side_of_ball: sideChoice,
        },
      };

      if (!runsInline) {
        const queuedRes = await queueAnalysisBatch({
          teamId,
          moduleKey: 'STATSIQ',
          videoIds: selectedVideoIds,
          title: batchTitle('STATSIQ', selectedVideoIds.length),
          context: payload,
        });
        setQueued(
          `${queuedRes.queued} clip${queuedRes.queued === 1 ? '' : 's'} queued — the combined box score is written once they all finish.`,
        );
        setQueueVersion((v) => v + 1);
        return;
      }

      setResult(null);
      setAnalysisId(null);
      const res = await fetch('/api/intelligence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          videoId: selectedVideo?.id,
          frames: quickClipFrames ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Charting failed');
      setResult(data.result);
      setAnalysisId(data.analysisId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Charting failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Above everything, because an unanswered question is a stat that is
          missing from the totals — and the coach is the only one who can
          supply it. `queueVersion` also re-fetches it after a batch is
          queued, so newly charted questions appear without a reload. */}
      <StatQuestionQueue
        key={queueVersion}
        teamId={teamId}
        onAnswered={() => setQueueVersion((v) => v + 1)}
      />

      <div className="grid lg:grid-cols-3 gap-6">
      {/* Config panel */}
      <div className="lg:col-span-1 space-y-5">
        <div className="glass-card p-5">
          <h2 className="font-bold text-[var(--brand-navy)] mb-4 text-sm uppercase tracking-wide">
            Configure Charting
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">Film</label>
              <div className="mb-2">
                <FilmPicker
                  videos={videos}
                  folders={folders}
                  value={quickClipFrames ? [] : selectedVideoIds}
                  onChange={selectVideos}
                  disabled={loading}
                />
              </div>
              <QuickClipUpload
                onFramesReady={useQuickClip}
                onClear={() => setQuickClipFrames(null)}
                disabled={loading}
              />
              <p className="text-[11px] text-[var(--brand-muted)] mt-1.5">
                Pick every clip of a game to get one box score for the whole game.
              </p>
            </div>

            {(homeJerseyColor || awayJerseyColor) && (
              <div>
                <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                  Jersey Worn In This Film
                </label>
                <div className="flex gap-2">
                  {(['home', 'away', 'unknown'] as const).map((choice) => (
                    <button
                      key={choice}
                      onClick={() => setJerseyChoice(choice)}
                      className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${
                        jerseyChoice === choice
                          ? 'bg-[var(--brand-navy)] text-white border-[var(--brand-navy)]'
                          : 'border-[var(--brand-border)] text-[var(--brand-muted)] hover:bg-[var(--brand-bg)]'
                      }`}
                    >
                      {choice === 'home' ? 'Home' : choice === 'away' ? 'Away' : 'Not sure'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--brand-muted)] mt-1">
                  Telling the sides apart is what keeps the other team&apos;s stats out of your sheet.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                Which Side Are You On?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SIDE_OPTIONS.map(([choice, label]) => (
                  <button
                    key={choice}
                    onClick={() => setSideChoice(choice)}
                    className={`flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg border transition-colors ${
                      sideChoice === choice
                        ? 'bg-[var(--brand-navy)] text-white border-[var(--brand-navy)]'
                        : 'border-[var(--brand-border)] text-[var(--brand-muted)] hover:bg-[var(--brand-bg)]'
                    }`}
                  >
                    {choice === 'offense' && <Swords size={12} />}
                    {choice === 'defense' && <Shield size={12} />}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isScrimmage}
                  onChange={(e) => setIsScrimmage(e.target.checked)}
                  className="mt-0.5 accent-[var(--brand-navy)]"
                />
                <span>
                  <span className="block text-xs font-medium text-[var(--brand-ink)]">
                    Scrimmage or practice film
                  </span>
                  <span className="block text-[11px] text-[var(--brand-muted)]">
                    Pinnies and borrowed jerseys don&apos;t match the roster, so stats are kept by
                    position only.
                  </span>
                </span>
              </label>
            </div>

            {!isScrimmage &&
              (rosterWithNumbers === 0 ? (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  Numbers legible on the film still get used, but with no roster behind them
                  nothing can catch a misread and they carry no names.{' '}
                  <Link href={`/teams/${teamId}/roster`} className="font-semibold underline">
                    Add jersey numbers
                  </Link>{' '}
                  {rosterSize === 0
                    ? 'and every stat lands on a named player.'
                    : 'to your roster and every stat lands on a named player.'}
                </p>
              ) : (
                <p className="text-[11px] text-[var(--brand-muted)]">
                  Numbers are checked against your {rosterWithNumbers}-player roster. Anything
                  unreadable is credited to the position instead.
                </p>
              ))}

            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                Additional Context (optional)
              </label>
              <textarea
                value={coachNote}
                onChange={(e) => setCoachNote(e.target.value)}
                placeholder="e.g. 'We run out of double wing — 22 and 44 are the wingbacks'"
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all resize-none placeholder:text-[var(--brand-muted)]"
              />
            </div>

            <button
              onClick={runAnalysis}
              disabled={loading || (selectedVideoIds.length === 0 && !quickClipFrames)}
              className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white font-semibold py-3 rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {runsInline ? 'Charting...' : 'Queueing...'}
                </>
              ) : runsInline ? (
                <>
                  <BarChart3 size={16} />
                  Chart This Film
                </>
              ) : (
                <>
                  <Layers size={16} />
                  Chart {selectedVideoIds.length} clip{selectedVideoIds.length === 1 ? '' : 's'}
                </>
              )}
            </button>

            {!runsInline && selectedVideoIds.length > 0 && (
              <p className="text-[11px] text-[var(--brand-muted)] -mt-1">
                Runs in the background — leave this page or close PlayScout and come back for the
                box score.
              </p>
            )}

            {queued && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                {queued}
              </p>
            )}
          </div>
        </div>

        <AnalysisQueue teamId={teamId} moduleKey="STATSIQ" refreshKey={queueVersion} />

        {pastAnalyses.length > 0 && (
          <div className="glass-card p-5">
            <h2 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">
              Past Stat Sheets
            </h2>
            <ul className="space-y-2">
              {pastAnalyses.map((a) => (
                <li key={a.id} className="border-b border-[var(--brand-border)] last:border-0">
                  <Link
                    href={`/analysis/${a.id}`}
                    className="flex items-center justify-between text-sm py-1.5 hover:text-[var(--brand-navy)] transition-colors"
                  >
                    <span className="text-[var(--brand-muted)]">
                      {new Date(a.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-xs text-[var(--brand-muted)]">open</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Results panel */}
      <div className="lg:col-span-2">
        {error && (
          <div className="glass-card p-5 border border-red-200 bg-red-50 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && !result && (
          <div className="glass-card p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
              <BarChart3 size={28} className="text-sky-600 animate-pulse" />
            </div>
            <p className="font-semibold text-[var(--brand-navy)] mb-1">Charting The Film</p>
            <p className="text-sm text-[var(--brand-muted)]">
              Reading the formation, placing every position, then counting what each one did...
            </p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-5">
            {result.stat_lines && result.team_stats && (
              <BoxScore
                lines={result.stat_lines}
                team={result.team_stats}
                warnings={result.stat_warnings}
              />
            )}

            {/* The coach was at the game. A correction here rewrites the
                ledger, so it carries into season totals rather than living
                in this one report. */}
            {analysisId && result.stat_lines && (
              <StatCorrections
                analysisId={analysisId}
                onCorrected={({ lines, team, warnings }) =>
                  setResult((r) =>
                    r ? { ...r, stat_lines: lines, team_stats: team, stat_warnings: warnings } : r,
                  )
                }
              />
            )}

            <div className="glass-card p-5">
              <h3 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide mb-1">
                Charting Coverage — {result.overall_score}/100
              </h3>
              <p className="text-[11px] text-[var(--brand-muted)] mb-3">
                How much of this film could actually be charted. This is a measure of the FILM, not
                of how the team played.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                {COVERAGE.map(([key, label, why]) => (
                  <div
                    key={key}
                    className="rounded-lg bg-[var(--brand-bg)] border border-[var(--brand-border)] p-3"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-[var(--brand-muted)]">{label}</p>
                    <p className="text-lg font-bold text-[var(--brand-navy)] tabular-nums">
                      {result.position_scores?.[key] ?? 'N/A'}
                    </p>
                    <p className="text-[10px] text-[var(--brand-muted)] leading-snug mt-0.5">{why}</p>
                  </div>
                ))}
              </div>
            </div>

            {result.stat_plays && <PlayLog plays={result.stat_plays} />}

            {selectedVideo && (
              <EvidenceFrames
                key={`${selectedVideo.id}-${(result.evidence_frames ?? []).join(',')}`}
                videoId={selectedVideo.id}
                frameIndices={result.evidence_frames ?? []}
                confidence={result.confidence}
              />
            )}

            {result.summary && (
              <div className="glass-card p-5">
                <h3 className="font-bold text-[var(--brand-navy)] mb-2 text-sm uppercase tracking-wide">
                  What The Numbers Showed
                </h3>
                <p className="text-sm text-[var(--brand-ink)] leading-relaxed whitespace-pre-wrap">
                  {result.summary}
                </p>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-5">
              {result.strengths?.length > 0 && (
                <div className="glass-card p-5">
                  <h3 className="font-bold text-emerald-600 mb-3 text-sm uppercase tracking-wide">
                    What Is Working
                  </h3>
                  <ul className="space-y-2">
                    {result.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.weaknesses?.length > 0 && (
                <div className="glass-card p-5">
                  <h3 className="font-bold text-red-500 mb-3 text-sm uppercase tracking-wide">
                    What The Numbers Say Is Not
                  </h3>
                  <ul className="space-y-2">
                    {result.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {analysisId && (
              <p className="text-xs text-[var(--brand-muted)] text-center">
                Saved —{' '}
                <Link href={`/analysis/${analysisId}`} className="text-[var(--brand-navy)] hover:underline">
                  open this stat sheet
                </Link>
              </p>
            )}
          </div>
        )}

        {!result && !loading && !error && (
          <div className="glass-card p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
              <BarChart3 size={28} className="text-sky-600" />
            </div>
            <h3 className="font-bold text-[var(--brand-navy)] text-lg mb-2">StatsIQ Ready</h3>
            <p className="text-[var(--brand-muted)] text-sm max-w-sm mx-auto">
              Pick your film and StatsIQ charts every play — formation, then the positions, then
              carries, yards, catches, tackles, interceptions, penalties and mistakes. A stat goes
              to the jersey number when the film shows one, and to the position when it
              doesn&apos;t.
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
