import { createClient as createServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { getTeams, getRecentAnalyses, getVideoCount } from '@/lib/db/queries';
import { Users, Film, Brain, Zap, ArrowRight, Plus } from 'lucide-react';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [teams, analyses, filmSessionCount] = await Promise.all([
    getTeams(user!.id),
    getRecentAnalyses(user!.id, 5),
    getVideoCount(),
  ]);

  const displayName = user?.user_metadata?.full_name?.split(' ')[0] ?? 'Coach';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">
            Good morning, {displayName}
          </h1>
          <p className="text-[var(--brand-muted)] text-sm mt-0.5">
            Your football intelligence overview
          </p>
        </div>
        <Link
          href="/teams/new"
          className="flex items-center gap-2 bg-[var(--brand-navy)] text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors"
        >
          <Plus size={16} />
          New Team
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: 'Teams',
            value: teams?.length ?? 0,
            icon: Users,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
          {
            label: 'Film Sessions',
            value: filmSessionCount,
            icon: Film,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
          },
          {
            label: 'Analyses Run',
            value: analyses?.length ?? 0,
            icon: Brain,
            color: 'text-[var(--brand-navy)]',
            bg: 'bg-[#485995]/10',
          },
          {
            label: 'IQ Score Avg',
            value: '—',
            icon: Zap,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
        ].map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon size={20} className={stat.color} />
            </div>
            <p className="text-2xl font-bold text-[var(--brand-ink)]">{stat.value}</p>
            <p className="text-xs text-[var(--brand-muted)] font-medium mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Teams */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[var(--brand-navy)]">Your Teams</h2>
            <Link
              href="/teams"
              className="text-xs text-[var(--brand-navy)] hover:underline flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {!teams || teams.length === 0 ? (
            <div className="text-center py-10">
              <Users size={36} className="text-[var(--brand-border-strong)] mx-auto mb-3" />
              <p className="text-[var(--brand-muted)] text-sm mb-4">No teams yet</p>
              <Link
                href="/teams/new"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-navy)] border border-[var(--brand-navy)] px-4 py-2 rounded-lg hover:bg-[var(--brand-navy)] hover:text-white transition-colors"
              >
                <Plus size={15} />
                Create your first team
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {teams.slice(0, 5).map((team) => (
                <li key={team.id}>
                  <Link
                    href={`/teams/${team.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--brand-bg)] transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[var(--brand-navy)]/10 flex items-center justify-center">
                        <Users size={14} className="text-[var(--brand-navy)]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--brand-ink)]">{team.name}</p>
                        <p className="text-xs text-[var(--brand-muted)]">
                          {team.season ?? 'Season not set'}
                        </p>
                      </div>
                    </div>
                    <ArrowRight
                      size={14}
                      className="text-[var(--brand-muted)] group-hover:text-[var(--brand-navy)] transition-colors"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent analyses */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[var(--brand-navy)]">Recent Analyses</h2>
            <Link
              href="/intelligence"
              className="text-xs text-[var(--brand-navy)] hover:underline flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {!analyses || analyses.length === 0 ? (
            <div className="text-center py-10">
              <Brain size={36} className="text-[var(--brand-border-strong)] mx-auto mb-3" />
              <p className="text-[var(--brand-muted)] text-sm">
                No analyses yet. Upload film to get started.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {analyses.map((analysis) => (
                <li
                  key={analysis.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--brand-bg)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                      <Zap size={14} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--brand-ink)]">
                        {analysis.module_key?.toUpperCase() ?? 'Analysis'}
                      </p>
                      <p className="text-xs text-[var(--brand-muted)]">
                        Score: {analysis.overall_score ?? '—'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-[var(--brand-muted)]">
                    {new Date(analysis.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
