'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Film, Play, Clock } from 'lucide-react';
import type { Video } from '@/lib/db/types';

function formatDuration(seconds?: number | null) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VideoCard({ teamId, video }: { teamId: string; video: Video }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    setError('');
    try {
      const res = await fetch(`/api/videos/${video.id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not retry.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not retry.');
      setRetrying(false);
    }
  }

  return (
    <div className="glass-card overflow-hidden film-card group relative">
      <Link href={`/teams/${teamId}/film/${video.id}`} className="block">
        <div className="aspect-video bg-[var(--brand-navy)]/10 relative flex items-center justify-center">
          {video.thumbnail_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={video.thumbnail_path} alt={video.title} className="film-thumbnail w-full h-full" />
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
          {video.status === 'failed' && (
            <div className="absolute top-2 right-2 bg-red-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
              Failed
            </div>
          )}
        </div>

        <div className="p-4 pb-2">
          <h3 className="font-semibold text-[var(--brand-ink)] text-sm mb-1 truncate">{video.title}</h3>
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

      {video.status === 'failed' && (
        <div className="px-4 pb-4">
          {video.error_message && (
            <p className="text-xs text-red-600 mb-2 line-clamp-2">{video.error_message}</p>
          )}
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <button
            onClick={retry}
            disabled={retrying}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
          >
            {retrying ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Retrying...
              </>
            ) : (
              'Try Again'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
