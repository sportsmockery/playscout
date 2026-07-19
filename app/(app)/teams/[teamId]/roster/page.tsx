import { getTeamById, getPlayersByTeam } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, UserCircle } from 'lucide-react';
import AddPlayerButton from './AddPlayerButton';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `Roster — ${team?.name ?? 'Team'}` };
}

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-blue-100 text-blue-700',
  RB: 'bg-green-100 text-green-700',
  FB: 'bg-green-100 text-green-700',
  WR: 'bg-purple-100 text-purple-700',
  TE: 'bg-indigo-100 text-indigo-700',
  OL: 'bg-yellow-100 text-yellow-700',
  C: 'bg-yellow-100 text-yellow-700',
  OG: 'bg-yellow-100 text-yellow-700',
  OT: 'bg-yellow-100 text-yellow-700',
  DE: 'bg-red-100 text-red-700',
  DT: 'bg-red-100 text-red-700',
  LB: 'bg-orange-100 text-orange-700',
  CB: 'bg-teal-100 text-teal-700',
  SS: 'bg-teal-100 text-teal-700',
  FS: 'bg-teal-100 text-teal-700',
  K: 'bg-gray-100 text-gray-700',
  P: 'bg-gray-100 text-gray-700',
  LS: 'bg-gray-100 text-gray-700',
};

export default async function RosterPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const [team, players] = await Promise.all([
    getTeamById(teamId),
    getPlayersByTeam(teamId),
  ]);

  if (!team) notFound();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Link
          href={`/teams/${teamId}`}
          className="flex items-center gap-1.5 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors"
        >
          <ArrowLeft size={15} />
          {team.name}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Roster</h1>
          <p className="text-[var(--brand-muted)] text-sm mt-0.5">
            {players.length} player{players.length !== 1 ? 's' : ''}
          </p>
        </div>
        <AddPlayerButton teamId={teamId} />
      </div>

      {players.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <UserCircle size={48} className="text-[var(--brand-border-strong)] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--brand-navy)] mb-2">No players yet</h2>
          <p className="text-[var(--brand-muted)] text-sm mb-6">
            Add players to build your roster and unlock intelligence analyses.
          </p>
          <AddPlayerButton teamId={teamId} variant="primary" />
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--brand-border)]">
                <th className="text-left text-xs font-semibold text-[var(--brand-muted)] uppercase tracking-wide px-5 py-3 w-14">#</th>
                <th className="text-left text-xs font-semibold text-[var(--brand-muted)] uppercase tracking-wide px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-[var(--brand-muted)] uppercase tracking-wide px-4 py-3">Position</th>
                <th className="text-left text-xs font-semibold text-[var(--brand-muted)] uppercase tracking-wide px-4 py-3">Grade</th>
                <th className="text-left text-xs font-semibold text-[var(--brand-muted)] uppercase tracking-wide px-4 py-3">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {players.map((player, idx) => (
                <tr
                  key={player.id}
                  className={`border-b border-[var(--brand-border)] last:border-0 hover:bg-[var(--brand-bg)] transition-colors ${
                    idx % 2 === 0 ? '' : 'bg-[var(--brand-bg)]/40'
                  }`}
                >
                  <td className="px-5 py-3 text-sm font-bold text-[var(--brand-navy)]">
                    {player.jersey_number ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-[var(--brand-ink)]">
                      {player.first_name} {player.last_name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      POSITION_COLORS[player.primary_position ?? ''] ?? 'bg-gray-100 text-gray-600'
                    }`}>
                      {player.primary_position ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--brand-muted)]">
                    {player.grade_level ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                      player.status === 'active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {player.status ?? 'active'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
