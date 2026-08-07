'use client';

import { useState } from 'react';
import { Trash2, Plus, Save } from 'lucide-react';
import type { PlaySequence } from '@/lib/db/types';

interface Props {
  teamId: string;
  videoId: string;
  durationSeconds: number | null;
  initialPlaySequences: PlaySequence[];
}

function formatTime(seconds?: number) {
  if (seconds === undefined || seconds === null) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface EditableFields {
  start_time_seconds: string;
  end_time_seconds: string;
  down: string;
  distance: string;
  yard_line: string;
  coach_label: string;
  result: string;
}

function toEditable(p: PlaySequence): EditableFields {
  return {
    start_time_seconds: p.start_time_seconds != null ? String(p.start_time_seconds) : '',
    end_time_seconds: p.end_time_seconds != null ? String(p.end_time_seconds) : '',
    down: p.down != null ? String(p.down) : '',
    distance: p.distance != null ? String(p.distance) : '',
    yard_line: p.yard_line ?? '',
    coach_label: p.coach_label ?? '',
    result: p.result ?? '',
  };
}

function PlayCard({
  teamId, play, onSaved, onDeleted,
}: {
  teamId: string;
  play: PlaySequence;
  onSaved: (updated: PlaySequence) => void;
  onDeleted: (id: string) => void;
}) {
  const [fields, setFields] = useState<EditableFields>(toEditable(play));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  function update<K extends keyof EditableFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/play-sequences/${play.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_time_seconds: fields.start_time_seconds ? Number(fields.start_time_seconds) : null,
          end_time_seconds: fields.end_time_seconds ? Number(fields.end_time_seconds) : null,
          down: fields.down ? Number(fields.down) : null,
          distance: fields.distance ? Number(fields.distance) : null,
          yard_line: fields.yard_line || null,
          coach_label: fields.coach_label || null,
          result: fields.result || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onSaved(data.playSequence);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this play sequence?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/play-sequences/${play.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      onDeleted(play.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  }

  const inputClass =
    'w-full px-2 py-1.5 rounded-md border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]';

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-[var(--brand-navy)] uppercase tracking-wide">
          Play {play.sequence_number} · {formatTime(Number(fields.start_time_seconds))}–{formatTime(Number(fields.end_time_seconds))}
        </span>
        <button onClick={remove} disabled={deleting} className="text-red-500 hover:text-red-700 disabled:opacity-50">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <div>
          <label className="block text-[10px] text-[var(--brand-muted)] mb-0.5">Start (s)</label>
          <input type="number" step="0.1" className={inputClass} value={fields.start_time_seconds} onChange={(e) => update('start_time_seconds', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--brand-muted)] mb-0.5">End (s)</label>
          <input type="number" step="0.1" className={inputClass} value={fields.end_time_seconds} onChange={(e) => update('end_time_seconds', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--brand-muted)] mb-0.5">Down</label>
          <input type="number" className={inputClass} value={fields.down} onChange={(e) => update('down', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--brand-muted)] mb-0.5">Distance</label>
          <input type="number" className={inputClass} value={fields.distance} onChange={(e) => update('distance', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--brand-muted)] mb-0.5">Yard Line</label>
          <input type="text" className={inputClass} value={fields.yard_line} onChange={(e) => update('yard_line', e.target.value)} placeholder="e.g. OWN 35" />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--brand-muted)] mb-0.5">Result</label>
          <input type="text" className={inputClass} value={fields.result} onChange={(e) => update('result', e.target.value)} placeholder="e.g. 8-yard run" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-[var(--brand-muted)] mb-0.5">Coach Label</label>
          <input type="text" className={inputClass} value={fields.coach_label} onChange={(e) => update('coach_label', e.target.value)} placeholder="e.g. Iso Right, 3rd quarter" />
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <button
        onClick={save}
        disabled={saving || !dirty}
        className="flex items-center gap-1.5 text-xs font-semibold bg-[var(--brand-navy)] text-white px-3 py-1.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-40"
      >
        <Save size={12} />
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

export default function PlaySequencesClient({ teamId, videoId, durationSeconds, initialPlaySequences }: Props) {
  const [plays, setPlays] = useState<PlaySequence[]>(initialPlaySequences);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  async function addPlay() {
    if (!newStart || !newEnd) return;
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/play-sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId, videoId,
          startTimeSeconds: Number(newStart),
          endTimeSeconds: Number(newEnd),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add play');
      setPlays((prev) => [...prev, data.playSequence].sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0)));
      setNewStart('');
      setNewEnd('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add play');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      {plays.map((p) => (
        <PlayCard
          key={p.id}
          teamId={teamId}
          play={p}
          onSaved={(updated) => setPlays((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
          onDeleted={(id) => setPlays((prev) => prev.filter((x) => x.id !== id))}
        />
      ))}

      <div className="glass-card p-4">
        <h3 className="text-xs font-bold text-[var(--brand-navy)] uppercase tracking-wide mb-3">Add a Play</h3>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-[10px] text-[var(--brand-muted)] mb-0.5">Start (seconds)</label>
            <input
              type="number" step="0.1" value={newStart} onChange={(e) => setNewStart(e.target.value)}
              className="w-28 px-2 py-1.5 rounded-md border border-[var(--brand-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
            />
          </div>
          <div>
            <label className="block text-[10px] text-[var(--brand-muted)] mb-0.5">End (seconds)</label>
            <input
              type="number" step="0.1" value={newEnd} onChange={(e) => setNewEnd(e.target.value)}
              className="w-28 px-2 py-1.5 rounded-md border border-[var(--brand-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
            />
          </div>
          <button
            onClick={addPlay}
            disabled={adding || !newStart || !newEnd}
            className="flex items-center gap-1.5 text-xs font-semibold bg-[var(--brand-navy)] text-white px-3 py-2 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-40"
          >
            <Plus size={14} />
            {adding ? 'Adding...' : 'Add Play'}
          </button>
          {durationSeconds && (
            <span className="text-xs text-[var(--brand-muted)]">Film length: {formatTime(durationSeconds)}</span>
          )}
        </div>
        {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
      </div>
    </div>
  );
}
