import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeamById, getVideosByTeam } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Film, Upload, Play, Clock } from 'lucide-react';
import UploadVideoButton from './UploadVideoButton';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `Film — ${team?.name ?? 'Team'}` };
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
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
        <UploadVideoButton teamId={teamId} />
      </div>

      {videos.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Film size={48} className="text-[var(--brand-border-strong)] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--brand-navy)] mb-2">No film yet</h2>
          <p className="text-[var(--brand-muted)] text-sm mb-6 max-w-sm mx-auto">
            Upload game or practice film to run AI frame analysis, extract tendencies, and build intelligence reports.
          </p>
          <UploadVideoButton teamId={teamId} variant="primary" />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {videos.map((video) => (
            <Link
              key={video.id}
              href={`/teams/${teamId}/film/${video.id}`}
              className="glass-card overflow-hidden film-card group block"
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-[var(--brand-navy)]/10 relative flex items-center justify-center">
                {video.thumbnail_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnail_path}
                    alt={video.title}
                    className="film-thumbnail w-full h-full"
                  />
                ) : (
                  <Film size={32} className="text-[var(--brand-navy)]/30" />
                )}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                  <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                    <Play size={20} className="text-[var(--brand-navy)] ml-1" />
                  </div>
                </div>
                {video.status === 'processing' && (
                  <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    Processing
                  </div>
                )}
                {(video.status === 'ready_for_review' || video.status === 'analysis_complete') && (
                  <div className="absolute top-2 right-2 bg-emerald-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    Ready
                  </div>
                )}
              </div>

              {/* Meta */}
              <div className="p-4">
                <h3 className="font-semibold text-[var(--brand-ink)] text-sm mb-1 truncate">
                  {video.title}
                </h3>
                <div className="flex items-center gap-3 text-xs text-[var(--brand-muted)]">
                  {video.duration_seconds && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {formatDuration(video.duration_seconds)}
                    </span>
                  )}
                  <span>{new Date(video.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
