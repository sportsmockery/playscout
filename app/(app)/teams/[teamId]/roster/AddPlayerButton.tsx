'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { AlertCircle, Plus, X } from 'lucide-react';
import { GRADE_LEVEL_GROUPS } from '@/lib/content/grade-levels';

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
  const [error, setError] = useState('');

  // Lock background scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    jersey: '',
    position: '',
    grade: '',
  });

  async function handleAdd(e: React.FormEvent, keepOpen = false) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: insertError } = await supabase
      .from('players')
      .insert({
        team_id: teamId,
        first_name: form.firstName,
        last_name: form.lastName,
        jersey_number: form.jersey ? parseInt(form.jersey) : null,
        primary_position: form.position || null,
        grade_level: form.grade || null,
        status: 'active',
      })
      .select('id');

    // Row-level security denies by returning zero rows rather than an error,
    // so "no error" is not enough to call this saved — that combination is
    // exactly what made a failed add look like a successful one.
    if (insertError) {
      setError(
        insertError.code === '42501' || /row-level security/i.test(insertError.message)
          ? "You don't have permission to add players to this team. Ask an owner or admin to grant you coach access."
          : insertError.message
      );
      setLoading(false);
      return;
    }
    if (!data?.length) {
      setError(
        "That player wasn't saved — your account doesn't have write access to this team's roster. Ask an owner or admin to grant you coach access."
      );
      setLoading(false);
      return;
    }

    setForm({ firstName: '', lastName: '', jersey: '', position: '', grade: '' });
    if (!keepOpen) setOpen(false);
    router.refresh();
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

      {/* Portal to <body>: rendered inline, this `fixed` overlay would resolve
          its containing block against the nearest ancestor with a
          `backdrop-filter`/`transform` (the empty-state `.glass-card`), which
          mis-sizes it ("cutoff") and repaints the semi-transparent backdrop
          over the blurred card in a loop ("flicker"). `open` starts false, so
          the portal never renders during SSR. */}
      {open && createPortal(
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
                <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Level / Age Group</label>
                <select
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Select</option>
                  {GRADE_LEVEL_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {error && (
                <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="py-2.5 px-3 rounded-lg border border-[var(--brand-border)] text-sm font-semibold text-[var(--brand-muted)] hover:bg-[var(--brand-bg)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={(e) => handleAdd(e, true)}
                  className="flex-1 flex items-center justify-center gap-2 border border-[var(--brand-navy)] text-[var(--brand-navy)] font-semibold py-2.5 rounded-lg hover:bg-[var(--brand-navy)]/5 transition-colors disabled:opacity-60"
                >
                  Save & Add Another
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
        </div>,
        document.body
      )}
    </>
  );
}
