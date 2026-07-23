'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { createClient as createBrowserClient } from '@/lib/supabase/client';

// Supabase Storage resumable (TUS) uploads must use a 6MB chunk size.
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;
export const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024; // 4GB — Mode 2 full-game ceiling
// Upload a few clips at a time. Coaches often batch 10–20 single-play Hudl
// downloads; a small concurrency keeps the UI responsive without saturating
// the connection so badly that any single large file stalls.
const MAX_CONCURRENT = 3;

export type UploadStatus =
  | 'queued'
  | 'uploading'
  | 'finalizing'
  | 'complete'
  | 'failed'
  | 'cancelled';

export interface UploadItem {
  id: string;
  file: File;
  title: string;
  teamId: string;
  teamName?: string;
  status: UploadStatus;
  progress: number; // 0–100 for this file
  bytesUploaded: number;
  error?: string;
  uploadRecordId?: string;
  videoId?: string;
  startedAt?: number; // epoch ms this file actually began uploading (for ETA)
}

interface EnqueueInput {
  file: File;
  title: string;
  teamId: string;
  teamName?: string;
}

interface UploadDockContextValue {
  items: UploadItem[];
  enqueue: (inputs: EnqueueInput[]) => void;
  retry: (id: string) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
  activeCount: number;
  overallProgress: number; // 0–100 across the in-flight batch
  etaSeconds: number | null;
}

const UploadDockContext = createContext<UploadDockContextValue | null>(null);

export function useUploadDock() {
  const ctx = useContext(UploadDockContext);
  if (!ctx) throw new Error('useUploadDock must be used within UploadDockProvider');
  return ctx;
}

const TERMINAL: UploadStatus[] = ['complete', 'failed', 'cancelled'];
const isActive = (s: UploadStatus) => !TERMINAL.includes(s);
const itemActive = (i: UploadItem) => isActive(i.status);

let clientIdCounter = 0;
function nextClientId() {
  clientIdCounter += 1;
  return `up_${Date.now().toString(36)}_${clientIdCounter}`;
}

export default function UploadDockProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = createBrowserClient();

  // `items` is the render source of truth; updates are immutable so React's
  // compiler lint stays happy. Control-flow-only bookkeeping lives in refs.
  const [items, setItems] = useState<UploadItem[]>([]);
  const [now, setNow] = useState(0);

  // Non-render bookkeeping: which ids have a runUpload in flight (guards the
  // pump against double-starting the same file), the Uppy instance per id (so
  // cancel can abort it), and cancelled ids (so a resolving upload doesn't
  // clobber the cancelled status).
  const runningRef = useRef<Set<string>>(new Set());
  const uppyRef = useRef<Map<string, Uppy>>(new Map());
  const cancelledRef = useRef<Set<string>>(new Set());

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  }, []);

  const runUpload = useCallback(
    async (item: UploadItem) => {
      patch(item.id, { status: 'uploading', startedAt: Date.now(), error: undefined });

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!session || !user) {
        patch(item.id, {
          status: 'failed',
          error: 'Your session expired. Please sign in again.',
        });
        return;
      }

      // 1. Upload-tracking record — gives us a stable object path and a row to
      //    record failures against.
      const { data: uploadRecord, error: insertErr } = await supabase
        .from('video_uploads')
        .insert({
          team_id: item.teamId,
          user_id: user.id,
          original_filename: item.file.name,
          file_size_bytes: item.file.size,
          mime_type: item.file.type || 'video/mp4',
          storage_bucket: 'videos',
          upload_status: 'uploading',
        })
        .select()
        .single();

      if (insertErr || !uploadRecord) {
        patch(item.id, {
          status: 'failed',
          error: insertErr?.message ?? 'Could not start the upload.',
        });
        return;
      }
      patch(item.id, { uploadRecordId: uploadRecord.id });

      const ext = item.file.name.split('.').pop() || 'mp4';
      const objectName = `${item.teamId}/${uploadRecord.id}.${ext}`;

      // Phones report .mov/.mp4 footage as video/quicktime, which browsers
      // refuse to play in a <video> tag even though the H.264/AAC bitstream is
      // fine. Store it as video/mp4 so playback works cross-browser.
      const storageContentType =
        item.file.type === 'video/quicktime' ? 'video/mp4' : item.file.type || 'video/mp4';

      const uppy = new Uppy({ autoProceed: false, allowMultipleUploadBatches: false });
      uppy.use(Tus, {
        endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'x-upsert': 'true',
        },
        chunkSize: TUS_CHUNK_SIZE,
        allowedMetaFields: ['bucketName', 'objectName', 'contentType', 'cacheControl'],
        removeFingerprintOnSuccess: true,
      });

      uppy.addFile({
        name: objectName,
        type: storageContentType,
        data: item.file,
        meta: {
          bucketName: 'videos',
          objectName,
          contentType: storageContentType,
          cacheControl: '3600',
        },
      });

      uppy.on('upload-progress', (_file, prog) => {
        if (!prog || !prog.bytesTotal) return;
        const pct = Math.round((prog.bytesUploaded / prog.bytesTotal) * 100);
        patch(item.id, { bytesUploaded: prog.bytesUploaded, progress: pct });
      });

      uppyRef.current.set(item.id, uppy);

      const markFailed = async (message: string) => {
        await supabase
          .from('video_uploads')
          .update({ upload_status: 'failed', error_message: message })
          .eq('id', uploadRecord.id);
      };

      let result;
      try {
        result = await uppy.upload();
      } catch (err) {
        // A cancel() aborts the upload — don't overwrite that status.
        if (cancelledRef.current.has(item.id)) return;
        const message = err instanceof Error ? err.message : 'Upload failed.';
        await markFailed(message);
        patch(item.id, { status: 'failed', error: message });
        return;
      } finally {
        uppyRef.current.delete(item.id);
      }

      if (cancelledRef.current.has(item.id)) return;

      if (!result || result.failed?.length || !result.successful?.length) {
        const raw: unknown = result?.failed?.[0]?.error;
        const message =
          (typeof raw === 'string' ? raw : (raw as Error | undefined)?.message) ?? 'Upload failed.';
        await markFailed(message);
        patch(item.id, { status: 'failed', error: message });
        return;
      }

      // 2. Finalize: create the video row, mark the upload complete, queue the
      //    processing pipeline.
      patch(item.id, { status: 'finalizing', progress: 100, bytesUploaded: item.file.size });
      try {
        const res = await fetch('/api/videos/complete-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId: uploadRecord.id,
            storagePath: objectName,
            teamId: item.teamId,
            title: item.title || item.file.name,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'Could not finalize the upload.');
        }
        const body = await res.json().catch(() => ({}));
        patch(item.id, { status: 'complete', videoId: body.videoId });
        // Surface the new video wherever the coach currently is (the film page
        // re-fetches its server data). Harmless on other routes.
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not finalize the upload.';
        await markFailed(message);
        patch(item.id, { status: 'failed', error: message });
      }
    },
    [patch, router, supabase],
  );

  // Pump: whenever the queue changes, keep up to MAX_CONCURRENT uploads in
  // flight. Driven by an effect (not a self-referential callback) so it always
  // reacts to the latest state.
  useEffect(() => {
    const running = items.filter(
      (i) => i.status === 'uploading' || i.status === 'finalizing',
    ).length;
    let slots = MAX_CONCURRENT - running;
    if (slots <= 0) return;

    for (const item of items) {
      if (slots <= 0) break;
      if (item.status !== 'queued') continue;
      if (runningRef.current.has(item.id)) continue;
      runningRef.current.add(item.id);
      slots -= 1;
      runUpload(item).finally(() => runningRef.current.delete(item.id));
    }
  }, [items, runUpload]);

  // Keep the ETA clock ticking while anything is in flight.
  const anyActive = items.some(itemActive);
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyActive]);

  // Warn before the tab closes mid-upload — TUS uploads can resume, but the
  // in-memory queue can't, so make it a deliberate choice.
  useEffect(() => {
    if (!anyActive) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [anyActive]);

  const enqueue = useCallback((inputs: EnqueueInput[]) => {
    setItems((prev) => [
      ...prev,
      ...inputs.map((input) => ({
        id: nextClientId(),
        file: input.file,
        title: input.title,
        teamId: input.teamId,
        teamName: input.teamName,
        status: 'queued' as UploadStatus,
        progress: 0,
        bytesUploaded: 0,
      })),
    ]);
  }, []);

  const retry = useCallback((id: string) => {
    cancelledRef.current.delete(id);
    runningRef.current.delete(id);
    setItems((prev) =>
      prev.map((i) =>
        i.id === id && i.status === 'failed'
          ? { ...i, status: 'queued', progress: 0, bytesUploaded: 0, error: undefined }
          : i,
      ),
    );
  }, []);

  const cancel = useCallback(
    (id: string) => {
      cancelledRef.current.add(id);
      const uppy = uppyRef.current.get(id);
      if (uppy) {
        try {
          uppy.cancelAll();
        } catch {
          /* uppy may already be torn down */
        }
        uppyRef.current.delete(id);
      }
      runningRef.current.delete(id);
      let recordId: string | undefined;
      setItems((prev) =>
        prev.map((i) => {
          if (i.id === id && isActive(i.status)) {
            recordId = i.uploadRecordId;
            return { ...i, status: 'cancelled' };
          }
          return i;
        }),
      );
      if (recordId) {
        supabase
          .from('video_uploads')
          .update({ upload_status: 'cancelled' })
          .eq('id', recordId)
          .then(() => {});
      }
    },
    [supabase],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => !(i.id === id && !isActive(i.status))));
  }, []);

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter(itemActive));
  }, []);

  // Derived batch stats for the dock.
  const activeCount = items.filter(itemActive).length;

  const batchItems = items.filter((i) => i.status !== 'cancelled');
  const totalBytes = batchItems.reduce((sum, i) => sum + (i.file.size || 0), 0);
  const doneBytes = batchItems.reduce(
    (sum, i) =>
      sum + (i.status === 'complete' || i.status === 'finalizing' ? i.file.size : i.bytesUploaded),
    0,
  );
  const overallProgress =
    totalBytes > 0 ? Math.min(100, Math.round((doneBytes / totalBytes) * 100)) : 0;

  // Batch start = when the earliest still-relevant file began uploading.
  const startTimes = batchItems
    .map((i) => i.startedAt)
    .filter((t): t is number => typeof t === 'number');
  const batchStart = startTimes.length > 0 ? Math.min(...startTimes) : null;

  let etaSeconds: number | null = null;
  if (anyActive && batchStart && now > batchStart && doneBytes > 0) {
    const elapsed = (now - batchStart) / 1000;
    const speed = doneBytes / elapsed; // bytes/sec
    if (speed > 0) {
      const remaining = Math.max(0, totalBytes - doneBytes);
      etaSeconds = Math.round(remaining / speed);
    }
  }

  return (
    <UploadDockContext.Provider
      value={{
        items,
        enqueue,
        retry,
        cancel,
        remove,
        clearFinished,
        activeCount,
        overallProgress,
        etaSeconds,
      }}
    >
      {children}
    </UploadDockContext.Provider>
  );
}
