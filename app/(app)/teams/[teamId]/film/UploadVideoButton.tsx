'use client';

import { useMemo, useRef, useState } from 'react';
import { Upload, X, Film, Plus } from 'lucide-react';
import { useUploadDock, MAX_FILE_BYTES, MAX_BATCH_FILES } from '@/components/upload/UploadDockProvider';

const MAX_FILE_GB = Math.round(MAX_FILE_BYTES / (1024 * 1024 * 1024));

interface Props {
  teamId: string;
  teamName?: string;
  variant?: 'default' | 'primary';
}

interface PendingFile {
  id: string;
  file: File;
  title: string;
  tooBig: boolean;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

let rowId = 0;

export default function UploadVideoButton({ teamId, teamName }: Props) {
  const { enqueue } = useUploadDock();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const next: PendingFile[] = Array.from(fileList).map((file) => {
      rowId += 1;
      return {
        id: `row_${rowId}`,
        file,
        title: file.name.replace(/\.[^.]+$/, ''),
        tooBig: file.size > MAX_FILE_BYTES,
      };
    });
    setPending((prev) => [...prev, ...next]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    // Reset so re-selecting the same file still fires onChange.
    e.target.value = '';
  }

  function updateTitle(id: string, title: string) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)));
  }

  function removeRow(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  function reset() {
    setOpen(false);
    setPending([]);
  }

  const validFiles = useMemo(() => pending.filter((p) => !p.tooBig), [pending]);
  const hasOversize = pending.some((p) => p.tooBig);
  const overBatch = validFiles.length > MAX_BATCH_FILES;

  function startUploads() {
    if (validFiles.length === 0) return;
    enqueue(
      validFiles.map((p) => ({
        file: p.file,
        title: p.title.trim() || p.file.name,
        teamId,
        teamName,
      })),
    );
    reset();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-[var(--brand-navy)] text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors"
      >
        <Upload size={16} />
        Upload Film
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-[var(--brand-navy)] text-lg">Upload Film</h2>
              <button
                onClick={reset}
                className="p-1 text-[var(--brand-muted)] hover:text-[var(--brand-ink)]"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-[var(--brand-muted)] mb-4">
              Add one clip or a whole batch — a drive, a series, or a full game of single plays.
              Uploads keep running while you use the rest of PlayScout.
            </p>

            {/* Drop / select zone */}
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors border-[var(--brand-border-strong)] hover:border-[var(--brand-navy)] hover:bg-[var(--brand-bg)]"
            >
              <Film size={26} className="mx-auto mb-2 text-[var(--brand-muted)]" />
              <p className="text-sm font-semibold text-[var(--brand-ink)]">
                {pending.length > 0 ? 'Add more videos' : 'Click or drop videos to select'}
              </p>
              <p className="text-xs text-[var(--brand-muted)] mt-1">
                MP4, MOV, AVI up to {MAX_FILE_GB}GB each · up to {MAX_BATCH_FILES} at once
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Selected files */}
            {pending.length > 0 && (
              <div className="mt-4 flex-1 overflow-y-auto -mx-1 px-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[var(--brand-ink)]">
                    {pending.length} file{pending.length !== 1 ? 's' : ''} selected
                  </span>
                  <button
                    onClick={() => setPending([])}
                    className="text-[11px] text-[var(--brand-muted)] hover:text-red-600"
                  >
                    Remove all
                  </button>
                </div>
                <ul className="space-y-2">
                  {pending.map((p) => (
                    <li
                      key={p.id}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                        p.tooBig ? 'border-red-200 bg-red-50' : 'border-[var(--brand-border)]'
                      }`}
                    >
                      <Film size={15} className="shrink-0 text-[var(--brand-muted)]" />
                      <div className="min-w-0 flex-1">
                        <input
                          value={p.title}
                          onChange={(e) => updateTitle(p.id, e.target.value)}
                          className="w-full bg-transparent text-sm font-medium text-[var(--brand-ink)] focus:outline-none"
                          placeholder="Title"
                        />
                        <p className="text-[10px] text-[var(--brand-muted)] truncate">
                          {p.file.name} · {formatBytes(p.file.size)}
                          {p.tooBig && <span className="text-red-600 font-semibold"> · exceeds {MAX_FILE_GB}GB</span>}
                        </p>
                      </div>
                      <button
                        onClick={() => removeRow(p.id)}
                        className="shrink-0 p-1 text-[var(--brand-muted)] hover:text-red-600"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasOversize && (
              <p className="mt-3 text-xs text-red-600">
                Files over {MAX_FILE_GB}GB will be skipped.
              </p>
            )}

            {overBatch && (
              <p className="mt-3 text-xs text-amber-600">
                That&apos;s a lot of film — {validFiles.length} clips. They&apos;ll upload a few at a
                time in the background and may take a while.
              </p>
            )}

            <div className="flex gap-3 pt-4 mt-auto">
              <button
                type="button"
                onClick={reset}
                className="flex-1 py-2.5 rounded-lg border border-[var(--brand-border)] text-sm font-semibold text-[var(--brand-muted)] hover:bg-[var(--brand-bg)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={startUploads}
                disabled={validFiles.length === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white font-semibold py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-50"
              >
                {pending.length > 1 ? <Plus size={15} /> : <Upload size={15} />}
                {validFiles.length > 1
                  ? `Upload ${validFiles.length} videos`
                  : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
