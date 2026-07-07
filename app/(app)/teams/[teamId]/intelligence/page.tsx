import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeamById, getRecentAnalysis, getTeamTendencies } from '@/lib/db/queries';
import type { PositionAnalysisResult } from '@/lib/db/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Brain, Zap, Shield, TrendingUp, AlertTriangle, ArrowRight, BookOpen } from 'lucide-react';

type AnalysisWithPlayer = PositionAnalysisResult & {
  players: { first_name: string; last_name: string; primary_position: string } | null
}

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `Intelligence — ${team?.name ?? 'Team'}` };
}

const MODULES = [
  {
    name: 'QBIQ',
    label: 'Quarterback Intelligence',
    icon: Zap,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    desc: 'Mechanics, decision-making, footwork, and film tendency analysis.',
    href: (id: string) => `/teams/${id}/modules/qbiq`,
  },
  {
    name: 'OLIQ',
    label: 'Offensive Line Intelligence',
    icon: Shield,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    desc: 'Unit cohesion, gap assignments, pass protection grading.',
    href: (id: string) => `/teams/${id}/modules/oliq`,
  },
  {
    name: 'TeamIQ',
    label: 'Team Intelligence',
    icon: TrendingUp,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    desc: 'Formation frequencies, scheme tendencies, and opponent scouting.',
    href: (id: string) => `/teams/${id}/modules/teamiq`,
  },
  {
    name: 'MistakeIQ',
    label: 'Error Analysis',
    icon: AlertTriangle,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    desc: 'Turnovers, penalties, missed assignments, and blown coverages.',
    href: (id: string) => `/teams/${id}/modules/mistakeiq`,
  },
  {
    name: 'PlaybookIQ',
    label: 'Playbook Analysis',
    icon: BookOpen,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    desc: 'Upload your playbook. Get strengths, weaknesses, upgrade recommendations, and an install plan.',
    href: (id: string) => `/teams/${id}/modules/playbookiq`,
  },
];

export default async function IntelligencePage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const [team, analyses, tendencies] = await Promise.all([
    getTeamById(teamId),
    getRecentAnalysis(teamId, 10),
    getTeamTendencies(teamId),
  ]);

  if (!team) notFound();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Link
          href={`/teams/${teamId}`}
          className="flex items-center gap-1.5 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors"
        >
          <ArrowLeft size={15} />
          {team.name}
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Intelligence</h1>
        <p className="text-[var(--brand-muted)] text-sm mt-0.5">
          AI-powered analysis modules for {team.name}
        </p>
      </div>

      {/* Module cards */}
      <div className="grid md:grid-cols-2 gap-5 mb-10">
        {MODULES.map((mod) => (
          <Link
            key={mod.name}
            href={mod.href(teamId)}
            className="glass-card p-6 group flex items-start gap-5"
          >
            <div className={`w-12 h-12 rounded-xl ${mod.bg} flex items-center justify-center flex-shrink-0`}>
              <mod.icon size={22} className={mod.color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <h3 className="font-bold text-[var(--brand-ink)] text-lg">{mod.name}</h3>
                <span className="text-xs text-[var(--brand-muted)]">{mod.label}</span>
              </div>
              <p className="text-sm text-[var(--brand-muted)] mt-1 leading-relaxed">{mod.desc}</p>
            </div>
            <ArrowRight
              size={16}
              className="text-[var(--brand-muted)] group-hover:text-[var(--brand-navy)] transition-colors mt-1 flex-shrink-0"
            />
          </Link>
        ))}
      </div>

      {/* Recent analyses */}
      <div className="glass-card p-6 mb-6">
        <h2 className="font-bold text-[var(--brand-navy)] mb-4">Analysis History</h2>
        {analyses.length === 0 ? (
          <div className="text-center py-8">
            <Brain size={32} className="text-[var(--brand-border-strong)] mx-auto mb-3" />
            <p className="text-sm text-[var(--brand-muted)]">
              No analyses yet. Upload film and run a module to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--brand-border)]">
                  <th className="text-left text-xs font-semibold text-[var(--brand-muted)] uppercase tracking-wide py-2 pr-4">Module</th>
                  <th className="text-left text-xs font-semibold text-[var(--brand-muted)] uppercase tracking-wide py-2 pr-4">Player</th>
                  <th className="text-left text-xs font-semibold text-[var(--brand-muted)] uppercase tracking-wide py-2 pr-4">Score</th>
                  <th className="text-left text-xs font-semibold text-[var(--brand-muted)] uppercase tracking-wide py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--brand-border)] last:border-0 hover:bg-[var(--brand-bg)] transition-colors">
                    <td className="py-3 pr-4">
                      <span className="text-sm font-semibold text-[var(--brand-navy)]">
                        {a.module_key?.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-sm text-[var(--brand-muted)]">
                      {(a as AnalysisWithPlayer).players
                        ? `${(a as AnalysisWithPlayer).players!.first_name} ${(a as AnalysisWithPlayer).players!.last_name}`
                        : '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-sm font-bold ${
                        (a.overall_score ?? 0) >= 80
                          ? 'text-emerald-600'
                          : (a.overall_score ?? 0) >= 60
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`}>
                        {a.overall_score ?? '—'}
                      </span>
                    </td>
                    <td className="py-3 text-sm text-[var(--brand-muted)]">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tendencies */}
      {tendencies.length > 0 && (
        <div className="glass-card p-6" id="teamiq">
          <h2 className="font-bold text-[var(--brand-navy)] mb-4">Team Tendencies</h2>
          <div className="space-y-3">
            {tendencies.slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-center gap-4">
                <span className="text-sm font-medium text-[var(--brand-ink)] flex-1">{t.label}</span>
                <div className="flex items-center gap-2 w-32">
                  <div className="flex-1 h-2 bg-[var(--brand-border)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand-navy)] rounded-full"
                      style={{ width: `${Math.round((t.confidence ?? 0) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--brand-muted)] w-8 text-right">
                    {Math.round((t.confidence ?? 0) * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
