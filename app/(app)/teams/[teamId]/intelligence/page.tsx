import { getTeamById, getRecentAnalysis, getTeamTendencies } from '@/lib/db/queries';
import type { PositionAnalysisResult } from '@/lib/db/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Brain, Zap, Gauge, Shield, TrendingUp, AlertTriangle, ArrowRight, BookOpen, Crosshair, ListOrdered } from 'lucide-react';
import AnalysisQueue from '@/components/intelligence/AnalysisQueue';
import CoachJobCards from '@/components/intelligence/CoachJobCards';

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
    desc: 'Is my quarterback’s throwing motion, footwork and decision-making sound?',
    href: (id: string) => `/teams/${id}/modules/qbiq`,
  },
  {
    name: 'RBIQ',
    label: 'Running Back Intelligence',
    icon: Gauge,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    desc: 'Does my back see the hole, protect the ball, and finish runs?',
    href: (id: string) => `/teams/${id}/modules/rbiq`,
  },
  {
    name: 'OLIQ',
    label: 'Offensive Line Intelligence',
    icon: Shield,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    desc: 'Is my line blocking the right man, with the right feet and pad level?',
    href: (id: string) => `/teams/${id}/modules/oliq`,
  },
  {
    name: 'TeamIQ',
    label: 'Team Intelligence',
    icon: TrendingUp,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    desc: 'What are we actually doing on film, and what have we become predictable at?',
    href: (id: string) => `/teams/${id}/modules/teamiq`,
  },
  {
    name: 'MistakeIQ',
    label: 'Error Analysis',
    icon: AlertTriangle,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    desc: 'What keeps costing us — missed assignments, bad angles, penalties?',
    href: (id: string) => `/teams/${id}/modules/mistakeiq`,
  },
  {
    name: 'RankerIQ',
    label: 'Player Ranking Intelligence',
    icon: ListOrdered,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    desc: 'Who played well and who needs work — every player graded, with the reason.',
    href: (id: string) => `/teams/${id}/modules/rankeriq`,
  },
  {
    name: 'ScoutIQ',
    label: 'Opponent Scout Intelligence',
    icon: Crosshair,
    color: 'text-red-600',
    bg: 'bg-red-50',
    desc: 'Who are we playing, and how do we attack them?',
    href: (id: string) => `/teams/${id}/modules/scoutiq`,
  },
  {
    name: 'PlaybookIQ',
    label: 'Playbook Analysis',
    icon: BookOpen,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    desc: 'Is my playbook right for this team, and what should I install next?',
    href: (id: string) => `/teams/${id}/modules/playbookiq`,
  },
];

export default async function IntelligencePage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ videoIds?: string; folderId?: string }>;
}) {
  const { teamId } = await params;
  const { videoIds, folderId } = await searchParams;
  const [team, analyses, tendencies] = await Promise.all([
    getTeamById(teamId),
    getRecentAnalysis(teamId, 10),
    getTeamTendencies(teamId),
  ]);

  if (!team) notFound();

  // A coach who picked film in the library and hit "Analyze" lands here to
  // choose a module — carry their selection through so the module screen
  // opens with it already selected instead of making them pick twice.
  const filmParams = new URLSearchParams();
  if (videoIds) filmParams.set('videoIds', videoIds);
  if (folderId) filmParams.set('folderId', folderId);
  const filmQuery = filmParams.toString();
  const withFilm = (href: string) => (filmQuery ? `${href}?${filmQuery}` : href);
  const selectionCount = videoIds ? videoIds.split(',').filter(Boolean).length : 0;

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
          What the film says about {team.name}, and about who you play next
        </p>
      </div>

      {/* The two jobs come before the eight tools. A coach arriving here with
          film selected already knows what they want to do with it; a coach
          arriving cold does not, and a grid of modules does not tell them. */}
      {selectionCount === 0 && !folderId && (
        <div className="mb-10">
          <h2 className="font-bold text-[var(--brand-navy)] mb-1">Start here</h2>
          <p className="text-sm text-[var(--brand-muted)] mb-4">
            The two things film is for. Everything below is a more specific version of one of them.
          </p>
          <CoachJobCards teamId={teamId} />
        </div>
      )}

      {(selectionCount > 0 || folderId) && (
        <div className="mb-5 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm text-[var(--brand-ink)]">
          <span className="font-semibold">
            {selectionCount > 0
              ? `${selectionCount} clip${selectionCount === 1 ? '' : 's'} selected`
              : 'Folder selected'}
          </span>{' '}
          — pick a module to analyze {selectionCount === 1 ? 'it' : 'them'}.
        </div>
      )}

      {/* Module cards */}
      <h2 className="font-bold text-[var(--brand-navy)] mb-1">Every tool</h2>
      <p className="text-sm text-[var(--brand-muted)] mb-4">
        Each answers a different question. You do not need them all.
      </p>
      <div className="grid md:grid-cols-2 gap-5 mb-10">
        {MODULES.map((mod) => (
          <Link
            key={mod.name}
            href={withFilm(mod.href(teamId))}
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

      {/* Anything still running, across every module — so "Analysis History"
          is the whole picture and not just the finished half. */}
      <div className="mb-6">
        <AnalysisQueue teamId={teamId} />
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
                  <tr key={a.id} className="border-b border-[var(--brand-border)] last:border-0 hover:bg-[var(--brand-bg)] transition-colors cursor-pointer">
                    <td className="py-3 pr-4">
                      <Link href={`/analysis/${a.id}`} className="block text-sm font-semibold text-[var(--brand-navy)]">
                        {a.module_key?.toUpperCase()}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-sm text-[var(--brand-muted)]">
                      <Link href={`/analysis/${a.id}`} className="block">
                        {(a as AnalysisWithPlayer).players
                          ? `${(a as AnalysisWithPlayer).players!.first_name} ${(a as AnalysisWithPlayer).players!.last_name}`
                          : '—'}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <Link href={`/analysis/${a.id}`} className={`block text-sm font-bold ${
                        (a.overall_score ?? 0) >= 80
                          ? 'text-emerald-600'
                          : (a.overall_score ?? 0) >= 60
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`}>
                        {a.overall_score ?? '—'}
                      </Link>
                    </td>
                    <td className="py-3 text-sm text-[var(--brand-muted)]">
                      <Link href={`/analysis/${a.id}`} className="block">
                        {new Date(a.created_at).toLocaleDateString()}
                      </Link>
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
