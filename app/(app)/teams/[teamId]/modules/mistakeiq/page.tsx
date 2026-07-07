import { getTeamById, getVideosByTeam, getRecentAnalysis } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import MistakeIQClient from './MistakeIQClient';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `MistakeIQ — ${team?.name ?? 'Team'}` };
}

export default async function MistakeIQPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const [team, videos, pastAnalyses] = await Promise.all([
    getTeamById(teamId),
    getVideosByTeam(teamId),
    getRecentAnalysis(teamId, 5),
  ]);

  if (!team) notFound();

  const readyVideos = videos.filter(
    (v) => v.status === 'ready_for_review' || v.status === 'analysis_complete'
  );
  const mistakeAnalyses = pastAnalyses.filter((a) => a.module_key === 'MISTAKEIQ');

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
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
          <AlertTriangle size={20} className="text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">MistakeIQ</h1>
          <p className="text-[var(--brand-muted)] text-sm">Mistake Intelligence — assignment, leverage, ball security</p>
        </div>
      </div>

      <MistakeIQClient
        teamId={teamId}
        teamName={team.name}
        ageGroup={team.age_group ?? undefined}
        videos={readyVideos}
        pastAnalyses={mistakeAnalyses}
      />
    </div>
  );
}
