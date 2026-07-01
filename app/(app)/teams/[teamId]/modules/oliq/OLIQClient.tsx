'use client';

import { useState } from 'react';
import { Shield, AlertCircle, ChevronDown } from 'lucide-react';
import type { Player, Video, PositionAnalysisResult } from '@/lib/db/types';

interface Props {
  teamId: string;
  teamName: string;
  ageGroup?: string;
  olPlayers: Player[];
  videos: Video[];
  pastAnalyses: PositionAnalysisResult[];
}

interface OLResult {
  overall_score: number;
  pass_protection_score: number;
  run_blocking_score: number;
  cohesion_score: number;
  gap_assignment_score: number;
  strengths: string[];
  weaknesses: string[];
  priority_drills: Array<{ drill: string; focus: string; reps: string }>;
  unit_notes: string;
  individual_grades: Array<{ position: string; grade: string; note: string }>;
}

export default function OLIQClient({ teamId, teamName, ageGroup, olPlayers, videos, pastAnalyses }: Props) {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(videos[0] ?? null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(olPlayers[0] ?? null);
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OLResult | null>(null);
  const [error, setError] = useState('');

  async function runAnalysis() {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/intelligence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'oliq',
          teamId,
          playerId: selectedPlayer?.id,
          videoId: selectedVideo?.id,
          context: { teamName, ageGroup, additionalContext: context },
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
      {/* Config */}
      <div className="lg:col-span-1 space-y-5">
        <div className="glass-card p-5">
          <h2 className="font-bold text-[var(--brand-navy)] mb-4 text-sm uppercase tracking-wide">
            Configure Analysis
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                Film (recommended)
              </label>
              {videos.length === 0 ? (
                <p className="text-xs text-[var(--brand-muted)] bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-lg p-2">
                  No processed film. Upload film for full OL analysis.
                </p>
              ) : (
                <div className="relative">
                  <select
                    value={selectedVideo?.id ?? ''}
                    onChange={(e) => setSelectedVideo(videos.find((v) => v.id === e.target.value) ?? null)}
                    className={selectClass}
                  >
                    <option value="">No film</option>
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
                Focus Player (optional)
              </label>
              <div className="relative">
                <select
                  value={selectedPlayer?.id ?? ''}
                  onChange={(e) => setSelectedPlayer(olPlayers.find((p) => p.id === e.target.value) ?? null)}
                  className={selectClass}
                >
                  <option value="">Full unit analysis</option>
                  {olPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.jersey_number} {p.first_name} {p.last_name} ({p.primary_position})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--brand-muted)] pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                Context
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g. 'Zone blocking scheme, struggling against 3-4 fronts'"
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] transition-all resize-none placeholder:text-[var(--brand-muted)]"
              />
            </div>

            <button
              onClick={runAnalysis}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-3 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Shield size={16} />
                  Run OLIQ Analysis
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="lg:col-span-2">
        {error && (
          <div className="glass-card p-5 border border-red-200 bg-red-50 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && !result && (
          <div className="glass-card p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Shield size={28} className="text-emerald-600 animate-pulse" />
            </div>
            <p className="font-semibold text-[var(--brand-navy)] mb-1">Running OLIQ Analysis</p>
            <p className="text-sm text-[var(--brand-muted)]">Analyzing offensive line from film...</p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-5">
            {/* Scores */}
            <div className="glass-card p-6">
              <h2 className="font-bold text-[var(--brand-navy)] mb-4">Unit Scores</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Overall', score: result.overall_score },
                  { label: 'Pass Pro', score: result.pass_protection_score },
                  { label: 'Run Block', score: result.run_blocking_score },
                  { label: 'Cohesion', score: result.cohesion_score },
                ].map((s) => (
                  <div key={s.label} className="text-center p-3 bg-[var(--brand-bg)] rounded-xl">
                    <p className={`text-2xl font-bold ${
                      s.score >= 80 ? 'text-emerald-600' :
                      s.score >= 60 ? 'text-amber-600' : 'text-red-600'
                    }`}>{s.score}</p>
                    <p className="text-xs text-[var(--brand-muted)] font-medium mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="glass-card p-5">
                <h3 className="font-bold text-emerald-600 mb-3 text-sm uppercase tracking-wide">Strengths</h3>
                <ul className="space-y-2">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="glass-card p-5">
                <h3 className="font-bold text-red-500 mb-3 text-sm uppercase tracking-wide">Needs Work</h3>
                <ul className="space-y-2">
                  {result.weaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {result.individual_grades?.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Individual Grades</h3>
                <div className="space-y-2">
                  {result.individual_grades.map((g, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-[var(--brand-border)] last:border-0">
                      <span className="font-bold text-[var(--brand-navy)] w-10 text-sm">{g.position}</span>
                      <span className="font-semibold text-[var(--brand-ink)] w-6 text-sm">{g.grade}</span>
                      <span className="text-sm text-[var(--brand-muted)] flex-1">{g.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="glass-card p-5">
              <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Unit Notes</h3>
              <p className="text-sm text-[var(--brand-ink)] leading-relaxed">{result.unit_notes}</p>
            </div>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="glass-card p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Shield size={28} className="text-emerald-600" />
            </div>
            <h3 className="font-bold text-[var(--brand-navy)] text-lg mb-2">OLIQ Ready</h3>
            <p className="text-[var(--brand-muted)] text-sm">
              Select film or a focus player to analyze your offensive line.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
