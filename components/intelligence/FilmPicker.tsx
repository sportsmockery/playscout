'use client';

import { useMemo, useState } from 'react';
import { CheckSquare, ChevronDown, ChevronRight, Film, Search, Square } from 'lucide-react';
import type { Video, VideoStatus } from '@/lib/db/types';

export interface FilmPickerFolder {
  id: string;
  name: string;
}

interface Props {
  videos: Video[];
  folders: FilmPickerFolder[];
  /** Selected video ids. */
  value: string[];
  onChange: (videoIds: string[]) => void;
  disabled?: boolean;
}

/** Film that can't produce frames no matter how long we wait. */
export function isUnanalyzable(video: Video): boolean {
  return video.status === 'failed';
}

/** Frames already exist — this clip can be analyzed right now, inline. */
export function isReadyNow(video: Video): boolean {
  return video.status === 'ready_for_review' || video.status === 'analysis_complete';
}

export function filmStatusLabel(video: Video): { label: string; tone: 'ready' | 'pending' | 'error' } {
  const status = (video.status ?? 'uploaded') as VideoStatus;
  switch (status) {
    case 'ready_for_review':
    case 'analysis_complete':
      return { label: 'Ready', tone: 'ready' };
    case 'processing':
      return { label: 'Processing', tone: 'pending' };
    case 'partially_ready':
      return { label: 'Partly ready', tone: 'pending' };
    case 'failed':
      return { label: 'Failed', tone: 'error' };
    default:
      return { label: 'Queued', tone: 'pending' };
  }
}

const TONE_CLASS = {
  ready: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  error: 'bg-red-50 text-red-700',
} as const;

/**
 * Film selector for the module screens.
 *
 * Two things it deliberately does differently from the dropdown it replaced:
 *
 * 1. It lists EVERY video in the team's library, not only the ones that have
 *    finished processing. A coach whose upload is still extracting frames was
 *    previously shown a dropdown that silently omitted it, which reads as
 *    "my video disappeared." Clips that aren't ready are selectable and
 *    labelled — the queued job waits for the film and runs when it lands.
 * 2. It selects many clips, and whole folders at once, because a batch is the
 *    normal unit of work: a coach uploads a game as 40 single-play clips and
 *    wants all 40 graded.
 */
export default function FilmPicker({ videos, folders, value, onChange, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? videos.filter((v) => v.title.toLowerCase().includes(q)) : videos;
  }, [videos, query]);

  // Only folders that actually hold matching film, plus a trailing "Unfiled"
  // group — an empty folder in the picker is just noise.
  const groups = useMemo(() => {
    const out: { id: string; name: string; videos: Video[] }[] = [];
    for (const folder of folders) {
      const inFolder = filtered.filter((v) => v.folder_id === folder.id);
      if (inFolder.length) out.push({ id: folder.id, name: folder.name, videos: inFolder });
    }
    const unfiled = filtered.filter((v) => !v.folder_id || !folders.some((f) => f.id === v.folder_id));
    if (unfiled.length) out.push({ id: '__unfiled__', name: 'Unfiled', videos: unfiled });
    return out;
  }, [filtered, folders]);

  function toggleVideo(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function toggleGroup(groupVideos: Video[]) {
    const selectable = groupVideos.filter((v) => !isUnanalyzable(v));
    const allSelected = selectable.every((v) => selected.has(v.id));
    const next = new Set(selected);
    for (const v of selectable) {
      if (allSelected) next.delete(v.id);
      else next.add(v.id);
    }
    onChange([...next]);
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (videos.length === 0) {
    return (
      <p className="text-xs text-[var(--brand-muted)] bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-lg p-2">
        No film in this team&apos;s library yet. Upload game film, or use a quick clip below.
      </p>
    );
  }

  return (
    <div className={`rounded-lg border border-[var(--brand-border)] bg-white ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[var(--brand-border)]">
        <Search size={13} className="text-[var(--brand-muted)] shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search film…"
          className="min-w-0 flex-1 bg-transparent text-xs text-[var(--brand-ink)] focus:outline-none placeholder:text-[var(--brand-muted)]"
        />
        {value.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="shrink-0 text-[11px] font-semibold text-[var(--brand-muted)] hover:text-[var(--brand-navy)]"
          >
            Clear
          </button>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto">
        {groups.length === 0 && (
          <p className="px-3 py-4 text-xs text-[var(--brand-muted)]">No film matches “{query}”.</p>
        )}

        {groups.map((group) => {
          const selectable = group.videos.filter((v) => !isUnanalyzable(v));
          const allSelected = selectable.length > 0 && selectable.every((v) => selected.has(v.id));
          const someSelected = selectable.some((v) => selected.has(v.id));
          const isCollapsed = collapsed.has(group.id);

          return (
            <div key={group.id} className="border-b border-[var(--brand-border)] last:border-0">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--brand-bg)]">
                <button
                  onClick={() => toggleCollapsed(group.id)}
                  className="p-0.5 text-[var(--brand-muted)] hover:text-[var(--brand-navy)]"
                  aria-label={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                >
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
                <button
                  onClick={() => toggleGroup(group.videos)}
                  className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                >
                  {allSelected ? (
                    <CheckSquare size={13} className="shrink-0 text-[var(--brand-navy)]" />
                  ) : (
                    <Square size={13} className={`shrink-0 ${someSelected ? 'text-[var(--brand-navy)]' : 'text-[var(--brand-muted)]'}`} />
                  )}
                  <span className="truncate text-[11px] font-bold uppercase tracking-wide text-[var(--brand-navy)]">
                    {group.name}
                  </span>
                  <span className="ml-auto text-[10px] text-[var(--brand-muted)] shrink-0">
                    {group.videos.length}
                  </span>
                </button>
              </div>

              {!isCollapsed && (
                <ul>
                  {group.videos.map((v) => {
                    const status = filmStatusLabel(v);
                    const blocked = isUnanalyzable(v);
                    return (
                      <li key={v.id}>
                        <button
                          onClick={() => !blocked && toggleVideo(v.id)}
                          disabled={blocked}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--brand-bg)] transition-colors ${
                            blocked ? 'cursor-not-allowed opacity-60' : ''
                          }`}
                        >
                          {selected.has(v.id) ? (
                            <CheckSquare size={14} className="shrink-0 text-[var(--brand-navy)]" />
                          ) : (
                            <Square size={14} className="shrink-0 text-[var(--brand-muted)]" />
                          )}
                          <Film size={12} className="shrink-0 text-[var(--brand-muted)]" />
                          <span className="min-w-0 flex-1 truncate text-xs text-[var(--brand-ink)]">{v.title}</span>
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TONE_CLASS[status.tone]}`}>
                            {status.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
