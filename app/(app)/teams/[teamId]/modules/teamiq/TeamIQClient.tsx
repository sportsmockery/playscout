'use client';

import { useState } from 'react';
import { TrendingUp, AlertCircle, ChevronDown } from 'lucide-react';
import type { Video, PositionAnalysisResult } from '@/lib/db/types';

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
}

interface TeamIQResult {
  overall_score: number;
  position_scores: {
    offensive_tendency: number | null;
    defensive_tendency: number | null;
    execution_consistency: number | null;
  };
  reasoning: {
    offensive_tendency: string;
    defensive_tendency: string;
    execution_consistency: string;
  };
  strengths: string[];
  weaknesses: string[];
  drills: string[];
  summary: string;
  confidence: number;
}

const DIMENSIONS: Array<[keyof TeamIQResult['position_scores'], string]> = [
  ['offensive_tendency', 'Offensive Tendency'],
  ['defensive_tendency', 'Defensive Tendency'],
  ['execution_consistency', 'Execution Consistency'],
];

type JerseyChoice = 'home' | 'away' | 'unknown';

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
}: Props) {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(videos[0] ?? null);
  const [jerseyChoice, setJerseyChoice] = useState<JerseyChoice>(
    homeJerseyColor ? 'home' : awayJerseyColor ? 'away' : 'unknown'
  );
  const [coachNote, setCoachNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TeamIQResult | null>(null);
  const [error, setError] = useState('');

  const resolvedJerseyColor =
    jerseyChoice === 'home' ? homeJerseyColor : jerseyChoice === 'away' ? awayJerseyColor : undefined;

  async function runAnalysis() {
    if (!selectedVideo) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/intelligence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleKey: 'TEAMIQ',
          teamId,
          videoId: selectedVideo.id,
          coachNote: coachNote || undefined,
          team: {
            name: teamName,
            age_group: ageGroup,
            offensive_style: offensiveStyle,
            defensive_style: defensiveStyle,
            jersey_color: resolvedJerseyColor,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data.result);
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
                <p className="text-xs text-[var(--brand-muted)] bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-lg p-2">
                  No processed film yet. Upload game film and wait for it to finish processing.
                </p>
              ) : (
                <div className="relative">
                  <select
                    value={selectedVideo?.id ?? ''}
                    onChange={(e) => setSelectedVideo(videos.find((v) => v.id === e.target.value) ?? null)}
                    className={selectClass}
                  >
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--brand-muted)] pointer-events-none" />
                </div>
              )}
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
              disabled={loading || !selectedVideo}
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
                <li key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b border-[var(--brand-border)] last:border-0">
                  <span className="text-[var(--brand-muted)]">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                  <span className={`font-bold ${
                    (a.overall_score ?? 0) >= 80 ? 'text-emerald-600' :
                    (a.overall_score ?? 0) >= 60 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {a.overall_score ?? '—'}
                  </span>
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
            </div>

            {result.summary && (
              <div className="glass-card p-5">
                <h3 className="font-bold text-[var(--brand-navy)] mb-2 text-sm uppercase tracking-wide">Summary</h3>
                <p className="text-sm text-[var(--brand-ink)] leading-relaxed whitespace-pre-wrap">{result.summary}</p>
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
