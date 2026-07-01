import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeams } from '@/lib/db/queries';
import Link from 'next/link';
import { Users, Plus, ArrowRight, Film, Brain } from 'lucide-react';

export const metadata = { title: 'Teams' };

export default async function TeamsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const teams = await getTeams(user!.id);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Teams</h1>
          <p className="text-[var(--brand-muted)] text-sm mt-0.5">
            Manage your football teams and rosters
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

      {teams.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Users size={48} className="text-[var(--brand-border-strong)] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--brand-navy)] mb-2">No teams yet</h2>
          <p className="text-[var(--brand-muted)] mb-6 max-w-sm mx-auto">
            Create your first team to start building rosters, uploading film, and running intelligence analyses.
          </p>
          <Link
            href="/teams/new"
            className="inline-flex items-center gap-2 bg-[var(--brand-navy)] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors"
          >
            <Plus size={18} />
            Create your first team
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/teams/${team.id}`}
              className="glass-card p-6 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--brand-navy)] flex items-center justify-center text-[var(--brand-gold)] font-bold text-lg">
                  {team.name?.charAt(0) ?? 'T'}
                </div>
                <ArrowRight
                  size={18}
                  className="text-[var(--brand-muted)] group-hover:text-[var(--brand-navy)] transition-colors mt-1"
                />
              </div>
              <h3 className="font-bold text-[var(--brand-ink)] text-lg mb-1">{team.name}</h3>
              <p className="text-sm text-[var(--brand-muted)] mb-4">
                {team.season ?? 'Season not set'} · {team.age_group ?? 'Age not set'}
              </p>
              <div className="flex items-center gap-4 text-xs text-[var(--brand-muted)]">
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  Roster
                </span>
                <span className="flex items-center gap-1">
                  <Film size={12} />
                  Film
                </span>
                <span className="flex items-center gap-1">
                  <Brain size={12} />
                  Intelligence
                </span>
              </div>
            </Link>
          ))}
          {/* Add team card */}
          <Link
            href="/teams/new"
            className="glass-card p-6 border-2 border-dashed border-[var(--brand-border-strong)] flex flex-col items-center justify-center text-center hover:border-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/5 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl border-2 border-dashed border-[var(--brand-border-strong)] flex items-center justify-center mb-3 group-hover:border-[var(--brand-navy)] transition-colors">
              <Plus size={20} className="text-[var(--brand-muted)] group-hover:text-[var(--brand-navy)] transition-colors" />
            </div>
            <p className="font-semibold text-[var(--brand-muted)] group-hover:text-[var(--brand-navy)] transition-colors text-sm">
              Add another team
            </p>
          </Link>
        </div>
      )}
    </div>
  );
}
