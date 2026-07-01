'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { Plus, X } from 'lucide-react';

interface Props {
  teamId: string;
  variant?: 'default' | 'primary';
}

const POSITIONS = ['QB','RB','FB','WR','TE','OL','C','OG','OT','DE','DT','LB','CB','SS','FS','K','P','LS'];

export default function AddPlayerButton({ teamId, variant = 'default' }: Props) {
  const router = useRouter();
  const supabase = createBrowserClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    jersey: '',
    position: '',
    grade: '',
  });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from('players').insert({
      team_id: teamId,
      first_name: form.firstName,
      last_name: form.lastName,
      jersey_number: form.jersey ? parseInt(form.jersey) : null,
      primary_position: form.position || null,
      grade_level: form.grade || null,
      status: 'active',
    });

    if (!error) {
      setOpen(false);
      setForm({ firstName: '', lastName: '', jersey: '', position: '', grade: '' });
      router.refresh();
    }

    setLoading(false);
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all placeholder:text-[var(--brand-muted)]';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors ${
          variant === 'primary'
            ? 'bg-[var(--brand-navy)] text-white hover:bg-[var(--brand-navy-dark)]'
            : 'bg-[var(--brand-navy)] text-white hover:bg-[var(--brand-navy-dark)]'
        }`}
      >
        <Plus size={16} />
        Add Player
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[var(--brand-navy)] text-lg">Add Player</h2>
              <button onClick={() => setOpen(false)} className="p-1 text-[var(--brand-muted)] hover:text-[var(--brand-ink)]">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">First Name *</label>
                  <input
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    placeholder="First"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Last Name *</label>
                  <input
                    required
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    placeholder="Last"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Jersey #</label>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={form.jersey}
                    onChange={(e) => setForm({ ...form, jersey: e.target.value })}
                    placeholder="00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Position</label>
                  <select
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Select</option>
                    {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Grade / Age Group</label>
                <input
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                  placeholder="e.g. 8th grade, 12U"
                  className={inputClass}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2.5 rounded-lg border border-[var(--brand-border)] text-sm font-semibold text-[var(--brand-muted)] hover:bg-[var(--brand-bg)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white font-semibold py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-60"
                >
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : 'Add Player'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
