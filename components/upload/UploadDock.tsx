'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Film,
  Loader2,
  RotateCw,
  X,
  XCircle,
} from 'lucide-react';
import { useUploadDock, type UploadItem } from './UploadDockProvider';

function formatEta(seconds: number | null): string {
  if (seconds === null) return 'Estimating…';
  if (seconds <= 0) return 'Almost done';
  if (seconds < 60) return `~${seconds}s remaining`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `~${m}m ${s.toString().padStart(2, '0')}s remaining`;
  const h = Math.floor(m / 60);
  return `~${h}h ${(m % 60).toString().padStart(2, '0')}m remaining`;
}

const STATUS_LABEL: Record<UploadItem['status'], string> = {
  queued: 'Queued',
  uploading: 'Uploading',
  finalizing: 'Finishing up',
  complete: 'Uploaded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function ItemRow({ item }: { item: UploadItem }) {
  const { retry, cancel, remove } = useUploadDock();
  const inFlight = item.status === 'uploading' || item.status === 'finalizing' || item.status === 'queued';

  return (
    <li className="px-4 py-2.5 border-t border-[var(--brand-border)] first:border-t-0">
      <div className="flex items-center gap-2.5">
        <div className="shrink-0">
          {item.status === 'complete' ? (
            <CheckCircle2 size={16} className="text-emerald-500" />
          ) : item.status === 'failed' ? (
            <XCircle size={16} className="text-red-500" />
          ) : item.status === 'cancelled' ? (
            <XCircle size={16} className="text-[var(--brand-muted)]" />
          ) : item.status === 'queued' ? (
            <Film size={16} className="text-[var(--brand-muted)]" />
          ) : (
            <Loader2 size={16} className="text-[var(--brand-navy)] animate-spin" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--brand-ink)] truncate">{item.title}</p>
            <span className="text-[10px] text-[var(--brand-muted)] shrink-0">
              {item.status === 'uploading' ? `${item.progress}%` : STATUS_LABEL[item.status]}
            </span>
          </div>

          {(item.status === 'uploading' || item.status === 'queued') && (
            <div className="mt-1 w-full h-1 bg-[var(--brand-border)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--brand-navy)] transition-all duration-300"
                style={{ width: `${item.status === 'queued' ? 0 : item.progress}%` }}
              />
            </div>
          )}

          {item.status === 'complete' && item.videoId && (
            <Link
              href={`/teams/${item.teamId}/film/${item.videoId}`}
              className="text-[10px] text-[var(--brand-navy)] hover:underline"
            >
              View film →
            </Link>
          )}

          {item.status === 'failed' && item.error && (
            <p className="text-[10px] text-red-600 line-clamp-2 mt-0.5">{item.error}</p>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-1">
          {item.status === 'failed' && (
            <button
              onClick={() => retry(item.id)}
              className="p-1 text-[var(--brand-muted)] hover:text-[var(--brand-navy)]"
              title="Retry"
            >
              <RotateCw size={13} />
            </button>
          )}
          {inFlight ? (
            <button
              onClick={() => cancel(item.id)}
              className="p-1 text-[var(--brand-muted)] hover:text-red-600"
              title="Cancel"
            >
              <X size={13} />
            </button>
          ) : (
            <button
              onClick={() => remove(item.id)}
              className="p-1 text-[var(--brand-muted)] hover:text-[var(--brand-ink)]"
              title="Dismiss"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function UploadDock() {
  const { items, activeCount, overallProgress, etaSeconds, clearFinished } = useUploadDock();
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  const completeCount = items.filter((i) => i.status === 'complete').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const allDone = activeCount === 0;

  const heading = allDone
    ? failedCount > 0
      ? `${completeCount} uploaded · ${failedCount} failed`
      : `${completeCount} video${completeCount !== 1 ? 's' : ''} uploaded`
    : `Uploading ${activeCount} video${activeCount !== 1 ? 's' : ''}`;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-2xl border border-[var(--brand-border)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--brand-navy)] text-white">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{heading}</p>
          {!allDone && <p className="text-[11px] text-white/70">{formatEta(etaSeconds)}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {allDone && (
            <button
              onClick={clearFinished}
              className="text-[11px] font-medium text-white/80 hover:text-white px-1.5"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1 text-white/80 hover:text-white"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Overall progress bar */}
      {!allDone && (
        <div className="h-1 bg-[var(--brand-border)]">
          <div
            className="h-full bg-[var(--brand-gold,#d2c600)] transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      )}

      {/* Item list */}
      {!collapsed && (
        <ul className="max-h-72 overflow-y-auto">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
