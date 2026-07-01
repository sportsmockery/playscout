import { getTeamById, getPlayersByTeam, getVideosByTeam, getRecentAnalysis } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Zap } from 'lucide-react';
import QBIQClient from './QBIQClient';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `QBIQ — ${team?.name ?? 'Team'}` };
}

export default async function QBIQPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const [team, players, videos, pastAnalyses] = await Promise.all([
    getTeamById(teamId),
    getPlayersByTeam(teamId),
    getVideosByTeam(teamId),
    getRecentAnalysis(teamId, 5),
  ]);

  if (!team) notFound();

  const qbs = players.filter((p) => p.primary_position === 'QB');
  const completedVideos = videos.filter((v) => v.processing_status === 'completed' || v.status === 'analysis_complete');
  const qbAnalyses = pastAnalyses.filter((a) => a.module_key === 'qbiq');

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
        videos={completedVideos}
        pastAnalyses={qbAnalyses}
      />
    </div>
  );
}
