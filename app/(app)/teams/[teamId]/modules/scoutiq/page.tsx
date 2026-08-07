import { getTeamById, getOpponentsByTeam, getVideosByOpponent, getScoutReportsByOpponent } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Crosshair } from 'lucide-react';
import ScoutIQClient from './ScoutIQClient';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `ScoutIQ — ${team?.name ?? 'Team'}` };
}

export default async function ScoutIQPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ opponent?: string }>;
}) {
  const { teamId } = await params;
  const { opponent: opponentIdParam } = await searchParams;

  const [team, opponents] = await Promise.all([
    getTeamById(teamId),
    getOpponentsByTeam(teamId),
  ]);
  if (!team) notFound();

  const selectedOpponentId = opponentIdParam ?? opponents[0]?.id;
  const [opponentVideos, scoutReports] = selectedOpponentId
    ? await Promise.all([
        getVideosByOpponent(teamId, selectedOpponentId),
        getScoutReportsByOpponent(selectedOpponentId),
      ])
    : [[], []];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Link
          href={`/teams/${teamId}/intelligence`}
          className="flex items-center gap-1.5 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors"
        >
          <ArrowLeft size={15} />
          Intelligence
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
          <Crosshair size={20} className="text-red-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">ScoutIQ</h1>
          <p className="text-[var(--brand-muted)] text-sm">Opponent scouting — tendencies, targets, and a game plan built from film</p>
        </div>
      </div>

      <ScoutIQClient
        teamId={teamId}
        teamName={team.name}
        ageGroup={team.age_group ?? undefined}
        opponents={opponents}
        selectedOpponentId={selectedOpponentId}
        opponentVideos={opponentVideos}
        scoutReports={scoutReports}
      />
    </div>
  );
}
