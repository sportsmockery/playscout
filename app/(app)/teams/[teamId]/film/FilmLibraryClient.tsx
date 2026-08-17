'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckSquare,
  Film,
  FolderOpen,
  FolderPlus,
  Layers,
  Pencil,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { Video, VideoFolder } from '@/lib/db/types';
import UploadVideoButton from './UploadVideoButton';
import VideoCard from './VideoCard';

type FolderWithCount = VideoFolder & { video_count: number };

interface Props {
  teamId: string;
  teamName: string;
  videos: Video[];
  folders: FolderWithCount[];
}

const UNFILED = '__unfiled__';

export default function FilmLibraryClient({ teamId, teamName, videos, folders }: Props) {
  const router = useRouter();
  // null = "All film". A folder id, or UNFILED for clips in no folder.
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const visible = useMemo(() => {
    if (activeFolder === null) return videos;
    if (activeFolder === UNFILED) return videos.filter((v) => !v.folder_id);
    return videos.filter((v) => v.folder_id === activeFolder);
  }, [videos, activeFolder]);

  const unfiledCount = useMemo(() => videos.filter((v) => !v.folder_id).length, [videos]);
  const currentFolder = folders.find((f) => f.id === activeFolder) ?? null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function post(url: string, body: unknown, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      router.refresh();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createFolder() {
    if (!newName.trim()) return;
    const data = await post('/api/film-folders', { teamId, name: newName });
    if (data) {
      setNewName('');
      setCreating(false);
      if (data.folder?.id) setActiveFolder(data.folder.id);
    }
  }

  async function renameFolder(folder: FolderWithCount) {
    const name = window.prompt('Rename folder', folder.name);
    if (!name || name === folder.name) return;
    await post(`/api/film-folders/${folder.id}`, { name }, 'PATCH');
  }

  async function deleteFolder(folder: FolderWithCount) {
    const ok = window.confirm(
      `Delete the folder "${folder.name}"? The ${folder.video_count} clip${folder.video_count === 1 ? '' : 's'} inside stay in your film library — they just become unfiled.`,
    );
    if (!ok) return;
    const data = await post(`/api/film-folders/${folder.id}`, null, 'DELETE');
    if (data) setActiveFolder(null);
  }

  async function moveSelected(folderId: string | null) {
    if (selected.size === 0) return;
    const data = await post('/api/videos/move', {
      teamId,
      videoIds: [...selected],
      folderId,
    });
    if (data) exitSelectMode();
  }

  const analyzeHref = (() => {
    const params = new URLSearchParams();
    if (selected.size > 0) params.set('videoIds', [...selected].join(','));
    else if (activeFolder && activeFolder !== UNFILED) params.set('folderId', activeFolder);
    const qs = params.toString();
    return `/teams/${teamId}/intelligence${qs ? `?${qs}` : ''}`;
  })();

  return (
    <div className="grid lg:grid-cols-[220px_1fr] gap-6">
      {/* Folder rail */}
      <aside className="space-y-1">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--brand-muted)]">Folders</h2>
          <button
            onClick={() => setCreating((c) => !c)}
            className="p-1 text-[var(--brand-muted)] hover:text-[var(--brand-navy)]"
            title="New folder"
          >
            <FolderPlus size={15} />
          </button>
        </div>

        {creating && (
          <div className="flex items-center gap-1 mb-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createFolder();
                if (e.key === 'Escape') { setCreating(false); setNewName(''); }
              }}
              placeholder="Week 3 vs Wildcats"
              className="min-w-0 flex-1 px-2 py-1.5 rounded-lg border border-[var(--brand-border)] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
            />
            <button
              onClick={createFolder}
              disabled={busy || !newName.trim()}
              className="shrink-0 text-xs font-semibold bg-[var(--brand-navy)] text-white px-2 py-1.5 rounded-lg disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}

        <FolderRow
          label="All film"
          count={videos.length}
          icon={<Layers size={14} />}
          active={activeFolder === null}
          onClick={() => setActiveFolder(null)}
        />
        {folders.map((f) => (
          <FolderRow
            key={f.id}
            label={f.name}
            count={f.video_count}
            icon={<FolderOpen size={14} />}
            active={activeFolder === f.id}
            onClick={() => setActiveFolder(f.id)}
            onRename={() => renameFolder(f)}
            onDelete={() => deleteFolder(f)}
          />
        ))}
        {unfiledCount > 0 && (
          <FolderRow
            label="Unfiled"
            count={unfiledCount}
            icon={<Film size={14} />}
            active={activeFolder === UNFILED}
            onClick={() => setActiveFolder(UNFILED)}
          />
        )}
      </aside>

      {/* Film grid */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-bold text-[var(--brand-navy)]">
              {activeFolder === null ? 'All film' : activeFolder === UNFILED ? 'Unfiled' : currentFolder?.name}
            </h2>
            <p className="text-xs text-[var(--brand-muted)]">
              {visible.length} video{visible.length !== 1 ? 's' : ''}
              {selectMode && selected.size > 0 ? ` · ${selected.size} selected` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {visible.length > 0 && (
              <button
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border border-[var(--brand-border)] text-[var(--brand-ink)] hover:bg-[var(--brand-bg)] transition-colors"
              >
                {selectMode ? <X size={15} /> : <CheckSquare size={15} />}
                {selectMode ? 'Done' : 'Select'}
              </button>
            )}
            <UploadVideoButton
              teamId={teamId}
              teamName={teamName}
              folders={folders.map((f) => ({ id: f.id, name: f.name }))}
              defaultFolderId={activeFolder && activeFolder !== UNFILED ? activeFolder : undefined}
            />
          </div>
        </div>

        {error && (
          <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Bulk action bar */}
        {selectMode && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2.5">
            <button
              onClick={() =>
                setSelected(
                  selected.size === visible.length ? new Set() : new Set(visible.map((v) => v.id)),
                )
              }
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-navy)]"
            >
              {selected.size === visible.length && visible.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
              {selected.size === visible.length && visible.length > 0 ? 'Clear' : 'Select all'}
            </button>

            <span className="text-xs text-[var(--brand-muted)]">Move to</span>
            <select
              value=""
              disabled={busy || selected.size === 0}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                moveSelected(v === UNFILED ? null : v);
                e.target.value = '';
              }}
              className="px-2 py-1.5 rounded-lg border border-[var(--brand-border)] bg-white text-xs disabled:opacity-50"
            >
              <option value="">Choose folder…</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
              <option value={UNFILED}>Unfiled</option>
            </select>

            <Link
              href={analyzeHref}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-colors ${
                selected.size === 0
                  ? 'bg-[var(--brand-navy)]/40 pointer-events-none'
                  : 'bg-[var(--brand-navy)] hover:bg-[var(--brand-navy-dark)]'
              }`}
            >
              <Zap size={13} />
              Analyze {selected.size || ''}
            </Link>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="glass-card p-16 text-center">
            <Film size={48} className="text-[var(--brand-border-strong)] mx-auto mb-4" />
            <h3 className="text-lg font-bold text-[var(--brand-navy)] mb-2">
              {activeFolder === null ? 'No film yet' : 'Nothing in this folder yet'}
            </h3>
            <p className="text-[var(--brand-muted)] text-sm mb-6 max-w-sm mx-auto">
              Upload game or practice film — a single clip or a whole game of single plays — to run
              frame analysis, extract tendencies, and build intelligence reports.
            </p>
            <div className="flex justify-center">
              <UploadVideoButton
                teamId={teamId}
                teamName={teamName}
                folders={folders.map((f) => ({ id: f.id, name: f.name }))}
                defaultFolderId={activeFolder && activeFolder !== UNFILED ? activeFolder : undefined}
              />
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {visible.map((video) => (
              <div key={video.id} className="relative">
                {selectMode && (
                  <button
                    onClick={() => toggle(video.id)}
                    aria-label={selected.has(video.id) ? 'Deselect' : 'Select'}
                    className="absolute inset-0 z-10 rounded-2xl bg-transparent"
                  >
                    <span
                      className={`absolute top-3 left-3 w-6 h-6 rounded-md flex items-center justify-center border-2 ${
                        selected.has(video.id)
                          ? 'bg-[var(--brand-navy)] border-[var(--brand-navy)] text-white'
                          : 'bg-white/90 border-white'
                      }`}
                    >
                      {selected.has(video.id) && <CheckSquare size={13} />}
                    </span>
                  </button>
                )}
                <div className={selected.has(video.id) ? 'ring-2 ring-[var(--brand-navy)] rounded-2xl' : ''}>
                  <VideoCard teamId={teamId} video={video} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FolderRow({
  label,
  count,
  icon,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm transition-colors ${
        active ? 'bg-[var(--brand-navy)] text-white' : 'text-[var(--brand-ink)] hover:bg-[var(--brand-bg)]'
      }`}
    >
      <button onClick={onClick} className="flex items-center gap-2 min-w-0 flex-1 text-left">
        <span className={active ? 'text-white' : 'text-[var(--brand-muted)]'}>{icon}</span>
        <span className="truncate">{label}</span>
        <span className={`ml-auto text-[11px] ${active ? 'text-white/70' : 'text-[var(--brand-muted)]'}`}>
          {count}
        </span>
      </button>
      {(onRename || onDelete) && (
        <span className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          {onRename && (
            <button onClick={onRename} title="Rename" className={active ? 'text-white/80 p-0.5' : 'text-[var(--brand-muted)] p-0.5 hover:text-[var(--brand-navy)]'}>
              <Pencil size={12} />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} title="Delete folder" className={active ? 'text-white/80 p-0.5' : 'text-[var(--brand-muted)] p-0.5 hover:text-red-600'}>
              <Trash2 size={12} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}
