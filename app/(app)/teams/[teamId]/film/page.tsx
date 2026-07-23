import { getTeamById, getVideosByTeam } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Film } from 'lucide-react';
import UploadVideoButton from './UploadVideoButton';
import VideoCard from './VideoCard';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `Film — ${team?.name ?? 'Team'}` };
}

export default async function FilmPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const [team, videos] = await Promise.all([
    getTeamById(teamId),
    getVideosByTeam(teamId),
  ]);

  if (!team) notFound();

  return (
    <div className="p-6 max-w-6xl mx-auto">
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
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Film Library</h1>
          <p className="text-[var(--brand-muted)] text-sm mt-0.5">
            {videos.length} video{videos.length !== 1 ? 's' : ''} uploaded
          </p>
        </div>
        <UploadVideoButton teamId={teamId} teamName={team.name} />
      </div>

      {videos.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Film size={48} className="text-[var(--brand-border-strong)] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--brand-navy)] mb-2">No film yet</h2>
          <p className="text-[var(--brand-muted)] text-sm mb-6 max-w-sm mx-auto">
            Upload game or practice film to run AI frame analysis, extract tendencies, and build intelligence reports.
          </p>
          <UploadVideoButton teamId={teamId} teamName={team.name} variant="primary" />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {videos.map((video) => (
            <VideoCard key={video.id} teamId={teamId} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}
