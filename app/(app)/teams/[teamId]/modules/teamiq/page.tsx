import { getTeamById, getVideosByTeam, getRecentAnalysis } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import TeamIQClient from './TeamIQClient';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `TeamIQ — ${team?.name ?? 'Team'}` };
}

export default async function TeamIQPage({
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
  const teamAnalyses = pastAnalyses.filter((a) => a.module_key === 'TEAMIQ');

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
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
          <TrendingUp size={20} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">TeamIQ</h1>
          <p className="text-[var(--brand-muted)] text-sm">Team Intelligence — tendencies, formations, scheme</p>
        </div>
      </div>

      <TeamIQClient
        teamId={teamId}
        teamName={team.name}
        ageGroup={team.age_group ?? undefined}
        offensiveStyle={team.offensive_style ?? undefined}
        defensiveStyle={team.defensive_style ?? undefined}
        homeJerseyColor={team.home_jersey_color ?? undefined}
        awayJerseyColor={team.away_jersey_color ?? undefined}
        videos={readyVideos}
        pastAnalyses={teamAnalyses}
      />
    </div>
  );
}
