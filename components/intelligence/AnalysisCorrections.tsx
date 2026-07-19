'use client';

import { useState } from 'react';
import { Pencil, CheckCircle2 } from 'lucide-react';

export interface EditableAnalysis {
  overall_score: number;
  position_scores: Record<string, number | null>;
  strengths: string[];
  weaknesses: string[];
  drills: string[];
  summary: string;
  edited_at?: string | null;
}

interface Props {
  analysisId: string | null;
  result: EditableAnalysis;
  dimensions: Array<[string, string]>;
  onSaved: (patch: Partial<EditableAnalysis> & { edited_at: string }) => void;
}

function linesToList(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * "Correct this analysis" — lets a coach with write access fix an AI report
 * without losing what the AI originally said (the API route snapshots the
 * pre-edit values server-side before applying the patch). Evidence frames,
 * confidence, and model metadata are never shown here because the PATCH
 * route doesn't accept them regardless of what's sent.
 */
export default function AnalysisCorrections({ analysisId, result, dimensions, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [overallScore, setOverallScore] = useState(String(result.overall_score));
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(dimensions.map(([key]) => [key, result.position_scores[key] != null ? String(result.position_scores[key]) : '']))
  );
  const [strengths, setStrengths] = useState(result.strengths.join('\n'));
  const [weaknesses, setWeaknesses] = useState(result.weaknesses.join('\n'));
  const [drills, setDrills] = useState(result.drills.join('\n'));
  const [summary, setSummary] = useState(result.summary);

  function startEdit() {
    setOverallScore(String(result.overall_score));
    setScores(Object.fromEntries(dimensions.map(([key]) => [key, result.position_scores[key] != null ? String(result.position_scores[key]) : ''])));
    setStrengths(result.strengths.join('\n'));
    setWeaknesses(result.weaknesses.join('\n'));
    setDrills(result.drills.join('\n'));
    setSummary(result.summary);
    setError('');
    setEditing(true);
  }

  async function save() {
    if (!analysisId) {
      setError('This analysis has not finished saving yet — try again in a moment.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const position_scores = Object.fromEntries(
        dimensions.map(([key]) => [key, scores[key] === '' ? null : Number(scores[key])])
      );
      const res = await fetch(`/api/intelligence/analysis/${analysisId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overall_score: Number(overallScore),
          position_scores,
          strengths: linesToList(strengths),
          weaknesses: linesToList(weaknesses),
          drills: linesToList(drills),
          summary,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save changes');
      onSaved(data.result);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full px-2.5 py-1.5 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-navy)]';

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        {result.edited_at ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--brand-navy)]">
            <CheckCircle2 size={13} />
            Edited by coach
          </span>
        ) : <span />}
        <button
          onClick={startEdit}
          className="print:hidden flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-muted)] border border-[var(--brand-border)] rounded-lg px-3 py-1.5 hover:border-[var(--brand-navy)] hover:text-[var(--brand-navy)] transition-colors"
        >
          <Pencil size={13} />
          Correct this analysis
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 space-y-4 border-2 border-[var(--brand-navy)]/20">
      <h3 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide">Correct This Analysis</h3>

      <div>
        <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Overall Score</label>
        <input type="number" min={0} max={100} value={overallScore} onChange={(e) => setOverallScore(e.target.value)} className={`${inputClass} w-24`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {dimensions.map(([key, label]) => (
          <div key={key}>
            <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">{label}</label>
            <input
              type="number" min={0} max={100}
              value={scores[key]}
              placeholder="N/A"
              onChange={(e) => setScores((s) => ({ ...s, [key]: e.target.value }))}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Summary</label>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={`${inputClass} resize-none`} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Strengths (one per line)</label>
          <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={4} className={`${inputClass} resize-none`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Weaknesses (one per line)</label>
          <textarea value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} rows={4} className={`${inputClass} resize-none`} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Drills (one per line)</label>
        <textarea value={drills} onChange={(e) => setDrills(e.target.value)} rows={3} className={`${inputClass} resize-none`} />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={() => { setEditing(false); setError(''); }}
          disabled={saving}
          className="text-sm font-semibold border border-[var(--brand-border)] text-[var(--brand-muted)] px-4 py-2 rounded-lg hover:bg-[var(--brand-bg)] transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
