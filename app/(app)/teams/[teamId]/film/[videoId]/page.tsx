import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeamById, getVideoById } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, Sparkles, Zap, Gauge, Shield, TrendingUp, AlertTriangle } from 'lucide-react';

// Film-based IQ modules only (PlaybookIQ is document-based, not film).
const FILM_MODULES = [
  { key: 'qbiq', name: 'QBIQ', label: 'Quarterback', icon: Zap, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'rbiq', name: 'RBIQ', label: 'Running Back', icon: Gauge, color: 'text-rose-600', bg: 'bg-rose-50' },
  { key: 'oliq', name: 'OLIQ', label: 'Offensive Line', icon: Shield, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'teamiq', name: 'TeamIQ', label: 'Team Tendencies', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'mistakeiq', name: 'MistakeIQ', label: 'Mistakes', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
] as const;

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

      {/* Run IQ Analysis on this film */}
      <div className="glass-card p-6 mt-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={18} className="text-[var(--brand-gold)]" />
          <h2 className="font-bold text-[var(--brand-navy)]">Run IQ Analysis</h2>
        </div>
        <p className="text-sm text-[var(--brand-muted)] mb-4">
          Analyze this film with an intelligence module. Results save to {team.name}&apos;s history.
        </p>

        {video.status === 'ready_for_review' || video.status === 'analysis_complete' ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {FILM_MODULES.map((mod) => (
              <Link
                key={mod.key}
                href={`/teams/${teamId}/modules/${mod.key}?videoId=${videoId}`}
                className="flex items-center gap-3 p-3 rounded-xl border border-[var(--brand-border)] hover:border-[var(--brand-navy)] hover:bg-[var(--brand-bg)] transition-colors"
              >
                <div className={`w-9 h-9 rounded-lg ${mod.bg} flex items-center justify-center flex-shrink-0`}>
                  <mod.icon size={18} className={mod.color} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--brand-ink)]">{mod.name}</p>
                  <p className="text-xs text-[var(--brand-muted)] truncate">{mod.label}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--brand-muted)] bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-lg p-3">
            IQ analysis unlocks once this film finishes processing.
          </p>
        )}
      </div>
    </div>
  );
}
