'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TrendingUp, AlertCircle, ChevronDown, Target } from 'lucide-react';
import type { Video, PositionAnalysisResult } from '@/lib/db/types';
import EvidenceFrames from '@/components/intelligence/EvidenceFrames';
import QuickClipUpload from '@/components/intelligence/QuickClipUpload';
import AnalysisCorrections from '@/components/intelligence/AnalysisCorrections';

interface Props {
  teamId: string;
  teamName: string;
  ageGroup?: string;
  offensiveStyle?: string;
  defensiveStyle?: string;
  homeJerseyColor?: string;
  awayJerseyColor?: string;
  videos: Video[];
  pastAnalyses: PositionAnalysisResult[];
  initialVideoId?: string;
}

interface TeamIQTendency {
  tendency_type: string;
  label: string;
  rate: number | null;
  confidence: number;
  sample_size: number;
  description: string;
}

interface TeamIQFormation {
  name: string;
  side?: string;
  note?: string;
}

interface TeamIQExplosivePlay {
  cause: string;
  description: string;
  evidence_frames?: number[];
}

interface TeamIQSituationalTell {
  situation: string;
  tell: string;
  confidence?: number;
}

interface TeamIQResult {
  overall_score: number;
  position_scores: {
    execution_consistency: number | null;
  };
  reasoning: {
    execution_consistency: string;
  };
  offensive_tendencies: TeamIQTendency[];
  defensive_tendencies: TeamIQTendency[];
  formations: TeamIQFormation[];
  explosive_plays: TeamIQExplosivePlay[];
  situational_tells: TeamIQSituationalTell[];
  attack_points: string[];
  strengths: string[];
  weaknesses: string[];
  drills: string[];
  summary: string;
  confidence: number;
  evidence_frames: number[];
  plays_observed?: number;
}

const DIMENSIONS: Array<[keyof TeamIQResult['position_scores'], string]> = [
  ['execution_consistency', 'Execution Consistency'],
];

type JerseyChoice = 'home' | 'away' | 'unknown';
type SideChoice = 'offense' | 'defense' | 'both' | 'unknown';

const SIDE_OPTIONS: Array<[SideChoice, string]> = [
  ['offense', 'Offense'],
  ['defense', 'Defense'],
  ['both', 'Both'],
  ['unknown', 'Not sure'],
];

function TendencyPanel({ title, tendencies }: { title: string; tendencies: TeamIQTendency[] }) {
  return (
    <div className="glass-card p-5">
      <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">{title}</h3>
      <ul className="space-y-3">
        {tendencies.map((t, i) => (
          <li key={i} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[var(--brand-ink)]">{t.label}</span>
              {typeof t.rate === 'number' && (
                <span className="text-xs font-bold text-purple-600">{Math.round(t.rate * 100)}%</span>
              )}
            </div>
            <p className="text-xs text-[var(--brand-muted)] mt-0.5">{t.description}</p>
            <p className="text-xs text-[var(--brand-muted)] mt-0.5">
              Confidence: {Math.round(t.confidence * 100)}% · Sample: {t.sample_size} {t.sample_size === 1 ? 'play' : 'plays'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TeamIQClient({
  teamId,
  teamName,
  ageGroup,
  offensiveStyle,
  defensiveStyle,
  homeJerseyColor,
  awayJerseyColor,
  videos,
  pastAnalyses,
  initialVideoId,
}: Props) {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(
    (initialVideoId ? videos.find((v) => v.id === initialVideoId) : null) ?? videos[0] ?? null,
  );
  const [quickClipFrames, setQuickClipFrames] = useState<string[] | null>(null);
  const [jerseyChoice, setJerseyChoice] = useState<JerseyChoice>(
    homeJerseyColor ? 'home' : awayJerseyColor ? 'away' : 'unknown'
  );
  const [sideChoice, setSideChoice] = useState<SideChoice>('unknown');
  const [coachNote, setCoachNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TeamIQResult | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const resolvedJerseyColor =
    jerseyChoice === 'home' ? homeJerseyColor : jerseyChoice === 'away' ? awayJerseyColor : undefined;

  function selectVideo(video: Video | null) {
    setSelectedVideo(video);
    if (video) setQuickClipFrames(null);
  }

  function useQuickClip(frames: string[]) {
    setQuickClipFrames(frames);
    setSelectedVideo(null);
  }

  async function runAnalysis() {
    if (!selectedVideo && !quickClipFrames) return;
    setLoading(true);
    setError('');
    setResult(null);
    setAnalysisId(null);

    try {
      const res = await fetch('/api/intelligence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleKey: 'TEAMIQ',
          teamId,
          videoId: selectedVideo?.id,
          frames: quickClipFrames ?? undefined,
          coachNote: coachNote || undefined,
          team: {
            name: teamName,
            age_group: ageGroup,
            offensive_style: offensiveStyle,
            defensive_style: defensiveStyle,
            jersey_color: resolvedJerseyColor,
            side_of_ball: sideChoice,
          },
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

  const selectClass =
    'w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all appearance-none';

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
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                Film
              </label>
              {videos.length === 0 ? (
                <p className="text-xs text-[var(--brand-muted)] bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-lg p-2 mb-2">
                  No processed film yet. Upload game film and wait for it to finish processing, or use a quick clip below.
                </p>
              ) : (
                <div className="relative mb-2">
                  <select
                    value={quickClipFrames ? '' : selectedVideo?.id ?? ''}
                    onChange={(e) => selectVideo(videos.find((v) => v.id === e.target.value) ?? null)}
                    className={selectClass}
                  >
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--brand-muted)] pointer-events-none" />
                </div>
              )}
              <QuickClipUpload
                onFramesReady={useQuickClip}
                onClear={() => setQuickClipFrames(null)}
                disabled={loading}
              />
            </div>

            {homeJerseyColor || awayJerseyColor ? (
              <div>
                <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                  Jersey Worn In This Clip
                </label>
                <div className="flex gap-2">
                  {(['home', 'away', 'unknown'] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setJerseyChoice(choice)}
                      className={`flex-1 px-2 py-2 rounded-lg border text-xs font-semibold capitalize transition-colors ${
                        jerseyChoice === choice
                          ? 'bg-[var(--brand-navy)] text-white border-[var(--brand-navy)]'
                          : 'bg-white text-[var(--brand-muted)] border-[var(--brand-border)] hover:border-[var(--brand-navy)]'
                      }`}
                    >
                      {choice === 'unknown' ? 'Not sure' : choice}
                    </button>
                  ))}
                </div>
                {resolvedJerseyColor && (
                  <p className="text-xs text-[var(--brand-muted)] mt-1.5">
                    Identifying by: {resolvedJerseyColor}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                No jersey/helmet color is set for this team, so the AI can&apos;t reliably tell your players apart from the opponent. Mention it below (e.g. &quot;we wear white jerseys, navy helmets&quot;) until a team-settings page exists to save it permanently.
              </p>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                {teamName} Is On (This Clip)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {SIDE_OPTIONS.map(([choice, label]) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setSideChoice(choice)}
                    className={`px-2 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                      sideChoice === choice
                        ? 'bg-[var(--brand-navy)] text-white border-[var(--brand-navy)]'
                        : 'bg-white text-[var(--brand-muted)] border-[var(--brand-border)] hover:border-[var(--brand-navy)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--brand-muted)] mt-1.5">
                Which side of the ball to grade, so the AI analyzes {teamName} and not the opponent.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                Coach Note (optional)
              </label>
              <textarea
                value={coachNote}
                onChange={(e) => setCoachNote(e.target.value)}
                placeholder="e.g. 'We wear white jerseys, navy helmets — this is our opponent's film, what should we prepare for?'"
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all resize-none placeholder:text-[var(--brand-muted)]"
              />
            </div>

            <button
              onClick={runAnalysis}
              disabled={loading || (!selectedVideo && !quickClipFrames)}
              className="w-full flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white font-semibold py-3 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <TrendingUp size={16} />
                  Run TeamIQ Analysis
                </>
              )}
            </button>
          </div>
        </div>

        {pastAnalyses.length > 0 && (
          <div className="glass-card p-5">
            <h2 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">
              Past Analyses
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
                    <span className={`font-bold ${
                      (a.overall_score ?? 0) >= 80 ? 'text-emerald-600' :
                      (a.overall_score ?? 0) >= 60 ? 'text-amber-600' : 'text-red-600'
                    }`}>
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
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
              <TrendingUp size={28} className="text-purple-600 animate-pulse" />
            </div>
            <p className="font-semibold text-[var(--brand-navy)] mb-1">Running TeamIQ Analysis</p>
            <p className="text-sm text-[var(--brand-muted)]">Studying formations and tendencies from film...</p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-5">
            <AnalysisCorrections
              analysisId={analysisId}
              result={result}
              dimensions={DIMENSIONS}
              onSaved={(patch) =>
                setResult((prev) =>
                  prev
                    ? {
                        ...prev,
                        ...patch,
                        position_scores: { ...prev.position_scores, ...(patch.position_scores as Partial<TeamIQResult['position_scores']> | undefined) },
                      }
                    : prev
                )
              }
            />

            <div className="glass-card p-6">
              <div className="flex items-center gap-6">
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
                    <span className="text-xs text-[var(--brand-muted)]">/ 100</span>
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[var(--brand-navy)]">Team Intelligence Score</h2>
                  <p className="text-sm text-[var(--brand-muted)] mt-1">{teamName}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="inline-flex items-center rounded-full bg-[var(--brand-bg)] border border-[var(--brand-border)] px-2 py-0.5 text-xs font-medium text-[var(--brand-ink)]">
                      Sample: {result.plays_observed ?? '—'} {result.plays_observed === 1 ? 'play' : 'plays'}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-[var(--brand-bg)] border border-[var(--brand-border)] px-2 py-0.5 text-xs font-medium text-[var(--brand-ink)]">
                      Confidence: {Math.round((result.confidence ?? 0) * 100)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1 mt-3">
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

              {((result.plays_observed ?? 0) <= 1 || (result.confidence ?? 1) < 0.5) && (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    {result.plays_observed === 1
                      ? 'This score reflects a single play, not a season tendency. Treat it as a one-snap read — run more film for a reliable team grade.'
                      : 'Low-confidence read from limited film. Scores may not reflect true tendencies yet — analyze more plays to firm them up.'}
                  </p>
                </div>
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
                <h3 className="font-bold text-[var(--brand-navy)] mb-2 text-sm uppercase tracking-wide">Summary</h3>
                <p className="text-sm text-[var(--brand-ink)] leading-relaxed whitespace-pre-wrap">{result.summary}</p>
              </div>
            )}

            {(result.offensive_tendencies?.length > 0 || result.defensive_tendencies?.length > 0) && (
              <div className="grid md:grid-cols-2 gap-5">
                {result.offensive_tendencies?.length > 0 && (
                  <TendencyPanel title="Offensive Tendencies" tendencies={result.offensive_tendencies} />
                )}
                {result.defensive_tendencies?.length > 0 && (
                  <TendencyPanel title="Defensive Tendencies" tendencies={result.defensive_tendencies} />
                )}
              </div>
            )}

            {result.formations?.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Formations Observed</h3>
                <div className="flex flex-wrap gap-2">
                  {result.formations.map((f, i) => (
                    <span key={i} className="inline-flex flex-col rounded-lg bg-[var(--brand-bg)] border border-[var(--brand-border)] px-3 py-2">
                      <span className="text-sm font-semibold text-[var(--brand-ink)]">
                        {f.name}{f.side ? ` (${f.side})` : ''}
                      </span>
                      {f.note && <span className="text-xs text-[var(--brand-muted)] mt-0.5">{f.note}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.explosive_plays?.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Explosive Play Causes</h3>
                <ul className="space-y-3">
                  {result.explosive_plays.map((p, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-semibold text-[var(--brand-ink)]">{p.cause}: </span>
                      <span className="text-[var(--brand-ink)]">{p.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.situational_tells?.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Situational Tells</h3>
                <ul className="space-y-2">
                  {result.situational_tells.map((t, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-semibold text-[var(--brand-ink)]">{t.situation}: </span>
                      <span className="text-[var(--brand-ink)]">{t.tell}</span>
                      {typeof t.confidence === 'number' && (
                        <span className="text-xs text-[var(--brand-muted)]"> ({Math.round(t.confidence * 100)}% confidence)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.attack_points?.length > 0 && (
              <div className="glass-card p-5 border border-[var(--brand-gold)]/40">
                <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
                  <Target size={16} className="text-[var(--brand-gold)]" />
                  What To Attack
                </h3>
                <ul className="space-y-2">
                  {result.attack_points.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-gold)] flex-shrink-0 mt-1.5" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3">
              {DIMENSIONS.map(([key, label]) => (
                <div key={key} className="glass-card p-5">
                  <p className="text-purple-600 text-xs font-bold uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-sm text-[var(--brand-ink)] leading-relaxed">{result.reasoning[key]}</p>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="glass-card p-5">
                <h3 className="font-bold text-emerald-600 mb-3 text-sm uppercase tracking-wide">Strengths</h3>
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
                <h3 className="font-bold text-red-500 mb-3 text-sm uppercase tracking-wide">Weaknesses to Attack</h3>
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
                <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Recommended Fixes</h3>
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
          </div>
        )}

        {!result && !loading && !error && (
          <div className="glass-card p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
              <TrendingUp size={28} className="text-purple-600" />
            </div>
            <h3 className="font-bold text-[var(--brand-navy)] text-lg mb-2">TeamIQ Ready</h3>
            <p className="text-[var(--brand-muted)] text-sm">
              Select processed film to analyze formations, tendencies, and scheme.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
