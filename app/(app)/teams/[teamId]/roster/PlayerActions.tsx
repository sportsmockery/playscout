'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { X, Trash2 } from 'lucide-react';
import type { Player } from '@/lib/db/types';

const POSITIONS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'C', 'OG', 'OT', 'DE', 'DT', 'LB', 'CB', 'SS', 'FS', 'K', 'P', 'LS'];

export default function PlayerActions({ player }: { player: Player }) {
  const router = useRouter();
  const supabase = createBrowserClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: player.first_name ?? '',
    lastName: player.last_name ?? '',
    jersey: player.jersey_number != null ? String(player.jersey_number) : '',
    position: player.primary_position ?? '',
    grade: player.grade_level ?? '',
    status: player.status ?? 'active',
  });

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const { error: updateErr } = await supabase
      .from('players')
      .update({
        first_name: form.firstName,
        last_name: form.lastName,
        jersey_number: form.jersey ? parseInt(form.jersey) : null,
        primary_position: form.position || null,
        grade_level: form.grade || null,
        status: form.status || 'active',
      })
      .eq('id', player.id);

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }
    setOpen(false);
    setSaving(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove ${player.first_name} ${player.last_name} from the roster?`)) return;
    setDeleting(true);
    const { error: deleteErr } = await supabase.from('players').delete().eq('id', player.id);
    if (deleteErr) {
      setError(deleteErr.message);
      setDeleting(false);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors"
      >
        Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[var(--brand-navy)] text-lg">Edit Player</h2>
              <button onClick={() => setOpen(false)} className="p-1 text-[var(--brand-muted)] hover:text-[var(--brand-ink)]">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">First Name *</label>
                  <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Last Name *</label>
                  <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Jersey #</label>
                  <input type="number" min="0" max="99" value={form.jersey} onChange={(e) => setForm({ ...form, jersey: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Position</label>
                  <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className={inputClass}>
                    <option value="">Select</option>
                    {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Grade / Age Group</label>
                  <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                    <option value="active">Active</option>
                    <option value="injured">Injured</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={remove}
                  disabled={deleting}
                  className="flex items-center gap-1.5 py-2.5 px-3 rounded-lg border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  {deleting ? 'Removing...' : 'Remove'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white font-semibold py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-60"
                >
                  {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
