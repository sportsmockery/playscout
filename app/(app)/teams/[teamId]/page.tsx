import { getTeamById, getPlayersByTeam, getVideosByTeam, getRecentAnalysis } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Users, Film, Brain, ArrowRight, Plus, Zap, Settings } from 'lucide-react';
import CoachJobCards from '@/components/intelligence/CoachJobCards';
import { MODULE_COPY } from '@/lib/coach-jobs';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: team?.name ?? 'Team' };
}

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  const [team, players, videos, analyses] = await Promise.all([
    getTeamById(teamId),
    getPlayersByTeam(teamId),
    getVideosByTeam(teamId),
    getRecentAnalysis(teamId, 3),
  ]);

  if (!team) notFound();

  const quickLinks = [
    { label: 'Roster', href: `/teams/${teamId}/roster`, icon: Users, desc: `${players.length} players` },
    { label: 'Film Library', href: `/teams/${teamId}/film`, icon: Film, desc: `${videos.length} videos` },
    { label: 'Intelligence', href: `/teams/${teamId}/intelligence`, icon: Brain, desc: 'Run analyses' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-[var(--brand-navy)] flex items-center justify-center text-[var(--brand-gold)] font-bold text-2xl">
            {team.name?.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--brand-navy)]">{team.name}</h1>
            <p className="text-[var(--brand-muted)] text-sm">
              {[team.age_group, team.season, team.league].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/teams/${teamId}/settings`}
            className="flex items-center gap-2 bg-white border border-[var(--brand-border)] text-[var(--brand-ink)] text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[var(--brand-bg)] transition-colors"
          >
            <Settings size={16} />
            Settings
          </Link>
          <Link
            href={`/teams/${teamId}/roster`}
            className="flex items-center gap-2 bg-[var(--brand-navy)] text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors"
          >
            <Plus size={16} />
            Add Player
          </Link>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {quickLinks.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="glass-card p-6 group flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-xl bg-[var(--brand-navy)]/10 flex items-center justify-center">
              <link.icon size={22} className="text-[var(--brand-navy)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[var(--brand-ink)]">{link.label}</p>
              <p className="text-sm text-[var(--brand-muted)]">{link.desc}</p>
            </div>
            <ArrowRight
              size={16}
              className="text-[var(--brand-muted)] group-hover:text-[var(--brand-navy)] transition-colors"
            />
          </Link>
        ))}
      </div>

      {/* What a coach came here to do. This was a grid of eight acronyms with
          a lightning bolt each and no description — you had to already know
          the taxonomy to get anywhere. The modules are still all here, one
          section down. */}
      <div className="mb-8">
        <h2 className="font-bold text-[var(--brand-navy)] mb-1">Start here</h2>
        <p className="text-sm text-[var(--brand-muted)] mb-4">
          The two things film is for. Pick one — PlayScout walks you through the rest.
        </p>
        <CoachJobCards teamId={teamId} />
      </div>

      <div className="mb-8">
        <h2 className="font-bold text-[var(--brand-navy)] mb-1">All tools</h2>
        <p className="text-sm text-[var(--brand-muted)] mb-4">
          Each one answers a different question. You do not need them all.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {MODULE_COPY.map((mod) => (
            <Link
              key={mod.key}
              href={`/teams/${teamId}/modules/${mod.slug}`}
              className="glass-card p-4 group flex items-start gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-[var(--brand-navy)]/10 flex items-center justify-center shrink-0">
                <Zap size={16} className="text-[var(--brand-navy)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--brand-ink)] text-sm">
                  {mod.label}
                  <span className="ml-1.5 font-medium text-[11px] text-[var(--brand-muted)]">
                    {mod.name}
                  </span>
                </p>
                <p className="text-xs text-[var(--brand-muted)] mt-0.5">{mod.answers}</p>
              </div>
              <ArrowRight
                size={14}
                className="text-[var(--brand-muted)] group-hover:text-[var(--brand-navy)] transition-colors shrink-0 mt-1"
              />
            </Link>
          ))}
        </div>
      </div>

      {/* Recent analyses */}
      {analyses.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="font-bold text-[var(--brand-navy)] mb-4">Recent Analyses</h2>
          <ul className="space-y-3">
            {analyses.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between py-2 border-b border-[var(--brand-border)] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <Zap size={15} className="text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--brand-ink)]">
                      {a.module_key?.toUpperCase()} Analysis
                    </p>
                    <p className="text-xs text-[var(--brand-muted)]">
                      {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-[var(--brand-navy)]">
                  {a.overall_score ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
