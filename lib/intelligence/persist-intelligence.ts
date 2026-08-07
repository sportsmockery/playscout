import type { SupabaseClient } from '@supabase/supabase-js'
import type { MistakeItem, Tendency } from './schemas'
import { rollupTendency } from './tendency-rollup'

/**
 * MISTAKEIQ writes one row per identified mistake to mistake_events. Before
 * this, MistakeIQ's per-mistake taxonomy was discarded — coerced into the
 * generic position_analysis_results shape and never persisted on its own,
 * so mistake_events stayed empty no matter how many analyses ran.
 */
export async function persistMistakeEvents(
  supabase: SupabaseClient,
  params: { teamId: string; playSequenceId?: string | null },
  mistakes: MistakeItem[] | undefined
): Promise<void> {
  if (!mistakes?.length) return

  const rows = mistakes.map((m) => ({
    play_sequence_id: params.playSequenceId ?? null,
    team_id: params.teamId,
    severity: m.severity,
    category: m.category,
    title: m.title,
    description: m.description,
    likely_impact: m.likely_impact,
    correction: m.drill ? `${m.correction}\n\nDrill: ${m.drill}` : m.correction,
    evidence: { frames: m.evidence_frames ?? [] },
    confidence: m.confidence,
  }))

  const { error } = await supabase.from('mistake_events').insert(rows)
  if (error) console.error('[persist-intelligence] failed to insert mistake_events', error)
}

/**
 * TEAMIQ (and, per-clip, SCOUTIQ against the coach's own tendencies) writes
 * structured tendencies to team_tendencies using a sample-size-weighted
 * rollup (see tendency-rollup.ts) so the row reflects everything analyzed so
 * far, not just the most recent clip. Before this, team_tendencies was read
 * by the Intelligence hub but never written by any caller.
 */
export async function persistTeamTendencies(
  supabase: SupabaseClient,
  teamId: string,
  tendencies: { offensive?: Tendency[]; defensive?: Tendency[] }
): Promise<void> {
  const all = [...(tendencies.offensive ?? []), ...(tendencies.defensive ?? [])]
  if (!all.length) return

  for (const t of all) {
    const { data: existingRow, error: fetchError } = await supabase
      .from('team_tendencies')
      .select('id, value, sample_size, confidence')
      .eq('team_id', teamId)
      .eq('tendency_type', t.tendency_type)
      .eq('label', t.label)
      .maybeSingle()

    if (fetchError) {
      console.error('[persist-intelligence] failed to read existing tendency', fetchError)
      continue
    }

    const existing = existingRow
      ? {
          tendency_type: t.tendency_type,
          label: t.label,
          rate: (existingRow.value as { rate?: number | null } | null)?.rate ?? null,
          confidence: existingRow.confidence ?? 0,
          sample_size: existingRow.sample_size ?? 0,
        }
      : null

    const rolled = rollupTendency(existing, {
      tendency_type: t.tendency_type,
      label: t.label,
      rate: t.rate ?? null,
      confidence: t.confidence,
      sample_size: t.sample_size,
    })

    const value = { rate: rolled.rate, description: t.description }

    if (existingRow) {
      const { error } = await supabase
        .from('team_tendencies')
        .update({
          value,
          sample_size: rolled.sample_size,
          confidence: rolled.confidence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRow.id)
      if (error) console.error('[persist-intelligence] failed to update team_tendencies', error)
    } else {
      const { error } = await supabase.from('team_tendencies').insert({
        team_id: teamId,
        tendency_type: t.tendency_type,
        label: t.label,
        value,
        sample_size: rolled.sample_size,
        confidence: rolled.confidence,
      })
      if (error) console.error('[persist-intelligence] failed to insert team_tendencies', error)
    }
  }
}
