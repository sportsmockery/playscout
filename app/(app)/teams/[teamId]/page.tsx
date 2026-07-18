import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeamById, getPlayersByTeam, getVideosByTeam, getRecentAnalysis } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Users, Film, Brain, ArrowRight, Plus, Zap, Settings } from 'lucide-react';

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
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

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

      {/* Modules */}
      <div className="mb-8">
        <h2 className="font-bold text-[var(--brand-navy)] mb-4">Intelligence Modules</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: 'QBIQ', href: `/teams/${teamId}/modules/qbiq`, color: 'bg-blue-50 text-blue-600' },
            { name: 'OLIQ', href: `/teams/${teamId}/modules/oliq`, color: 'bg-emerald-50 text-emerald-600' },
            { name: 'TeamIQ', href: `/teams/${teamId}/modules/teamiq`, color: 'bg-purple-50 text-purple-600' },
            { name: 'MistakeIQ', href: `/teams/${teamId}/modules/mistakeiq`, color: 'bg-orange-50 text-orange-600' },
          ].map((mod) => (
            <Link
              key={mod.name}
              href={mod.href}
              className={`glass-card p-5 flex flex-col items-center gap-2 group`}
            >
              <div className={`w-10 h-10 rounded-lg ${mod.color} flex items-center justify-center`}>
                <Zap size={18} />
              </div>
              <span className="font-bold text-[var(--brand-ink)] text-sm">{mod.name}</span>
              <ArrowRight
                size={13}
                className="text-[var(--brand-muted)] group-hover:text-[var(--brand-navy)] transition-colors"
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
