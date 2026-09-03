import { getTeamById, getVideoById, getPlaySequencesByVideo } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PlaySequencesClient from './PlaySequencesClient';
import AttachBreakdown from './AttachBreakdown';

export async function generateMetadata({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  const video = await getVideoById(videoId);
  return { title: video ? `Plays — ${video.title}` : 'Play Sequences' };
}

export default async function PlaySequencesPage({
  params,
}: {
  params: Promise<{ teamId: string; videoId: string }>;
}) {
  const { teamId, videoId } = await params;
  const [team, video, playSequences] = await Promise.all([
    getTeamById(teamId),
    getVideoById(videoId),
    getPlaySequencesByVideo(videoId),
  ]);

  if (!team || !video || video.team_id !== teamId) notFound();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href={`/teams/${teamId}/film/${videoId}`}
        className="flex items-center gap-2 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        {video.title}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Play Sequences</h1>
        <p className="text-sm text-[var(--brand-muted)] mt-1">
          {playSequences.length > 0
            ? 'Confirm or correct the boundaries below — automatic detection is a starting point, not ground truth.'
            : 'No plays detected automatically for this film yet. Add play boundaries manually below.'}
        </p>
      </div>

      <div className="mb-6">
        <AttachBreakdown videoId={videoId} />
      </div>

      <PlaySequencesClient
        teamId={teamId}
        videoId={videoId}
        durationSeconds={video.duration_seconds ?? null}
        initialPlaySequences={playSequences}
      />
    </div>
  );
}
