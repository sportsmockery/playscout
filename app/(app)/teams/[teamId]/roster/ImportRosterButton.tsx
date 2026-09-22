'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { AlertCircle, AlertTriangle, ClipboardList, Check, X } from 'lucide-react';
import { GRADE_LEVEL_GROUPS } from '@/lib/content/grade-levels';
import { parseRoster, normalizeJersey, type ParsedPlayerRow } from '@/lib/roster/parse-roster';

/**
 * Paste a whole roster instead of opening sixty modals.
 *
 * The roster is the gate in front of every per-player feature: RankerIQ
 * refuses a jersey number with no roster to check it against, and StatsIQ can
 * only turn a number it read off the film into a NAME when that number is on
 * file. Entering one player at a time is what kept that gate shut.
 *
 * Nothing is saved until the coach has seen the table. A bad parse here writes
 * one child's season onto another child's page — the same failure the identity
 * gates in lib/intelligence exist to prevent — so the preview is the feature,
 * not a courtesy.
 */

const EXAMPLE = `1 AJ Martino
3 Carter Burhans QB
12 Matteo Lee Barker FB
73 Ahmed Ali OL/DL`;

interface Props {
  teamId: string;
  /** Jersey numbers already on this team, so a collision is shown before it is saved. */
  existingJerseys: string[];
  variant?: 'default' | 'primary';
}

type RowState = ParsedPlayerRow & { collides: boolean; duplicated: boolean };

export default function ImportRosterButton({ teamId, existingJerseys, variant = 'default' }: Props) {
  const router = useRouter();
  const supabase = createBrowserClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [level, setLevel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const taken = useMemo(
    () => new Set(existingJerseys.map((j) => normalizeJersey(j)).filter(Boolean) as string[]),
    [existingJerseys]
  );

  const parsed = useMemo(() => parseRoster(text), [text]);

  const rows: RowState[] = useMemo(() => {
    const dupes = new Set(parsed.duplicateJerseys);
    return parsed.rows.map((row) => ({
      ...row,
      collides: !!row.jerseyNumber && taken.has(row.jerseyNumber),
      duplicated: !!row.jerseyNumber && dupes.has(row.jerseyNumber),
    }));
  }, [parsed, taken]);

  // A duplicate number is not a warning to click past. matchRosterPlayer
  // resolves a number only when exactly one player wears it, so saving two
  // costs BOTH kids every grade and every stat for the season.
  const blocked = parsed.duplicateJerseys.length > 0;
  const importable = rows.filter((r) => !r.collides);
  const skipped = rows.length - importable.length;

  const reset = useCallback(() => {
    setText('');
    setLevel('');
    setError('');
    setSaved(0);
  }, []);

  async function handleImport() {
    setSaving(true);
    setError('');

    const payload = importable.map((row) => ({
      team_id: teamId,
      first_name: row.firstName,
      last_name: row.lastName || null,
      jersey_number: row.jerseyNumber ? parseInt(row.jerseyNumber, 10) : null,
      primary_position: row.primaryPosition,
      secondary_position: row.secondaryPosition,
      side_of_ball: row.sideOfBall,
      // A level the coach chose for the whole paste, unless the line named one.
      grade_level: row.gradeLevel || level || null,
      status: 'active',
      notes: row.classYear,
    }));

    const { data, error: insertError } = await supabase.from('players').insert(payload).select('id');

    // Row-level security denies a write by returning zero rows rather than an
    // error, so "no error" is not enough to call this saved.
    if (insertError) {
      setError(
        insertError.code === '42501' || /row-level security/i.test(insertError.message)
          ? "You don't have permission to add players to this team. Ask an owner or admin to grant you coach access."
          : insertError.message
      );
      setSaving(false);
      return;
    }
    if (!data?.length) {
      setError(
        "Nothing was saved — your account doesn't have write access to this team's roster. Ask an owner or admin to grant you coach access."
      );
      setSaving(false);
      return;
    }

    setSaved(data.length);
    setSaving(false);
    router.refresh();
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors ${
          variant === 'primary'
            ? 'bg-[var(--brand-navy)] text-white hover:bg-[var(--brand-navy-dark)]'
            : 'border border-[var(--brand-border)] text-[var(--brand-navy)] hover:bg-[var(--brand-bg)]'
        }`}
      >
        <ClipboardList size={16} />
        Import Roster
      </button>

      {/* Portalled for the same reason AddPlayerButton is: rendered inline, a
          `fixed` overlay resolves its containing block against the nearest
          ancestor with a backdrop-filter and mis-sizes itself. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
            <div className="my-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-[var(--brand-navy)]">Import Roster</h2>
                  <p className="mt-0.5 text-sm text-[var(--brand-muted)]">
                    One player per line. Name and number are all that is needed — position and
                    level are optional, and height and weight are ignored.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="p-1 text-[var(--brand-muted)] transition-colors hover:text-[var(--brand-ink)]"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              {saved > 0 ? (
                <div className="py-8 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                    <Check size={24} className="text-emerald-700" />
                  </div>
                  <h3 className="text-lg font-bold text-[var(--brand-navy)]">
                    {saved} player{saved === 1 ? '' : 's'} added
                  </h3>
                  <p className="mx-auto mt-1 max-w-md text-sm text-[var(--brand-muted)]">
                    Jersey numbers are on file, so RankerIQ and StatsIQ can now put a grade or a
                    stat on a name instead of a position.
                  </p>
                  <div className="mt-6 flex justify-center gap-3">
                    <button
                      onClick={reset}
                      className="rounded-lg border border-[var(--brand-border)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-navy)] transition-colors hover:bg-[var(--brand-bg)]"
                    >
                      Import more
                    </button>
                    <button
                      onClick={() => {
                        setOpen(false);
                        reset();
                      }}
                      className="rounded-lg bg-[var(--brand-navy)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-navy-dark)]"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={EXAMPLE}
                    rows={8}
                    spellCheck={false}
                    className={`${inputClass} font-mono text-xs leading-relaxed`}
                  />

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--brand-ink)]">
                        Level for these players
                      </label>
                      <select
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Not set</option>
                        {GRADE_LEVEL_GROUPS.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-[var(--brand-muted)]">
                        Applied to every line that does not name one itself. A graduation year is
                        not a level — it is kept as a note.
                      </p>
                    </div>

                    {rows.length > 0 && (
                      <div className="text-sm">
                        <p className="mb-1 text-xs font-medium text-[var(--brand-ink)]">
                          Ready to import
                        </p>
                        <p className="text-2xl font-bold text-[var(--brand-navy)]">
                          {importable.length}
                        </p>
                        <p className="text-xs text-[var(--brand-muted)]">
                          {skipped > 0 && `${skipped} already on the roster · `}
                          {parsed.ignored.length > 0 && `${parsed.ignored.length} line(s) skipped`}
                        </p>
                      </div>
                    )}
                  </div>

                  {blocked && (
                    <p className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        Jersey {parsed.duplicateJerseys.join(', ')} appears on more than one line. A
                        number worn by two players cannot be matched to either of them, so both
                        would lose every grade and stat. Fix the paste before importing.
                      </span>
                    </p>
                  )}

                  {parsed.ignored.length > 0 && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        Skipped {parsed.ignored.length} line
                        {parsed.ignored.length === 1 ? '' : 's'}:{' '}
                        {parsed.ignored.map((i) => `line ${i.lineNumber}`).join(', ')}
                      </span>
                    </p>
                  )}

                  {rows.length > 0 && (
                    <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-[var(--brand-border)]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-[var(--brand-bg)]">
                          <tr className="border-b border-[var(--brand-border)]">
                            <th className="w-14 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--brand-muted)]">
                              #
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--brand-muted)]">
                              Name
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--brand-muted)]">
                              Pos
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--brand-muted)]">
                              Level
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr
                              key={row.lineNumber}
                              className={`border-b border-[var(--brand-border)] last:border-0 ${
                                row.duplicated
                                  ? 'bg-red-50'
                                  : row.collides
                                    ? 'bg-amber-50 opacity-70'
                                    : ''
                              }`}
                            >
                              <td className="px-3 py-2 font-bold text-[var(--brand-navy)]">
                                {row.jerseyNumber ?? (
                                  <span className="text-xs font-normal text-amber-700">none</span>
                                )}
                              </td>
                              <td className="min-w-0 px-3 py-2">
                                <span className="font-semibold text-[var(--brand-ink)]">
                                  {row.firstName} {row.lastName}
                                </span>
                                {row.collides && (
                                  <span className="ml-2 text-xs text-amber-700">
                                    already on roster — skipped
                                  </span>
                                )}
                                {row.issues.includes('no_last_name') && (
                                  <span className="ml-2 text-xs text-amber-700">no surname</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-[var(--brand-muted)]">
                                {row.primaryPosition ?? '—'}
                                {row.secondaryPosition ? `/${row.secondaryPosition}` : ''}
                              </td>
                              <td className="px-3 py-2 text-[var(--brand-muted)]">
                                {row.gradeLevel || level || '—'}
                                {row.classYear && (
                                  <span className="ml-2 text-xs">{row.classYear}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {error && (
                    <p className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      <span className="min-w-0">{error}</span>
                    </p>
                  )}

                  <div className="mt-5 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        reset();
                      }}
                      className="rounded-lg border border-[var(--brand-border)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-muted)] transition-colors hover:bg-[var(--brand-bg)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={saving || blocked || importable.length === 0}
                      onClick={handleImport}
                      className="flex items-center justify-center gap-2 rounded-lg bg-[var(--brand-navy)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-navy-dark)] disabled:opacity-50"
                    >
                      {saving ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        `Import ${importable.length || ''} player${importable.length === 1 ? '' : 's'}`
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
