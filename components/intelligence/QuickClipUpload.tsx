'use client';

import { useRef, useState } from 'react';
import { Zap, X, Film } from 'lucide-react';
import { extractFrames, FRAME_COUNT } from '@/lib/video/frame-extraction';

const MAX_CLIP_BYTES = 200 * 1024 * 1024; // 200MB — quick clips only, not full games

interface Props {
  onFramesReady: (frames: string[]) => void;
  onClear: () => void;
  disabled?: boolean;
}

export default function QuickClipUpload({ onFramesReady, onClear, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState('');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setFrameCount(0);

    if (file.size > MAX_CLIP_BYTES) {
      setError('That clip is too large for quick analysis — keep it under 200MB, or upload it as full film instead.');
      return;
    }

    setFileName(file.name);
    setExtracting(true);
    try {
      const frames = await extractFrames(file, FRAME_COUNT);
      setFrameCount(frames.length);
      onFramesReady(frames);
    } catch {
      setError('Could not read frames from this clip. Try a different file or format.');
      setFileName(null);
    } finally {
      setExtracting(false);
    }
  }

  function clear() {
    setFileName(null);
    setFrameCount(0);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
    onClear();
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        disabled={disabled}
        onChange={handleFileChange}
      />

      {!fileName ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[var(--brand-border-strong)] rounded-lg py-3 text-sm font-semibold text-[var(--brand-muted)] hover:border-[var(--brand-navy)] hover:text-[var(--brand-navy)] transition-colors disabled:opacity-60"
        >
          <Film size={15} />
          Select a short clip instead
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2 border border-[var(--brand-border)] rounded-lg px-3 py-2.5 bg-[var(--brand-bg)]">
          <div className="flex items-center gap-2 min-w-0">
            {extracting ? (
              <span className="w-3.5 h-3.5 border-2 border-[var(--brand-border)] border-t-[var(--brand-navy)] rounded-full animate-spin flex-shrink-0" />
            ) : (
              <Zap size={14} className="text-[var(--brand-gold)] flex-shrink-0" />
            )}
            <span className="text-xs font-medium text-[var(--brand-ink)] truncate">
              {extracting ? `Extracting frames from ${fileName}...` : `${frameCount} frames ready from ${fileName}`}
            </span>
          </div>
          <button type="button" onClick={clear} className="text-[var(--brand-muted)] hover:text-[var(--brand-ink)] flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 mt-1.5">{error}</p>
      )}

      <p className="text-[11px] text-[var(--brand-muted)] mt-1.5">
        Quick clips are analyzed directly from the file in your browser — no need to wait for full film processing.
      </p>
    </div>
  );
}
