import { getAnalysisById } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import EvidenceFrames from '@/components/intelligence/EvidenceFrames';
import RepBreakdownPanel, { type RepBreakdown } from '@/components/intelligence/RepBreakdownPanel';
import { createClient } from '@/lib/supabase/server';
import PrintButton from './PrintButton';

export async function generateMetadata({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  const analysis = await getAnalysisById(analysisId);
  return { title: analysis ? `${analysis.module_key} Report` : 'Saved Report' };
}

type TendencyEvidence = { tendency_type: string; label: string; rate: number | null; confidence: number; sample_size: number; description: string }[];

interface EvidenceShape {
  frames?: number[];
  timestamps?: number[];
  breakdown?: RepBreakdown | null;
  confidence?: number;
  confidence_reasons?: string[];
  plays_observed?: number;
  head_contact_flag?: { flagged: boolean; note: string } | null;
  offensive_tendencies?: TendencyEvidence | null;
  defensive_tendencies?: TendencyEvidence | null;
  formations?: { name: string; side?: string; note?: string }[] | null;
  situational_tells?: { situation: string; tell: string; confidence?: number }[] | null;
  attack_points?: string[] | null;
  target_players?: { identifier: string; reason: string; confidence: number }[] | null;
}

function TendencyList({ title, items }: { title: string; items: TendencyEvidence }) {
  if (!items.length) return null;
  return (
    <div className="glass-card p-5 print:border print:shadow-none">
      <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">{title}</h3>
      <ul className="space-y-2">
        {items.map((t, i) => (
          <li key={i} className="text-sm">
            <span className="font-semibold text-[var(--brand-ink)]">{t.label}</span>
            {typeof t.rate === 'number' && <span className="text-purple-600 font-bold"> {Math.round(t.rate * 100)}%</span>}
            <p className="text-xs text-[var(--brand-muted)]">{t.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function SavedAnalysisPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;
  const analysis = await getAnalysisById(analysisId);
  if (!analysis) notFound();

  const record = analysis as typeof analysis & {
    players?: { first_name: string; last_name: string; primary_position: string } | null;
    teams?: { name: string } | null;
  };
  const evidence = (analysis.evidence ?? {}) as EvidenceShape;

  // A breakdown anchor is only worth clicking if there is film behind it, so
  // resolve a playable URL the same way the film detail page does.
  let videoSrc: string | null = null;
  let playStartSeconds = 0;
  if (evidence.breakdown && analysis.video_id) {
    const supabase = await createClient();
    const { data: video } = await supabase
      .from('videos')
      .select('storage_path, source_url')
      .eq('id', analysis.video_id)
      .maybeSingle();
    if (video?.storage_path) {
      videoSrc =
        (await supabase.storage.from('videos').createSignedUrl(video.storage_path, 3600)).data
          ?.signedUrl ?? null;
    } else {
      videoSrc = video?.source_url ?? null;
    }
    if (analysis.play_sequence_id) {
      const { data: play } = await supabase
        .from('play_sequences')
        .select('start_time_seconds')
        .eq('id', analysis.play_sequence_id)
        .maybeSingle();
      // Breakdown times are measured from the start of the clip the model saw,
      // which is not the start of the file when one video holds many plays.
      playStartSeconds = Number(play?.start_time_seconds ?? 0) || 0;
    }
  }
  const teamId = analysis.team_id;

  return (
    <div className="p-6 max-w-4xl mx-auto print:p-0">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href={`/teams/${teamId}/intelligence`}
          className="flex items-center gap-2 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors"
        >
          <ArrowLeft size={16} />
          Intelligence
        </Link>
        <PrintButton />
      </div>

      <div className="glass-card p-6 mb-5 print:border print:shadow-none">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold text-[var(--brand-navy)] uppercase tracking-wide">{analysis.module_key}</p>
            <h1 className="text-xl font-bold text-[var(--brand-navy)] mt-1">
              {record.teams?.name ?? 'Team Report'}
              {record.players && ` — ${record.players.first_name} ${record.players.last_name}`}
            </h1>
            <p className="text-sm text-[var(--brand-muted)] mt-1">
              {new Date(analysis.created_at).toLocaleDateString()}
              {analysis.edited_at && ' · edited by coach'}
            </p>
          </div>
          {analysis.overall_score != null && (
            <div className="text-center">
              <p className="text-3xl font-bold text-[var(--brand-navy)]">{analysis.overall_score}</p>
              <p className="text-xs text-[var(--brand-muted)]">/ 100</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {typeof evidence.plays_observed === 'number' && (
            <span className="inline-flex items-center rounded-full bg-[var(--brand-bg)] border border-[var(--brand-border)] px-2 py-0.5 text-xs font-medium text-[var(--brand-ink)]">
              Sample: {evidence.plays_observed} {evidence.plays_observed === 1 ? 'play' : 'plays'}
            </span>
          )}
          {typeof evidence.confidence === 'number' && (
            <span className="inline-flex items-center rounded-full bg-[var(--brand-bg)] border border-[var(--brand-border)] px-2 py-0.5 text-xs font-medium text-[var(--brand-ink)]">
              Confidence: {Math.round(evidence.confidence * 100)}%
            </span>
          )}
        </div>
      </div>

      {evidence.head_contact_flag?.flagged && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4 mb-5">
          <p className="font-bold text-red-700 text-sm uppercase tracking-wide">Possible Head Contact — Concussion Protocol</p>
          <p className="text-sm text-red-700 mt-1">{evidence.head_contact_flag.note}</p>
        </div>
      )}

      {analysis.video_id && ((evidence.frames?.length ?? 0) > 0 || (evidence.confidence_reasons?.length ?? 0) > 0) && (
        <div className="mb-5 print:hidden">
          <EvidenceFrames videoId={analysis.video_id} frameIndices={evidence.frames ?? []} confidence={evidence.confidence} confidenceReasons={evidence.confidence_reasons} />
        </div>
      )}

      {evidence.breakdown && (
        <RepBreakdownPanel
          breakdown={evidence.breakdown}
          videoSrc={videoSrc}
          playStartSeconds={playStartSeconds}
        />
      )}

      {analysis.summary && (
        <div className="glass-card p-5 mb-5 print:border print:shadow-none">
          <h3 className="font-bold text-[var(--brand-navy)] mb-2 text-sm uppercase tracking-wide">Summary</h3>
          <p className="text-sm text-[var(--brand-ink)] leading-relaxed whitespace-pre-wrap">{analysis.summary}</p>
        </div>
      )}

      {analysis.reasoning && Object.keys(analysis.reasoning as object).length > 0 && (
        <div className="space-y-3 mb-5">
          {Object.entries(analysis.reasoning as Record<string, string>).map(([key, text]) => (
            <div key={key} className="glass-card p-5 print:border print:shadow-none">
              <p className="text-[var(--brand-navy)] text-xs font-bold uppercase tracking-wide mb-1">{key.replace(/_/g, ' ')}</p>
              <p className="text-sm text-[var(--brand-ink)] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        {analysis.strengths && analysis.strengths.length > 0 && (
          <div className="glass-card p-5 print:border print:shadow-none">
            <h3 className="font-bold text-emerald-600 mb-3 text-sm uppercase tracking-wide">Strengths</h3>
            <ul className="space-y-2">
              {analysis.strengths.map((s, i) => <li key={i} className="text-sm text-[var(--brand-ink)]">• {s}</li>)}
            </ul>
          </div>
        )}
        {analysis.weaknesses && analysis.weaknesses.length > 0 && (
          <div className="glass-card p-5 print:border print:shadow-none">
            <h3 className="font-bold text-red-500 mb-3 text-sm uppercase tracking-wide">Weaknesses</h3>
            <ul className="space-y-2">
              {analysis.weaknesses.map((w, i) => <li key={i} className="text-sm text-[var(--brand-ink)]">• {w}</li>)}
            </ul>
          </div>
        )}
      </div>

      {evidence.offensive_tendencies && <div className="mb-5"><TendencyList title="Offensive Tendencies" items={evidence.offensive_tendencies} /></div>}
      {evidence.defensive_tendencies && <div className="mb-5"><TendencyList title="Defensive Tendencies" items={evidence.defensive_tendencies} /></div>}

      {evidence.target_players && evidence.target_players.length > 0 && (
        <div className="glass-card p-5 mb-5 print:border print:shadow-none">
          <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Target Players</h3>
          <ul className="space-y-2">
            {evidence.target_players.map((p, i) => (
              <li key={i} className="text-sm"><span className="font-semibold">{p.identifier}</span>: {p.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {evidence.attack_points && evidence.attack_points.length > 0 && (
        <div className="glass-card p-5 mb-5 print:border print:shadow-none">
          <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">What To Attack</h3>
          <ul className="space-y-2">
            {evidence.attack_points.map((a, i) => <li key={i} className="text-sm text-[var(--brand-ink)]">• {a}</li>)}
          </ul>
        </div>
      )}

      {analysis.drills && analysis.drills.length > 0 && (
        <div className="glass-card p-5 mb-5 print:border print:shadow-none">
          <h3 className="font-bold text-[var(--brand-navy)] mb-3 text-sm uppercase tracking-wide">Recommended Fixes</h3>
          <ul className="space-y-2">
            {analysis.drills.map((d, i) => <li key={i} className="text-sm text-[var(--brand-ink)]">{i + 1}. {d}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
