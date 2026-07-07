import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeamById, getVideoById } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string; videoId: string }> }) {
  const { videoId } = await params;
  const video = await getVideoById(videoId);
  return { title: video?.title ?? 'Film' };
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; videoId: string }>;
}) {
  const { teamId, videoId } = await params;
  const [team, video] = await Promise.all([
    getTeamById(teamId),
    getVideoById(videoId),
  ]);

  if (!team || !video || video.team_id !== teamId) notFound();

  const supabase = await createServerClient();
  const signedUrl = video.storage_path
    ? (await supabase.storage.from('videos').createSignedUrl(video.storage_path, 3600)).data?.signedUrl
    : null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href={`/teams/${teamId}/film`}
        className="flex items-center gap-2 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Film Library
      </Link>

      <div className="glass-card overflow-hidden mb-6">
        {signedUrl ? (
          <video
            controls
            preload="metadata"
            poster={video.thumbnail_path ?? undefined}
            className="w-full aspect-video bg-black"
          >
            <source src={signedUrl} />
            Your browser doesn&apos;t support playback of this video format.
          </video>
        ) : (
          <div className="w-full aspect-video bg-[var(--brand-navy)]/10 flex items-center justify-center text-sm text-[var(--brand-muted)]">
            Video file not available yet.
          </div>
        )}
      </div>

      <div className="glass-card p-6">
        <h1 className="text-xl font-bold text-[var(--brand-navy)] mb-1">{video.title}</h1>
        <div className="flex items-center gap-4 text-sm text-[var(--brand-muted)]">
          {video.duration_seconds && (
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {formatDuration(video.duration_seconds)}
            </span>
          )}
          <span className="capitalize">{video.status?.replace(/_/g, ' ') ?? 'Unknown status'}</span>
          <span>{new Date(video.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
