'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ListOrdered, AlertCircle, Layers, Shield, Swords } from 'lucide-react';
import type { Video, PositionAnalysisResult } from '@/lib/db/types';
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
  /** Drives the "add a roster to grade by player" prompt. */
  rosterSize: number;
  rosterWithNumbers: number;
  videos: Video[];
  folders: FilmPickerFolder[];
  pastAnalyses: PositionAnalysisResult[];
  initialVideoIds?: string[];
}

interface PlayerGrade {
  identifier: string;
  jersey_number: string | null;
  position: string;
  role_on_play: string;
  execution: number;
  difficulty: number;
  impact: string;
  note: string;
  evidence_frames?: number[];
  identification_confidence: number;
  grade: number;
  letter: string;
  rank: number;
  jersey_number_frame?: number | null;
  number_rejected_reason?: string | null;
}

interface RankerResult {
  overall_score: number;
  position_scores: {
    execution_quality: number | null;
    assignment_discipline: number | null;
    effort: number | null;
  };
  reasoning: {
    execution_quality: string;
    assignment_discipline: string;
    effort: string;
  };
  player_grades: PlayerGrade[];
  unit_graded?: string;
  players_not_evaluable?: string;
  strengths: string[];
  weaknesses: string[];
  drills: string[];
  summary: string;
  confidence: number;
  evidence_frames: number[];
}

const DIMENSIONS: Array<[keyof RankerResult['position_scores'], string]> = [
  ['execution_quality', 'Execution Quality'],
  ['assignment_discipline', 'Assignment Discipline'],
  ['effort', 'Effort'],
];

type JerseyChoice = 'home' | 'away' | 'unknown';
type SideChoice = 'offense' | 'defense' | 'both' | 'unknown';

const SIDE_OPTIONS: Array<[SideChoice, string]> = [
  ['offense', 'Offense'],
  ['defense', 'Defense'],
  ['both', 'Figure it out'],
  ['unknown', 'Not sure'],
];

function gradeColor(grade: number): string {
  if (grade >= 87) return 'text-emerald-600';
  if (grade >= 77) return 'text-lime-600';
  if (grade >= 70) return 'text-amber-600';
  if (grade >= 60) return 'text-orange-600';
  return 'text-red-600';
}

function gradeBg(grade: number): string {
  if (grade >= 87) return 'bg-emerald-50 border-emerald-200';
  if (grade >= 77) return 'bg-lime-50 border-lime-200';
  if (grade >= 70) return 'bg-amber-50 border-amber-200';
  if (grade >= 60) return 'bg-orange-50 border-orange-200';
  return 'bg-red-50 border-red-200';
}

const IMPACT_LABEL: Record<string, string> = {
  decisive: 'Decisive',
  high: 'High impact',
  moderate: 'Moderate',
  low: 'Low',
  none: 'Uninvolved',
};

export default function RankerIQClient({
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
  const [result, setResult] = useState<RankerResult | null>(null);
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
        moduleKey: 'RANKERIQ',
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
          moduleKey: 'RANKERIQ',
          videoIds: selectedVideoIds,
          title: batchTitle('RANKERIQ', selectedVideoIds.length),
          context: payload,
        });
        setQueued(`${queuedRes.queued} clip${queuedRes.queued === 1 ? '' : 's'} queued — grades appear below as they finish.`);
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
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data.result);
      setAnalysisId(data.analysisId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  const grades = result?.player_grades ?? [];

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Config panel */}
      <div className="lg:col-span-1 space-y-5">
        <div className="glass-card p-5">
          <h2 className="font-bold text-[var(--brand-navy)] mb-4 text-sm uppercase tracking-wide">
            Configure Analysis
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
                  Telling the sides apart is what keeps grades off the other team&apos;s players.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                Unit To Grade
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
                    Pinnies and practice jerseys don&apos;t match the roster, so players are graded
                    by role instead of by number.
                  </span>
                </span>
              </label>
            </div>

            {!isScrimmage && (
              rosterWithNumbers === 0 ? (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  {rosterSize === 0
                    ? 'No roster on file, so players will be graded by role (Left Guard, Free Safety) rather than by name.'
                    : 'Your roster has no jersey numbers, so players will be graded by role rather than by name.'}{' '}
                  <Link href={`/teams/${teamId}/roster`} className="font-semibold underline">
                    Add jersey numbers
                  </Link>{' '}
                  to grade players individually and build player profiles.
                </p>
              ) : (
                <p className="text-[11px] text-[var(--brand-muted)]">
                  Numbers are checked against your {rosterWithNumbers}-player roster. Anything that
                  doesn&apos;t match is graded by role instead.
                </p>
              )
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                Additional Context (optional)
              </label>
              <textarea
                value={coachNote}
                onChange={(e) => setCoachNote(e.target.value)}
                placeholder="e.g. 'We're running inside zone — grade the front five on their combos'"
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all resize-none placeholder:text-[var(--brand-muted)]"
              />
            </div>

            <button
              onClick={runAnalysis}
              disabled={loading || (selectedVideoIds.length === 0 && !quickClipFrames)}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white font-semibold py-3 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {runsInline ? 'Grading...' : 'Queueing...'}
                </>
              ) : runsInline ? (
                <>
                  <ListOrdered size={16} />
                  Grade This Film
                </>
              ) : (
                <>
                  <Layers size={16} />
                  Queue RankerIQ on {selectedVideoIds.length} clip{selectedVideoIds.length === 1 ? '' : 's'}
                </>
              )}
            </button>

            {!runsInline && selectedVideoIds.length > 0 && (
              <p className="text-[11px] text-[var(--brand-muted)] -mt-1">
                Runs in the background — leave this page or close PlayScout and come back for the grades.
              </p>
            )}

            {queued && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                {queued}
              </p>
            )}
          </div>
        </div>

        <AnalysisQueue teamId={teamId} moduleKey="RANKERIQ" refreshKey={queueVersion} />

        {pastAnalyses.length > 0 && (
          <div className="glass-card p-5">
            <h2 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">
              Past Rankings
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
                    <span className={`font-bold ${gradeColor(a.overall_score ?? 0)}`}>
                      {a.overall_score ?? '—'}
                    </span>
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
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <ListOrdered size={28} className="text-amber-600 animate-pulse" />
            </div>
            <p className="font-semibold text-[var(--brand-navy)] mb-1">Grading Every Player</p>
            <p className="text-sm text-[var(--brand-muted)]">
              Reading each rep — position, execution, difficulty, and value to the play...
            </p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-5">
            {/* Unit summary */}
            <div className="glass-card p-6">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="relative w-24 h-24 flex-shrink-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--brand-border)" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke={result.overall_score >= 80 ? '#10b981' : result.overall_score >= 60 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 42}`}
                      strokeDashoffset={`${2 * Math.PI * 42 * (1 - result.overall_score / 100)}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-[var(--brand-navy)]">{result.overall_score}</span>
                    <span className="text-xs text-[var(--brand-muted)]">unit</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-[var(--brand-navy)]">
                    {grades.length} player{grades.length === 1 ? '' : 's'} graded
                  </h2>
                  <p className="text-sm text-[var(--brand-muted)] mt-1 capitalize">
                    {result.unit_graded && result.unit_graded !== 'unclear'
                      ? `${result.unit_graded.replace('_', ' ')} unit`
                      : 'Unit could not be determined from the film'}
                    {' · '}
                    {Math.round((result.confidence ?? 0) * 100)}% confidence
                  </p>
                  <div className="grid gap-1 mt-3">
                    {DIMENSIONS.map(([key, label]) => (
                      <div key={key} className="text-xs">
                        <span className="text-[var(--brand-muted)]">{label}: </span>
                        <span className="font-semibold text-[var(--brand-ink)]">
                          {result.position_scores[key] ?? 'N/A'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* The ranking */}
            <div className="glass-card p-5">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide">
                  Player Rankings
                </h3>
                <span className="text-[11px] text-[var(--brand-muted)]">Best to worst</span>
              </div>
              <p className="text-[11px] text-[var(--brand-muted)] mb-4">
                Grade blends execution with how hard the job was and how much the rep mattered.
                Baseline 70 = did the job. Players are named by jersey number only when the digits
                were actually readable on this film and match your roster — otherwise they&apos;re
                graded by role.
              </p>

              {grades.length === 0 ? (
                <p className="text-sm text-[var(--brand-muted)] bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-lg p-3">
                  No players could be graded from this film — usually the camera is too wide or the
                  two teams can&apos;t be told apart. Try a tighter clip, or set the jersey color above.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {grades.map((g) => (
                    <li
                      key={`${g.rank}-${g.identifier}`}
                      className={`rounded-xl border p-3 ${gradeBg(g.grade)}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center w-10 shrink-0">
                          <span className={`text-xl font-bold leading-none ${gradeColor(g.grade)}`}>
                            {g.grade}
                          </span>
                          <span className="text-[10px] font-semibold text-[var(--brand-muted)] mt-0.5">
                            {g.letter}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-[10px] font-bold text-[var(--brand-muted)]">
                              #{g.rank}
                            </span>
                            <span className="font-semibold text-[var(--brand-ink)] text-sm">
                              {g.identifier}
                            </span>
                            <span className="text-xs text-[var(--brand-muted)]">{g.position}</span>
                            {g.number_rejected_reason ? (
                              <span
                                className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full"
                                title={`A jersey number was reported but discarded: ${g.number_rejected_reason}`}
                              >
                                graded by role
                              </span>
                            ) : (
                              g.identification_confidence < 0.5 && (
                                <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                                  uncertain ID
                                </span>
                              )
                            )}
                          </div>

                          <p className="text-xs text-[var(--brand-muted)] mt-0.5">{g.role_on_play}</p>
                          <p className="text-sm text-[var(--brand-ink)] mt-1.5 leading-snug">{g.note}</p>

                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className="text-[10px] font-medium bg-white/70 border border-[var(--brand-border)] px-1.5 py-0.5 rounded-full text-[var(--brand-muted)]">
                              Execution {g.execution}
                            </span>
                            <span className="text-[10px] font-medium bg-white/70 border border-[var(--brand-border)] px-1.5 py-0.5 rounded-full text-[var(--brand-muted)]">
                              Difficulty {g.difficulty}/5
                            </span>
                            <span className="text-[10px] font-medium bg-white/70 border border-[var(--brand-border)] px-1.5 py-0.5 rounded-full text-[var(--brand-muted)]">
                              {IMPACT_LABEL[g.impact] ?? g.impact}
                            </span>
                            {g.evidence_frames && g.evidence_frames.length > 0 && (
                              <span className="text-[10px] font-medium bg-white/70 border border-[var(--brand-border)] px-1.5 py-0.5 rounded-full text-[var(--brand-muted)]">
                                Frames {g.evidence_frames.join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {result.players_not_evaluable && (
                <p className="text-xs text-[var(--brand-muted)] mt-3 pt-3 border-t border-[var(--brand-border)]">
                  <span className="font-semibold">Not graded: </span>
                  {result.players_not_evaluable}
                </p>
              )}
            </div>

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
                  Unit Summary
                </h3>
                <p className="text-sm text-[var(--brand-ink)] leading-relaxed whitespace-pre-wrap">
                  {result.summary}
                </p>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-5">
              <div className="glass-card p-5">
                <h3 className="font-bold text-emerald-600 mb-3 text-sm uppercase tracking-wide">
                  Unit Strengths
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

              <div className="glass-card p-5">
                <h3 className="font-bold text-red-500 mb-3 text-sm uppercase tracking-wide">
                  Needs Work
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
            </div>

            {result.drills.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">
                  Priority Drills
                </h3>
                <div className="space-y-3">
                  {result.drills.map((d, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-[var(--brand-bg)] rounded-lg">
                      <span className="w-6 h-6 rounded-full bg-[var(--brand-navy)] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                        {i + 1}
                      </span>
                      <p className="text-sm text-[var(--brand-ink)]">{d}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysisId && (
              <p className="text-xs text-[var(--brand-muted)] text-center">
                Saved —{' '}
                <Link href={`/analysis/${analysisId}`} className="text-[var(--brand-navy)] hover:underline">
                  open this report
                </Link>
              </p>
            )}
          </div>
        )}

        {!result && !loading && !error && (
          <div className="glass-card p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <ListOrdered size={28} className="text-amber-600" />
            </div>
            <h3 className="font-bold text-[var(--brand-navy)] text-lg mb-2">RankerIQ Ready</h3>
            <p className="text-[var(--brand-muted)] text-sm max-w-sm mx-auto">
              Pick film and RankerIQ grades every player on your unit — position, execution,
              difficulty of the job, and what the rep was worth to the play — ranked best to worst
              with the reason for each grade.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
