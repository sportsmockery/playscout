'use client';

import { useState } from 'react';
import { Zap, Play, ChevronDown, AlertCircle } from 'lucide-react';
import type { Player, Video, PositionAnalysisResult } from '@/lib/db/types';

interface Props {
  teamId: string;
  teamName: string;
  ageGroup?: string;
  qbs: Player[];
  videos: Video[];
  pastAnalyses: PositionAnalysisResult[];
}

interface AnalysisResult {
  overall_score: number;
  mechanics_score: number;
  decision_score: number;
  footwork_score: number;
  release_score: number;
  strengths: string[];
  weaknesses: string[];
  priority_drills: Array<{ drill: string; focus: string; reps: string }>;
  tendency_flags: string[];
  game_situation_notes: string;
  development_plan: string;
}

export default function QBIQClient({ teamId, teamName, ageGroup, qbs, videos, pastAnalyses }: Props) {
  const [selectedQB, setSelectedQB] = useState<Player | null>(qbs[0] ?? null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(videos[0] ?? null);
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');

  async function runAnalysis() {
    if (!selectedQB && !selectedVideo) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/intelligence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'qbiq',
          teamId,
          playerId: selectedQB?.id,
          videoId: selectedVideo?.id,
          context: {
            teamName,
            ageGroup,
            additionalContext: context,
          },
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
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
                Quarterback
              </label>
              {qbs.length === 0 ? (
                <p className="text-xs text-[var(--brand-muted)] bg-amber-50 border border-amber-200 rounded-lg p-2">
                  No QBs on roster. Add players with position QB first.
                </p>
              ) : (
                <div className="relative">
                  <select
                    value={selectedQB?.id ?? ''}
                    onChange={(e) => setSelectedQB(qbs.find((q) => q.id === e.target.value) ?? null)}
                    className={selectClass}
                  >
                    <option value="">Select QB</option>
                    {qbs.map((q) => (
                      <option key={q.id} value={q.id}>
                        #{q.jersey_number} {q.first_name} {q.last_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--brand-muted)] pointer-events-none" />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                Film (optional)
              </label>
              {videos.length === 0 ? (
                <p className="text-xs text-[var(--brand-muted)] bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-lg p-2">
                  No processed film available. Upload film to enable video analysis.
                </p>
              ) : (
                <div className="relative">
                  <select
                    value={selectedVideo?.id ?? ''}
                    onChange={(e) => setSelectedVideo(videos.find((v) => v.id === e.target.value) ?? null)}
                    className={selectClass}
                  >
                    <option value="">No film (text analysis only)</option>
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--brand-muted)] pointer-events-none" />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                Additional Context (optional)
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g. 'Works with shotgun snap, struggles with under-center mechanics'"
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all resize-none placeholder:text-[var(--brand-muted)]"
              />
            </div>

            <button
              onClick={runAnalysis}
              disabled={loading || (!selectedQB && !selectedVideo)}
              className="w-full flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white font-semibold py-3 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap size={16} />
                  Run QBIQ Analysis
                </>
              )}
            </button>
          </div>
        </div>

        {/* Past analyses */}
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
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <Zap size={28} className="text-blue-600 animate-pulse" />
            </div>
            <p className="font-semibold text-[var(--brand-navy)] mb-1">Running QBIQ Analysis</p>
            <p className="text-sm text-[var(--brand-muted)]">
              {selectedVideo ? 'Analyzing film frames with Gemini...' : 'Analyzing with Claude...'}
            </p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-5">
            {/* Score ring */}
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
                  <h2 className="text-xl font-bold text-[var(--brand-navy)]">Overall QBIQ Score</h2>
                  <p className="text-sm text-[var(--brand-muted)] mt-1">
                    {selectedQB ? `${selectedQB.first_name} ${selectedQB.last_name}` : 'Quarterback'}
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {[
                      { label: 'Mechanics', score: result.mechanics_score },
                      { label: 'Decisions', score: result.decision_score },
                      { label: 'Footwork', score: result.footwork_score },
                      { label: 'Release', score: result.release_score },
                    ].map((s) => (
                      <div key={s.label} className="text-xs">
                        <span className="text-[var(--brand-muted)]">{s.label}: </span>
                        <span className="font-semibold text-[var(--brand-ink)]">{s.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {/* Strengths */}
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

              {/* Weaknesses */}
              <div className="glass-card p-5">
                <h3 className="font-bold text-red-500 mb-3 text-sm uppercase tracking-wide">Needs Work</h3>
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

            {/* Priority drills */}
            <div className="glass-card p-5">
              <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Priority Drills</h3>
              <div className="space-y-3">
                {result.priority_drills.map((d, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-[var(--brand-bg)] rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-[var(--brand-navy)] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--brand-ink)]">{d.drill}</p>
                      <p className="text-xs text-[var(--brand-muted)]">{d.focus} · {d.reps}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Development plan */}
            <div className="glass-card p-5">
              <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Development Plan</h3>
              <p className="text-sm text-[var(--brand-ink)] leading-relaxed whitespace-pre-wrap">{result.development_plan}</p>
            </div>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="glass-card p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--brand-navy)]/10 flex items-center justify-center mx-auto mb-4">
              <Zap size={28} className="text-[var(--brand-navy)]" />
            </div>
            <h3 className="font-bold text-[var(--brand-navy)] text-lg mb-2">QBIQ Ready</h3>
            <p className="text-[var(--brand-muted)] text-sm">
              Select a quarterback and optionally attach film, then run the analysis.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
