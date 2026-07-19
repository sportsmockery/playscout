'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Upload,
  AlertCircle,
  ChevronDown,
  FileText,
  ShieldCheck,
  Printer,
  Trash2,
} from 'lucide-react';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import type { Playbook, PlaybookAnalysis, PlaybookPlay } from '@/lib/db/types';

type PlaybookPlayWithUrl = PlaybookPlay & { imageUrl: string | null };

interface Props {
  teamId: string;
  teamName: string;
  ageGroup?: string;
  offensiveStyle?: string;
  defensiveStyle?: string;
  existingPlaybooks: Playbook[];
}

const ACCEPTED_TYPES =
  'application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png';

const LOADING_STAGES = ['Reading playbook...', 'Consulting the IQ modules...', 'Writing report...'];

const MODULE_CARDS: Array<{ key: keyof PlaybookAnalysis; label: string }> = [
  { key: 'qbiq_notes', label: 'QBIQ Notes' },
  { key: 'oliq_notes', label: 'OLIQ Notes' },
  { key: 'teamiq_notes', label: 'TeamIQ Notes' },
  { key: 'mistakeiq_notes', label: 'MistakeIQ Notes' },
];

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-[var(--brand-bg)] text-[var(--brand-muted)] border-[var(--brand-border)]',
};

function ScoreRing({
  score,
  label,
  invert = false,
}: {
  score: number;
  label: string;
  invert?: boolean;
}) {
  const good = invert ? score <= 40 : score >= 80;
  const warn = invert ? score > 40 && score <= 60 : score >= 60 && score < 80;
  const color = good ? '#10b981' : warn ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--brand-border)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 42}`}
            strokeDashoffset={`${2 * Math.PI * 42 * (1 - score / 100)}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-[var(--brand-navy)]">{score}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-[var(--brand-muted)] text-center">{label}</span>
    </div>
  );
}

function ModuleCard({ label, notes }: { label: string; notes?: string | null }) {
  const [open, setOpen] = useState(true);
  if (!notes) return null;

  return (
    <div className="glass-card p-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <h4 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide">{label}</h4>
        <ChevronDown
          size={16}
          className={`text-[var(--brand-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <p className="text-sm text-[var(--brand-ink)] mt-2 leading-relaxed">{notes}</p>}
    </div>
  );
}

function PlayCard({
  play,
  onUpdated,
}: {
  play: PlaybookPlayWithUrl;
  onUpdated: (updated: PlaybookPlayWithUrl) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState(play.play_name ?? '');
  const [summary, setSummary] = useState(play.blocking_summary ?? '');
  const [assignments, setAssignments] = useState(play.assignments);

  function startEdit() {
    setName(play.play_name ?? '');
    setSummary(play.blocking_summary ?? '');
    setAssignments(play.assignments);
    setError('');
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/playbookiq/plays/${play.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          play_name: name || null,
          blocking_summary: summary || null,
          assignments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save changes');
      onUpdated({ ...play, ...data.play });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full px-2 py-1 rounded border border-[var(--brand-border)] bg-white text-xs text-[var(--brand-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-navy)]';

  return (
    <div className="border border-[var(--brand-border)] rounded-xl overflow-hidden break-inside-avoid">
      {play.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={play.imageUrl}
          alt={play.play_name ?? `Play, page ${play.page_number}`}
          className="w-full bg-white border-b border-[var(--brand-border)]"
          loading="lazy"
        />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          {editing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Page ${play.page_number}`}
              className={`${inputClass} font-bold`}
            />
          ) : (
            <h4 className="font-bold text-[var(--brand-ink)] text-sm">
              {play.play_name || `Page ${play.page_number}`}
            </h4>
          )}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {play.confidence != null && (
              <span
                className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  play.confidence >= 0.75
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : play.confidence >= 0.5
                    ? 'text-amber-700 bg-amber-50 border-amber-200'
                    : 'text-red-700 bg-red-50 border-red-200'
                }`}
              >
                <ShieldCheck size={10} />
                {Math.round(play.confidence * 100)}%
              </span>
            )}
            {!editing && (
              <button
                onClick={startEdit}
                className="print:hidden text-[10px] font-semibold text-[var(--brand-muted)] border border-[var(--brand-border)] rounded-full px-2 py-0.5 hover:border-[var(--brand-navy)] hover:text-[var(--brand-navy)] transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {play.formation && !editing && (
          <span className="inline-block text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 mb-2">
            {play.formation}
          </span>
        )}

        {play.edited_at && (
          <p className="text-[10px] font-medium text-[var(--brand-navy)] mb-1.5">Edited by coach</p>
        )}

        {editing ? (
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder="Blocking summary"
            className={`${inputClass} mb-3 resize-none`}
          />
        ) : (
          play.blocking_summary && (
            <p className="text-xs text-[var(--brand-muted)] mb-3 leading-relaxed">{play.blocking_summary}</p>
          )
        )}

        {editing ? (
          <div className="space-y-1.5">
            {assignments.map((a, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  value={a.position}
                  onChange={(e) => {
                    const next = [...assignments];
                    next[i] = { ...next[i], position: e.target.value };
                    setAssignments(next);
                  }}
                  className={`${inputClass} w-14 flex-shrink-0 font-bold`}
                />
                <input
                  value={a.assignment}
                  onChange={(e) => {
                    const next = [...assignments];
                    next[i] = { ...next[i], assignment: e.target.value };
                    setAssignments(next);
                  }}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        ) : (
          play.assignments.length > 0 && (
            <table className="w-full text-xs">
              <tbody>
                {play.assignments.map((a, i) => (
                  <tr key={i} className="border-t border-[var(--brand-border)] first:border-0">
                    <td className="py-1.5 pr-2 font-bold text-[var(--brand-navy)] align-top whitespace-nowrap w-14">
                      {a.position}
                    </td>
                    <td className="py-1.5 text-[var(--brand-ink)] align-top">{a.assignment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}

        {editing && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 text-xs font-semibold bg-[var(--brand-navy)] text-white rounded-lg py-1.5 hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setError(''); }}
              disabled={saving}
              className="flex-1 text-xs font-semibold border border-[var(--brand-border)] text-[var(--brand-muted)] rounded-lg py-1.5 hover:bg-[var(--brand-bg)] transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlaybookIQClient({
  teamId,
  teamName,
  ageGroup,
  offensiveStyle,
  defensiveStyle,
  existingPlaybooks,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [playbooks, setPlaybooks] = useState<Playbook[]>(existingPlaybooks);
  const [activePlaybook, setActivePlaybook] = useState<Playbook | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [result, setResult] = useState<PlaybookAnalysis | null>(null);
  const [error, setError] = useState('');
  const [plays, setPlays] = useState<PlaybookPlayWithUrl[]>([]);
  const [pagesStatus, setPagesStatus] = useState<Playbook['pages_status']>('not_started');
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingPlaybookId, setDeletingPlaybookId] = useState<string | null>(null);
  const [deletingAnalysis, setDeletingAnalysis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createBrowserClient();

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingStage((s) => Math.min(s + 1, LOADING_STAGES.length - 1));
    }, 3000);
    return () => clearInterval(interval);
  }, [loading]);

  const fetchPlays = useCallback(async (playbookId: string): Promise<Playbook['pages_status']> => {
    const res = await fetch(`/api/playbookiq/${playbookId}/plays`);
    if (!res.ok) return 'failed';
    const data = await res.json();
    setPlays(data.plays ?? []);
    setPagesStatus(data.pagesStatus);
    setPagesError(data.pagesError ?? null);
    return data.pagesStatus;
  }, []);

  // The worker processes a playbook's pages in the background — poll while
  // it's queued/processing rather than making the coach refresh the page.
  useEffect(() => {
    if (pagesStatus !== 'queued' && pagesStatus !== 'processing') return;
    if (!activePlaybook) return;
    const timer = setTimeout(() => {
      fetchPlays(activePlaybook.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [pagesStatus, activePlaybook, fetchPlays]);

  async function retryPageProcessing() {
    if (!activePlaybook || retrying) return;
    setRetrying(true);
    setPagesError(null);
    try {
      const res = await fetch(`/api/playbookiq/${activePlaybook.id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not retry.');
      setPagesStatus('queued');
      fetchPlays(activePlaybook.id);
    } catch (err) {
      setPagesError(err instanceof Error ? err.message : 'Could not retry.');
    } finally {
      setRetrying(false);
    }
  }

  async function handleUploadAndAnalyze() {
    if (!file) return;
    setLoading(true);
    setLoadingStage(0);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('teamId', teamId);
      formData.append('title', title || file.name);

      const uploadRes = await fetch('/api/playbookiq/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error(await uploadRes.text());
      const { playbook } = await uploadRes.json();

      setPlaybooks((prev) => [playbook, ...prev]);
      setActivePlaybook(playbook);
      setPlays([]);
      setPagesStatus(playbook.pages_status);
      setPagesError(null);
      if (playbook.pages_status === 'queued') fetchPlays(playbook.id);

      const analyzeRes = await fetch('/api/playbookiq/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playbookId: playbook.id,
          teamId,
          teamName,
          ageGroup,
          offensiveStyle,
          defensiveStyle,
        }),
      });
      if (!analyzeRes.ok) throw new Error(await analyzeRes.text());
      const { analysis } = await analyzeRes.json();
      setResult(analysis);
      setFile(null);
      setTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload or analysis failed');
    } finally {
      setLoading(false);
    }
  }

  async function loadPastPlaybook(playbook: Playbook) {
    setActivePlaybook(playbook);
    setError('');
    setResult(null);
    setPlays([]);
    setPagesStatus(playbook.pages_status ?? 'not_started');
    setPagesError(null);
    setLoading(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from('playbook_analyses')
        .select('*')
        .eq('playbook_id', playbook.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      setResult(data ?? null);
      if (!data) setError('No analysis found for this playbook yet.');
      fetchPlays(playbook.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load analysis');
    } finally {
      setLoading(false);
    }
  }

  async function deletePlaybook(playbookId: string) {
    setDeletingPlaybookId(playbookId);
    setError('');
    try {
      const res = await fetch(`/api/playbookiq/${playbookId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete this playbook.');
      setPlaybooks((prev) => prev.filter((p) => p.id !== playbookId));
      if (activePlaybook?.id === playbookId) {
        setActivePlaybook(null);
        setResult(null);
        setPlays([]);
        setPagesStatus('not_started');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this playbook.');
    } finally {
      setDeletingPlaybookId(null);
      setConfirmDeleteId(null);
    }
  }

  async function deleteAnalysis() {
    if (!result) return;
    setDeletingAnalysis(true);
    setError('');
    try {
      const res = await fetch(`/api/playbookiq/analyses/${result.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete this analysis.');
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this analysis.');
    } finally {
      setDeletingAnalysis(false);
    }
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all placeholder:text-[var(--brand-muted)]';

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Config panel */}
      <div className="lg:col-span-1 space-y-5">
        <div className="glass-card p-5">
          <h2 className="font-bold text-[var(--brand-navy)] mb-4 text-sm uppercase tracking-wide">
            Upload Playbook
          </h2>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="playbook-file"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[var(--brand-border)] rounded-lg py-8 px-4 text-center cursor-pointer hover:border-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/5 transition-all"
              >
                <Upload size={22} className="text-[var(--brand-muted)]" />
                <span className="text-sm text-[var(--brand-muted)]">
                  {file ? file.name : 'PDF, PPTX, DOCX, or image'}
                </span>
                <input
                  id="playbook-file"
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
                Title (optional)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={file?.name ?? 'e.g. 2026 Offense Playbook'}
                className={inputClass}
              />
            </div>

            <button
              onClick={handleUploadAndAnalyze}
              disabled={loading || !file}
              className="w-full flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white font-semibold py-3 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <BookOpen size={16} />
                  Analyze Playbook
                </>
              )}
            </button>
          </div>
        </div>

        {playbooks.length > 0 && (
          <div className="glass-card p-5">
            <h2 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">
              Past Playbooks
            </h2>
            <ul className="space-y-1">
              {playbooks.map((p) => (
                <li key={p.id}>
                  {confirmDeleteId === p.id ? (
                    <div className="flex items-center gap-2 text-sm py-2 px-2 rounded-lg bg-red-50 border border-red-200">
                      <span className="flex-1 text-red-700 text-xs">Delete &quot;{p.title}&quot; and all its plays?</span>
                      <button
                        onClick={() => deletePlaybook(p.id)}
                        disabled={deletingPlaybookId === p.id}
                        className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded-md disabled:opacity-60"
                      >
                        {deletingPlaybookId === p.id ? '...' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deletingPlaybookId === p.id}
                        className="text-xs font-semibold text-[var(--brand-muted)] hover:text-[var(--brand-ink)] px-2 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`group w-full flex items-center gap-2.5 text-left text-sm py-2 px-2 rounded-lg transition-colors ${
                        activePlaybook?.id === p.id
                          ? 'bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]'
                          : 'hover:bg-[var(--brand-bg)] text-[var(--brand-ink)]'
                      }`}
                    >
                      <button onClick={() => loadPastPlaybook(p)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                        <FileText size={14} className="flex-shrink-0 text-[var(--brand-muted)]" />
                        <span className="truncate flex-1">{p.title}</span>
                        <span className="text-xs text-[var(--brand-muted)] flex-shrink-0">
                          {new Date(p.created_at).toLocaleDateString()}
                        </span>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="flex-shrink-0 p-1 text-[var(--brand-muted)] hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete playbook"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Results panel */}
      <div className="lg:col-span-2">
        {error && (
          <div className="glass-card p-5 border border-red-200 bg-red-50 flex items-start gap-3 mb-5">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && !result && (
          <div className="glass-card p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
              <BookOpen size={28} className="text-indigo-600 animate-pulse" />
            </div>
            <p className="font-semibold text-[var(--brand-navy)] mb-1">Running PlaybookIQ</p>
            <p className="text-sm text-[var(--brand-muted)]">{LOADING_STAGES[loadingStage]}</p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-5">
            {/* Scores */}
            <div className="glass-card p-6">
              <div className="flex justify-end mb-2">
                <button
                  onClick={deleteAnalysis}
                  disabled={deletingAnalysis}
                  className="print:hidden flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-muted)] hover:text-red-600 transition-colors disabled:opacity-60"
                  title="Delete this analysis (keeps the uploaded playbook)"
                >
                  <Trash2 size={13} />
                  {deletingAnalysis ? 'Deleting...' : 'Delete Analysis'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-8">
                <ScoreRing score={result.overall_score ?? 0} label="Overall" />
                <ScoreRing score={result.complexity_score ?? 0} label="Complexity" invert />
                <div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                      result.age_appropriate
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {result.age_appropriate ? 'Age Appropriate' : 'Not Age Appropriate'}
                  </span>
                  {result.summary && (
                    <p className="text-sm text-[var(--brand-ink)] mt-3 leading-relaxed max-w-md">
                      {result.summary}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Play diagrams & per-player assignments */}
            {(pagesStatus === 'queued' || pagesStatus === 'processing') && (
              <div className="glass-card p-6 flex items-center gap-4">
                <span className="w-5 h-5 border-2 border-[var(--brand-border)] border-t-indigo-600 rounded-full animate-spin flex-shrink-0" />
                <div>
                  <p className="font-semibold text-[var(--brand-ink)] text-sm">Reading every play in this playbook...</p>
                  <p className="text-xs text-[var(--brand-muted)] mt-0.5">
                    Rendering pages and identifying each play&apos;s assignments — this runs in the background and updates automatically.
                  </p>
                </div>
              </div>
            )}

            {pagesStatus === 'failed' && (
              <div className="glass-card p-5 border border-amber-200 bg-amber-50">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Couldn&apos;t generate play diagrams</p>
                    <p className="text-xs text-amber-700 mt-1">
                      {pagesError || 'Something went wrong rendering the pages. The rest of this report is unaffected.'}
                    </p>
                  </div>
                  <button
                    onClick={retryPageProcessing}
                    disabled={retrying}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60"
                  >
                    {retrying ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      'Try Again'
                    )}
                  </button>
                </div>
              </div>
            )}

            {pagesStatus === 'ready' && plays.length > 0 && (
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide">
                      Play Diagrams &amp; Assignments
                    </h3>
                    <p className="text-xs text-[var(--brand-muted)] mt-0.5">
                      {plays.length} play{plays.length === 1 ? '' : 's'} identified, every position labeled
                    </p>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="print:hidden flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-muted)] border border-[var(--brand-border)] rounded-lg px-3 py-1.5 hover:border-[var(--brand-navy)] hover:text-[var(--brand-navy)] transition-colors"
                  >
                    <Printer size={13} />
                    Print
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  {plays.map((play) => (
                    <PlayCard
                      key={play.id}
                      play={play}
                      onUpdated={(updated) =>
                        setPlays((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Strengths / Weaknesses */}
            <div className="grid md:grid-cols-2 gap-5">
              <div className="glass-card p-5">
                <h3 className="font-bold text-emerald-600 mb-3 text-sm uppercase tracking-wide">Strengths</h3>
                <ul className="space-y-2">
                  {(result.strengths ?? []).map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="glass-card p-5">
                <h3 className="font-bold text-red-500 mb-3 text-sm uppercase tracking-wide">Weaknesses</h3>
                <ul className="space-y-2">
                  {(result.weaknesses ?? []).map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* IQ Module opinions */}
            <div className="grid md:grid-cols-2 gap-4">
              {MODULE_CARDS.map(({ key, label }) => (
                <ModuleCard key={key} label={label} notes={result[key] as string | null} />
              ))}
            </div>

            {/* Upgrade recommendations */}
            {(result.upgrade_recommendations ?? []).length > 0 && (
              <div className="glass-card p-5">
                <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">
                  Upgrade Recommendations
                </h3>
                <div className="space-y-2">
                  {(result.upgrade_recommendations ?? []).map((rec, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-[var(--brand-bg)] rounded-lg">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${PRIORITY_STYLES[rec.priority] ?? PRIORITY_STYLES.low}`}
                      >
                        {rec.priority}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--brand-ink)]">
                          {rec.title} <span className="text-xs font-normal text-[var(--brand-muted)]">· {rec.module}</span>
                        </p>
                        <p className="text-xs text-[var(--brand-muted)] mt-0.5">{rec.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Plays to keep / remove */}
            {((result.plays_to_keep ?? []).length > 0 || (result.plays_to_remove ?? []).length > 0) && (
              <div className="glass-card p-5">
                <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Play Menu</h3>
                <div className="flex flex-wrap gap-2">
                  {(result.plays_to_keep ?? []).map((p, i) => (
                    <span
                      key={`keep-${i}`}
                      className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      {p}
                    </span>
                  ))}
                  {(result.plays_to_remove ?? []).map((p, i) => (
                    <span
                      key={`remove-${i}`}
                      className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 line-through"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Install order */}
            {(result.install_order ?? []).length > 0 && (
              <div className="glass-card p-5">
                <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">
                  Install Order
                </h3>
                <div className="space-y-3">
                  {(result.install_order ?? []).map((step, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-[var(--brand-bg)] rounded-lg">
                      <span className="w-6 h-6 rounded-full bg-[var(--brand-navy)] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                        {step.week}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--brand-ink)]">{step.play}</p>
                        <p className="text-xs text-[var(--brand-muted)]">{step.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!result && !loading && !error && (
          <div className="glass-card p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--brand-navy)]/10 flex items-center justify-center mx-auto mb-4">
              <BookOpen size={28} className="text-[var(--brand-navy)]" />
            </div>
            <h3 className="font-bold text-[var(--brand-navy)] text-lg mb-2">PlaybookIQ Ready</h3>
            <p className="text-[var(--brand-muted)] text-sm">
              Upload a playbook to get strengths, weaknesses, upgrade recommendations, and an install plan.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
