import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUploadStore } from '@/stores/uploadStore';
import { startVideoUpload, type UploadHandle } from './uploadManager';
import { completeUpload } from '@/lib/api/endpoints';

/** Module-level handle registry so cancel works from any screen. */
const handles = new Map<string, UploadHandle>();

export async function cancelUpload(id: string): Promise<void> {
  const handle = handles.get(id);
  if (handle) await handle.abort(true).catch(() => {});
  handles.delete(id);
  useUploadStore.getState().update(id, { status: 'cancelled' });
}

export function retryUpload(id: string): void {
  useUploadStore.getState().update(id, { status: 'queued', error: undefined });
}

/**
 * Mounted once inside the authenticated app. Watches the persistent upload
 * queue and ensures every queued item is actively uploading. Uploads survive
 * screen navigation because this lives above the tabs. On success it registers
 * the completed upload through the existing API route exactly once (guarded by
 * videoId), so retries never create duplicate video rows.
 */
export function UploadRunner() {
  const queryClient = useQueryClient();
  const items = useUploadStore((s) => s.items);
  const update = useUploadStore((s) => s.update);
  const starting = useRef(new Set<string>());

  useEffect(() => {
    for (const item of Object.values(items)) {
      if (item.status !== 'queued') continue;
      if (starting.current.has(item.id) || handles.has(item.id)) continue;
      starting.current.add(item.id);
      update(item.id, { status: 'uploading', error: undefined });

      startVideoUpload(item, {
        onProgress: (bytesUploaded) => update(item.id, { bytesUploaded }),
        onUrl: (tusUrl) => {
          if (item.tusUrl !== tusUrl) update(item.id, { tusUrl });
        },
        onError: (message) => {
          handles.delete(item.id);
          starting.current.delete(item.id);
          update(item.id, { status: 'failed', error: message });
        },
        onSuccess: async () => {
          handles.delete(item.id);
          starting.current.delete(item.id);
          try {
            const current = useUploadStore.getState().items[item.id];
            if (current?.videoId) {
              update(item.id, { status: 'completed' });
            } else {
              const { videoId } = await completeUpload({
                storagePath: item.storagePath,
                teamId: item.teamId,
                title: item.title,
                opponentId: item.opponentId,
                uploadId: item.id,
              });
              update(item.id, { status: 'completed', videoId });
            }
            queryClient.invalidateQueries({ queryKey: ['film'] });
            queryClient.invalidateQueries({ queryKey: ['home'] });
          } catch {
            update(item.id, { status: 'failed', error: 'Upload finished but we couldn’t register it. Retry to finish.' });
          }
        },
      })
        .then((handle) => {
          handles.set(item.id, handle);
        })
        .catch(() => {
          starting.current.delete(item.id);
          update(item.id, { status: 'failed', error: 'Could not start upload.' });
        });
    }
  }, [items, update, queryClient]);

  return null;
}
