'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { Upload, X, Film } from 'lucide-react';

interface Props {
  teamId: string;
  variant?: 'default' | 'primary';
}

export default function UploadVideoButton({ teamId, variant = 'default' }: Props) {
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
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError('');
    setProgress(10);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Insert video record first
    const { data: videoRecord, error: insertErr } = await supabase
      .from('videos')
      .insert({
        team_id: teamId,
        title: title || file.name,
        file_size: file.size,
        mime_type: file.type,
        status: 'uploading',
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (insertErr) {
      setError(insertErr.message);
      setUploading(false);
      return;
    }

    setProgress(30);

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop();
    const path = `${teamId}/${videoRecord.id}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('videos')
      .upload(path, file, { upsert: false });

    if (uploadErr) {
      setError(uploadErr.message);
      setUploading(false);
      return;
    }

    setProgress(80);

    // Get public URL
    const { data: { publicUrl } } = supabase.storage.from('videos').getPublicUrl(path);

    // Mark as uploaded
    await supabase
      .from('videos')
      .update({ storage_path: publicUrl, status: 'uploaded' })
      .eq('id', videoRecord.id);

    // Trigger processing
    await fetch('/api/videos/complete-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: videoRecord.id, teamId, fileUrl: publicUrl }),
    });

    setProgress(100);
    setTimeout(() => {
      setOpen(false);
      setFile(null);
      setTitle('');
      setProgress(0);
      setUploading(false);
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
              <button onClick={() => setOpen(false)} className="p-1 text-[var(--brand-muted)] hover:text-[var(--brand-ink)]">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              {/* Drop zone */}
              <div
                onClick={() => inputRef.current?.click()}
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
                    <p className="text-xs text-[var(--brand-muted)] mt-1">MP4, MOV, AVI up to 2GB</p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Week 3 Game Film"
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent"
                />
              </div>

              {uploading && (
                <div>
                  <div className="flex items-center justify-between text-xs text-[var(--brand-muted)] mb-1">
                    <span>Uploading...</span>
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
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2.5 rounded-lg border border-[var(--brand-border)] text-sm font-semibold text-[var(--brand-muted)] hover:bg-[var(--brand-bg)] transition-colors"
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
