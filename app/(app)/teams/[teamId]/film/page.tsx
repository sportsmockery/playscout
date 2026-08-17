import { getTeamById, getVideosByTeam, getFilmFolders } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import FilmLibraryClient from './FilmLibraryClient';

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
  const [team, videos, folders] = await Promise.all([
    getTeamById(teamId),
    getVideosByTeam(teamId),
    getFilmFolders(teamId),
  ]);

  if (!team) notFound();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Link
          href={`/teams/${teamId}`}
          className="flex items-center gap-1.5 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors"
        >
          <ArrowLeft size={15} />
          {team.name}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Film Library</h1>
        <p className="text-[var(--brand-muted)] text-sm mt-0.5">
          {videos.length} video{videos.length !== 1 ? 's' : ''} uploaded
          {folders.length > 0 ? ` · ${folders.length} folder${folders.length !== 1 ? 's' : ''}` : ''}
        </p>
      </div>

      <FilmLibraryClient
        teamId={teamId}
        teamName={team.name}
        videos={videos}
        folders={folders}
      />
    </div>
  );
}
