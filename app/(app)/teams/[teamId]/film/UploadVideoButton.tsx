'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { Upload, X, Film } from 'lucide-react';

interface Props {
  teamId: string;
  variant?: 'default' | 'primary';
}

// Supabase Storage resumable (TUS) uploads must use a 6MB chunk size.
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024; // 4GB — matches Mode 2 full-game ceiling

export default function UploadVideoButton({ teamId }: Props) {
  const router = useRouter();
  const supabase = createBrowserClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError('');
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  function resetForm() {
    setOpen(false);
    setFile(null);
    setTitle('');
    setProgress(0);
    setUploading(false);
    setError('');
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || uploading) return;

    if (file.size > MAX_FILE_BYTES) {
      setError('File is larger than the 4GB limit.');
      return;
    }

    setUploading(true);
    setError('');
    setProgress(0);

    // Auth: we need both the user id (for the upload record) and the access
    // token (for the resumable upload endpoint's Authorization header).
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!session || !user) {
      setError('Your session has expired. Please sign in again.');
      setUploading(false);
      return;
    }

    // 1. Create the upload-tracking record up front so we always have an id
    //    for the storage object path and can record failures against it.
    const { data: uploadRecord, error: insertErr } = await supabase
      .from('video_uploads')
      .insert({
        team_id: teamId,
        user_id: user.id,
        original_filename: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || 'video/mp4',
        storage_bucket: 'videos',
        upload_status: 'uploading',
      })
      .select()
      .single();

    if (insertErr || !uploadRecord) {
      setError(insertErr?.message ?? 'Could not start the upload.');
      setUploading(false);
      return;
    }

    const ext = file.name.split('.').pop() || 'mp4';
    const objectName = `${teamId}/${uploadRecord.id}.${ext}`;

    // Browsers report .mov/.mp4 phone footage as video/quicktime — Chrome
    // and Firefox refuse to play that Content-Type in a <video> tag even
    // though the underlying H.264/AAC bitstream is fine. Store it as
    // video/mp4 instead so playback actually works cross-browser.
    const storageContentType = file.type === 'video/quicktime' ? 'video/mp4' : (file.type || 'video/mp4');

    // 2. Resumable (TUS) upload straight to Supabase Storage — never through a
    //    Next.js route. Large game film can be paused/resumed and reports real
    //    progress.
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
      data: file,
      meta: {
        bucketName: 'videos',
        objectName,
        contentType: storageContentType,
        cacheControl: '3600',
      },
    });

    uppy.on('progress', (pct) => setProgress(pct));

    async function markFailed(message: string) {
      await supabase
        .from('video_uploads')
        .update({ upload_status: 'failed', error_message: message })
        .eq('id', uploadRecord!.id);
    }

    let result;
    try {
      result = await uppy.upload();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      await markFailed(message);
      setError(message);
      setUploading(false);
      return;
    }

    if (!result || result.failed?.length || !result.successful?.length) {
      const message = result?.failed?.[0]?.error ?? 'Upload failed.';
      await markFailed(message);
      setError(message);
      setUploading(false);
      return;
    }

    // 3. Finalize server-side: create the video row, mark the upload complete,
    //    and queue the processing pipeline.
    const res = await fetch('/api/videos/complete-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: uploadRecord.id,
        storagePath: objectName,
        teamId,
        title: title || file.name,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body.error ?? 'Could not finalize the upload.';
      await markFailed(message);
      setError(message);
      setUploading(false);
      return;
    }

    setProgress(100);
    setTimeout(() => {
      resetForm();
      router.refresh();
    }, 500);
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[var(--brand-navy)] text-lg">Upload Film</h2>
              <button
                onClick={resetForm}
                disabled={uploading}
                className="p-1 text-[var(--brand-muted)] hover:text-[var(--brand-ink)] disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              {/* Drop zone */}
              <div
                onClick={() => !uploading && inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  file
                    ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)]/5'
                    : 'border-[var(--brand-border-strong)] hover:border-[var(--brand-navy)] hover:bg-[var(--brand-bg)]'
                }`}
              >
                <Film size={28} className="mx-auto mb-2 text-[var(--brand-muted)]" />
                {file ? (
                  <p className="text-sm font-semibold text-[var(--brand-navy)]">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[var(--brand-ink)]">Click to select video</p>
                    <p className="text-xs text-[var(--brand-muted)] mt-1">MP4, MOV, AVI up to 4GB</p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={handleFileChange}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Week 3 Game Film"
                  disabled={uploading}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent disabled:opacity-60"
                />
              </div>

              {uploading && (
                <div>
                  <div className="flex items-center justify-between text-xs text-[var(--brand-muted)] mb-1">
                    <span>Uploading {file?.name}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-[var(--brand-border)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand-navy)] transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2.5 rounded-lg border border-[var(--brand-border)] text-sm font-semibold text-[var(--brand-muted)] hover:bg-[var(--brand-bg)] transition-colors disabled:opacity-40"
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!file || uploading}
                  className="flex-1 flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white font-semibold py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-60"
                >
                  {uploading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Upload size={15} />
                      Upload
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
