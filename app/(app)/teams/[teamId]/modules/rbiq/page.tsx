import { getTeamById, getPlayersByTeam, getVideosByTeam, getRecentAnalysis } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Gauge } from 'lucide-react';
import RBIQClient from './RBIQClient';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `RBIQ — ${team?.name ?? 'Team'}` };
}

export default async function RBIQPage({
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

  const rbs = players.filter((p) => p.primary_position === 'RB');
  const completedVideos = videos.filter((v) => v.status === 'ready_for_review' || v.status === 'analysis_complete');
  const rbAnalyses = pastAnalyses.filter((a) => a.module_key === 'RBIQ');

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
        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
          <Gauge size={20} className="text-rose-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">RBIQ</h1>
          <p className="text-[var(--brand-muted)] text-sm">Running Back Intelligence Module</p>
        </div>
      </div>

      <RBIQClient
        teamId={teamId}
        teamName={team.name}
        ageGroup={team.age_group ?? undefined}
        rbs={rbs}
        videos={completedVideos}
        pastAnalyses={rbAnalyses}
      />
    </div>
  );
}
