import { getTeamById, getPlayersByTeam, getVideosByTeam, getRecentAnalysis, getFilmFolders } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Zap } from 'lucide-react';
import QBIQClient from './QBIQClient';
import { resolveInitialVideoIds } from '@/lib/intelligence/initial-selection';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `QBIQ — ${team?.name ?? 'Team'}` };
}

export default async function QBIQPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ videoId?: string; videoIds?: string; folderId?: string }>;
}) {
  const { teamId } = await params;
  const { videoId, videoIds, folderId } = await searchParams;
  const [team, players, videos, folders, pastAnalyses] = await Promise.all([
    getTeamById(teamId),
    getPlayersByTeam(teamId),
    getVideosByTeam(teamId),
    getFilmFolders(teamId),
    getRecentAnalysis(teamId, 5),
  ]);

  if (!team) notFound();

  const qbs = players.filter((p) => p.primary_position === 'QB');
  const qbAnalyses = pastAnalyses.filter((a) => a.module_key === 'QBIQ');

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
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
          <Zap size={20} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">QBIQ</h1>
          <p className="text-[var(--brand-muted)] text-sm">Quarterback Intelligence Module</p>
        </div>
      </div>

      <QBIQClient
        teamId={teamId}
        teamName={team.name}
        ageGroup={team.age_group ?? undefined}
        qbs={qbs}
        videos={videos}
        folders={folders}
        pastAnalyses={qbAnalyses}
        initialVideoIds={initialVideoIds}
      />
    </div>
  );
}
