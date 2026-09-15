import { getTeamById, getVideosByTeam, getFilmFolders, getRecentAnalysis, getPlayersByTeam } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import StatsIQClient from './StatsIQClient';
import { resolveInitialVideoIds } from '@/lib/intelligence/initial-selection';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `StatsIQ — ${team?.name ?? 'Team'}` };
}

export default async function StatsIQPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ videoId?: string; videoIds?: string; folderId?: string }>;
}) {
  const { teamId } = await params;
  const { videoId, videoIds, folderId } = await searchParams;
  const [team, videos, folders, pastAnalyses, players] = await Promise.all([
    getTeamById(teamId),
    getVideosByTeam(teamId),
    getFilmFolders(teamId),
    getRecentAnalysis(teamId, 5),
    getPlayersByTeam(teamId),
  ]);

  if (!team) notFound();

  const statsAnalyses = pastAnalyses.filter((a) => a.module_key === 'STATSIQ');
  const initialVideoIds = resolveInitialVideoIds({ videoId, videoIds, folderId }, videos);

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
        <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
          <BarChart3 size={20} className="text-sky-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">StatsIQ</h1>
          <p className="text-[var(--brand-muted)] text-sm">
            The box score, charted off your film — formation, then position, then every stat
          </p>
        </div>
      </div>

      <StatsIQClient
        teamId={teamId}
        teamName={team.name}
        ageGroup={team.age_group ?? undefined}
        homeJerseyColor={team.home_jersey_color ?? undefined}
        awayJerseyColor={team.away_jersey_color ?? undefined}
        rosterWithNumbers={players.filter((p) => p.jersey_number != null).length}
        rosterSize={players.length}
        videos={videos}
        folders={folders}
        pastAnalyses={statsAnalyses}
        initialVideoIds={initialVideoIds}
      />
    </div>
  );
}
