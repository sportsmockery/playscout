import { Upload, type UrlStorage } from 'tus-js-client';
import { supabase } from '@/lib/supabase/client';
import { config } from '@/lib/config';
import { AsyncUrlStorage } from '@/lib/tus/urlStorage';
import type { UploadItem } from '@/stores/uploadStore';

export { makeStoragePath } from './paths';

const BUCKET = 'videos';
const CHUNK_SIZE = 6 * 1024 * 1024; // required in RN; also Supabase's expected size

export interface UploadHandle {
  abort: (terminate?: boolean) => Promise<void>;
}

interface UploadCallbacks {
  onProgress: (bytesUploaded: number, bytesTotal: number) => void;
  onUrl: (url: string) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

/**
 * Direct resumable upload of a large video to Supabase Storage over TUS. This
 * NEVER passes through the Next.js app — the file goes straight to storage, and
 * only a small completion call hits the API afterward. Resumable across
 * navigation, backgrounding, and app restarts via AsyncUrlStorage.
 */
export async function startVideoUpload(item: UploadItem, cb: UploadCallbacks): Promise<UploadHandle> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    cb.onError('Your session has expired. Sign in again to upload.');
    return { abort: async () => {} };
  }

  const upload = new Upload(
    // In React Native the file is described by its uri; tus-js-client reads it
    // in chunks. We pass a structural file object accepted by the RN reader.
    { uri: item.fileUri } as unknown as Blob,
    {
      endpoint: `${config.supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 6000, 12000, 24000],
      chunkSize: CHUNK_SIZE,
      removeFingerprintOnSuccess: true,
      // Structurally compatible with tus-js-client's UrlStorage; the cast keeps
      // us decoupled from its exact optional/required field typing.
      urlStorage: new AsyncUrlStorage() as unknown as UrlStorage,
      // Stable per-video fingerprint so the SAME object is resumed, never
      // duplicated, even after the app is killed.
      fingerprint: async () => `playscout/${item.teamId}/${item.storagePath}`,
      uploadDataDuringCreation: false,
      headers: {
        authorization: `Bearer ${token}`,
        'x-upsert': 'true',
      },
      metadata: {
        bucketName: BUCKET,
        objectName: item.storagePath,
        contentType: item.mimeType || 'video/mp4',
        cacheControl: '3600',
      },
      onError: (error) => {
        cb.onError(error instanceof Error ? error.message : 'Upload failed');
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        if (upload.url) cb.onUrl(upload.url);
        cb.onProgress(bytesUploaded, bytesTotal);
      },
      onSuccess: () => {
        cb.onSuccess();
      },
    },
  );

  // Resume a prior attempt for this exact object if one exists.
  const previous = await upload.findPreviousUploads();
  if (previous.length > 0 && previous[0]) {
    upload.resumeFromPreviousUpload(previous[0]);
  }
  upload.start();

  return {
    abort: async (terminate = false) => {
      await upload.abort(terminate);
    },
  };
}
