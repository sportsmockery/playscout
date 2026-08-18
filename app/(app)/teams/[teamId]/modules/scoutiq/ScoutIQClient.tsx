'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Crosshair, AlertCircle, Target, Layers } from 'lucide-react';
import type { Opponent, Video, ScoutReport } from '@/lib/db/types';
import UploadVideoButton from '../../film/UploadVideoButton';
import AddFilmLinkButton from '../../film/AddFilmLinkButton';
import AnalysisQueue from '@/components/intelligence/AnalysisQueue';
import { queueAnalysisBatch, batchTitle } from '@/components/intelligence/queue-batch';
import { isUnanalyzable } from '@/components/intelligence/FilmPicker';

interface Props {
  teamId: string;
  teamName: string;
  ageGroup?: string;
  opponents: Opponent[];
  selectedOpponentId?: string;
  opponentVideos: Video[];
  scoutReports: ScoutReport[];
}

interface ScoutIQClipResult {
  overall_score: number;
  offensive_tendencies: { label: string; rate: number | null }[];
  defensive_tendencies: { label: string; rate: number | null }[];
  target_players: { identifier: string; reason: string }[];
  summary: string;
}

const selectClass =
  'w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all appearance-none';
const inputClass =
  'w-full px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent';

function AddOpponentForm({ teamId, onCreated }: { teamId: string; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [nextGameDate, setNextGameDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/opponents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, name, ageGroup: ageGroup || undefined, nextGameDate: nextGameDate || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add opponent');
      onCreated(data.opponent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add opponent');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card p-4">
      <h3 className="text-xs font-bold text-[var(--brand-navy)] uppercase tracking-wide mb-3">Scout a New Opponent</h3>
      <div className="grid sm:grid-cols-3 gap-2 mb-2">
        <input className={inputClass} placeholder="Opponent name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputClass} placeholder="Age group (optional)" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} />
        <input type="date" className={inputClass} value={nextGameDate} onChange={(e) => setNextGameDate(e.target.value)} />
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button
        onClick={create}
        disabled={saving || !name.trim()}
        className="flex items-center gap-1.5 text-xs font-semibold bg-[var(--brand-navy)] text-white px-3 py-2 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-40"
      >
        <Plus size={14} />
        {saving ? 'Adding...' : 'Add Opponent'}
      </button>
    </div>
  );
}

export default function ScoutIQClient({ teamId, teamName, ageGroup, opponents, selectedOpponentId, opponentVideos, scoutReports }: Props) {
  const router = useRouter();
  const [showAddOpponent, setShowAddOpponent] = useState(opponents.length === 0);
  const [jerseyColor, setJerseyColor] = useState('');
  const [clipResults, setClipResults] = useState<Record<string, ScoutIQClipResult>>({});
  const [clipLoading, setClipLoading] = useState<string | null>(null);
  const [clipError, setClipError] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [latestReport, setLatestReport] = useState<ScoutReport | null>(scoutReports[0] ?? null);
  const [queued, setQueued] = useState('');
  const [queueVersion, setQueueVersion] = useState(0);

  const selectedOpponent = opponents.find((o) => o.id === selectedOpponentId);
  const readyVideos = opponentVideos.filter((v) => v.status === 'ready_for_review' || v.status === 'analysis_complete');

  function selectOpponent(id: string) {
    router.push(`/teams/${teamId}/modules/scoutiq?opponent=${id}`);
  }

  async function runScoutOnClip(video: Video) {
    if (!selectedOpponentId || !selectedOpponent) return;
    setClipLoading(video.id);
    setClipError('');
    try {
      const res = await fetch('/api/intelligence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleKey: 'SCOUTIQ',
          teamId,
          videoId: video.id,
          opponentId: selectedOpponentId,
          team: { name: teamName, age_group: ageGroup },
          opponent: { name: selectedOpponent.name, age_group: selectedOpponent.age_group ?? undefined, jersey_color: jerseyColor || undefined },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ScoutIQ analysis failed');
      setClipResults((prev) => ({ ...prev, [video.id]: data.result }));
    } catch (err) {
      setClipError(err instanceof Error ? err.message : 'ScoutIQ analysis failed');
    } finally {
      setClipLoading(null);
    }
  }

  /**
   * Scouting an opponent means scouting every clip of them — one at a time
   * was the slow path, and it died with the page. This queues the lot in the
   * background so the coach can walk away and come back to a full picture,
   * including clips whose frames are still being extracted.
   */
  async function scoutAllClips() {
    if (!selectedOpponentId || !selectedOpponent) return;
    const targets = opponentVideos.filter((v) => !isUnanalyzable(v));
    if (!targets.length) return;
    setClipError('');
    setQueued('');
    try {
      const res = await queueAnalysisBatch({
        teamId,
        moduleKey: 'SCOUTIQ',
        videoIds: targets.map((v) => v.id),
        title: `${batchTitle('SCOUTIQ', targets.length)} — ${selectedOpponent.name}`,
        context: {
          opponentId: selectedOpponentId,
          team: { name: teamName, age_group: ageGroup },
          opponent: {
            name: selectedOpponent.name,
            age_group: selectedOpponent.age_group ?? undefined,
            jersey_color: jerseyColor || undefined,
          },
        },
      });
      setQueued(`${res.queued} clip${res.queued === 1 ? '' : 's'} queued — scouting runs in the background.`);
      setQueueVersion((v) => v + 1);
    } catch (err) {
      setClipError(err instanceof Error ? err.message : 'Could not queue scouting.');
    }
  }

  async function generateGamePlan() {
    if (!selectedOpponentId) return;
    setReportLoading(true);
    setReportError('');
    try {
      const res = await fetch('/api/scoutiq/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, opponentId: selectedOpponentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate game plan');
      setLatestReport(data.scoutReport);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Could not generate game plan');
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Opponent picker */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide">Opponent</h2>
          <button
            onClick={() => setShowAddOpponent((v) => !v)}
            className="text-xs font-semibold text-[var(--brand-navy)] hover:underline flex items-center gap-1"
          >
            <Plus size={13} />
            New Opponent
          </button>
        </div>

        {opponents.length > 0 && (
          <div className="relative mb-3">
            <select value={selectedOpponentId ?? ''} onChange={(e) => selectOpponent(e.target.value)} className={selectClass}>
              {opponents.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}{o.next_game_date ? ` — ${new Date(o.next_game_date).toLocaleDateString()}` : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--brand-muted)] pointer-events-none" />
          </div>
        )}

        {showAddOpponent && (
          <AddOpponentForm teamId={teamId} onCreated={(id) => { setShowAddOpponent(false); selectOpponent(id); }} />
        )}
      </div>

      {selectedOpponent && (
        <>
          {/* Opponent film */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide">{selectedOpponent.name}&apos;s Film</h2>
              <div className="flex items-center gap-2">
                {opponentVideos.some((v) => !isUnanalyzable(v)) && (
                  <button
                    onClick={scoutAllClips}
                    className="flex items-center gap-1.5 text-xs font-semibold border border-[var(--brand-border)] text-[var(--brand-ink)] px-3 py-2 rounded-lg hover:bg-[var(--brand-bg)] transition-colors"
                  >
                    <Layers size={14} />
                    Scout all clips
                  </button>
                )}
                <AddFilmLinkButton teamId={teamId} opponentId={selectedOpponent.id} />
                <UploadVideoButton teamId={teamId} opponentId={selectedOpponent.id} buttonLabel="Upload Opponent Film" />
              </div>
            </div>

            {queued && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 mb-3">
                {queued}
              </p>
            )}

            <div className="mb-3">
              <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1">Opponent jersey/helmet color (this film)</label>
              <input
                className={inputClass}
                placeholder="e.g. red jerseys, white helmets"
                value={jerseyColor}
                onChange={(e) => setJerseyColor(e.target.value)}
              />
            </div>

            {opponentVideos.length === 0 ? (
              <p className="text-sm text-[var(--brand-muted)]">No film uploaded for {selectedOpponent.name} yet.</p>
            ) : (
              <div className="space-y-3">
                {opponentVideos.map((v) => (
                  <div key={v.id} className="border border-[var(--brand-border)] rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-[var(--brand-ink)]">{v.title}</p>
                        <p className="text-xs text-[var(--brand-muted)] capitalize">{v.status?.replace(/_/g, ' ')}</p>
                      </div>
                      {readyVideos.includes(v) && (
                        <button
                          onClick={() => runScoutOnClip(v)}
                          disabled={clipLoading === v.id}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          <Crosshair size={13} />
                          {clipLoading === v.id ? 'Scouting...' : 'Run ScoutIQ'}
                        </button>
                      )}
                    </div>

                    {clipResults[v.id] && (
                      <div className="mt-3 pt-3 border-t border-[var(--brand-border)] text-sm">
                        <p className="text-[var(--brand-ink)] mb-2">{clipResults[v.id].summary}</p>
                        {clipResults[v.id].target_players?.length > 0 && (
                          <p className="text-xs text-[var(--brand-muted)]">
                            Targets: {clipResults[v.id].target_players.map((p) => p.identifier).join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {clipError && (
              <p className="text-xs text-red-600 mt-3 flex items-center gap-1"><AlertCircle size={13} />{clipError}</p>
            )}
          </div>

          <AnalysisQueue teamId={teamId} moduleKey="SCOUTIQ" refreshKey={queueVersion} />

          {/* Game plan */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide">Game Plan</h2>
              <button
                onClick={generateGamePlan}
                disabled={reportLoading}
                className="flex items-center gap-1.5 text-xs font-semibold bg-[var(--brand-navy)] text-white px-3 py-2 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-50"
              >
                <Target size={14} />
                {reportLoading ? 'Building Game Plan...' : 'Generate Game Plan'}
              </button>
            </div>
            {reportError && (
              <p className="text-xs text-red-600 mb-3 flex items-center gap-1"><AlertCircle size={13} />{reportError}</p>
            )}

            {latestReport ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs text-amber-800">
                    {(latestReport.game_plan as { evidence_sufficiency_note?: string } | null)?.evidence_sufficiency_note
                      ?? `Based on ${(latestReport.evidence_sufficiency as { plays_observed?: number } | null)?.plays_observed ?? 0} plays across ${latestReport.based_on_video_ids.length} clip(s).`}
                  </p>
                </div>

                {latestReport.summary && (
                  <p className="text-sm text-[var(--brand-ink)]">{latestReport.summary}</p>
                )}

                {(['offensive_game_plan', 'defensive_game_plan', 'target_players_plan', 'practice_week_focus'] as const).map((key) => {
                  const items = (latestReport.game_plan as Record<string, string[]> | null)?.[key];
                  if (!items?.length) return null;
                  const labels: Record<string, string> = {
                    offensive_game_plan: 'How To Attack Them',
                    defensive_game_plan: 'How To Stop Them',
                    target_players_plan: 'Target Players',
                    practice_week_focus: 'This Week At Practice',
                  };
                  return (
                    <div key={key}>
                      <h3 className="text-xs font-bold text-[var(--brand-navy)] uppercase tracking-wide mb-2">{labels[key]}</h3>
                      <ul className="space-y-1.5">
                        {items.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-gold)] flex-shrink-0 mt-1.5" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[var(--brand-muted)]">
                Run ScoutIQ on at least one clip above, then generate the game plan.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
