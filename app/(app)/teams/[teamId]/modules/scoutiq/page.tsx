import { getTeamById, getOpponentsByTeam, getVideosByTeam, getScoutReportsByOpponent, getScoutedVideoIds } from '@/lib/db/queries';
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

  /**
   * The WHOLE library, not just film tagged to this opponent.
   *
   * One cut-up of two opponents playing each other is film of both of them,
   * and videos.opponent_id can only name one. Filtering by it meant scouting
   * the second team required re-tagging the clips in the film library, which
   * emptied the first team's film list and is the kind of round trip a coach
   * gets wrong once and loses an evening to. The tag still decides what is
   * PRE-SELECTED below; it no longer decides what is selectable.
   */
  const [allVideos, scoutReports] = await Promise.all([
    getVideosByTeam(teamId),
    selectedOpponentId ? getScoutReportsByOpponent(selectedOpponentId) : Promise.resolve([]),
  ]);
  const opponentVideos = allVideos;

  // Which clips are already done FOR THIS OPPONENT — per-opponent, so scouting
  // team A does not mark every clip as finished when the coach turns to team B.
  const scoutedVideoIds = await getScoutedVideoIds(
    opponentVideos.map((v) => v.id),
    selectedOpponentId
  );

  // Film already tagged to this opponent, which is what gets pre-selected.
  const taggedVideoIds = allVideos
    .filter((v) => v.opponent_id === selectedOpponentId)
    .map((v) => v.id);

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
          <p className="text-[var(--brand-muted)] text-sm">
            Who are we playing, and how do we attack them?
          </p>
        </div>
      </div>

      <ScoutIQClient
        teamId={teamId}
        teamName={team.name}
        ageGroup={team.age_group ?? undefined}
        opponents={opponents}
        selectedOpponentId={selectedOpponentId}
        opponentVideos={opponentVideos}
        taggedVideoIds={taggedVideoIds}
        scoutedVideoIds={scoutedVideoIds}
        scoutReports={scoutReports}
      />
    </div>
  );
}
