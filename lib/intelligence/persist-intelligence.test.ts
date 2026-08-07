import { describe, it, expect } from 'vitest'
import { persistMistakeEvents, persistTeamTendencies } from './persist-intelligence'
import type { MistakeItem, Tendency } from './schemas'

/**
 * Minimal fake of the Supabase query-builder chain — just enough surface
 * (from/select/eq/maybeSingle/insert/update) for persist-intelligence.ts's
 * actual call shapes. Not a general-purpose mock.
 */
function makeFakeSupabase(opts: { existingTendencyRow?: Record<string, unknown> | null } = {}) {
  const inserted: Record<string, unknown[]> = {}
  const updated: Record<string, unknown[]> = {}

  function chain(table: string) {
    const api = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data: opts.existingTendencyRow ?? null, error: null }),
      insert: async (rows: unknown | unknown[]) => {
        inserted[table] = inserted[table] ?? []
        inserted[table].push(...(Array.isArray(rows) ? rows : [rows]))
        return { error: null }
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          updated[table] = updated[table] ?? []
          updated[table].push(patch)
          return { error: null }
        },
      }),
    }
    return api
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: { from: (table: string) => chain(table) } as any,
    inserted,
    updated,
  }
}

describe('persistMistakeEvents', () => {
  it('inserts one row per mistake, mapping the full taxonomy', async () => {
    const { supabase, inserted } = makeFakeSupabase()
    const mistakes: MistakeItem[] = [
      {
        title: 'Missed contain on jet sweep',
        severity: 'major',
        category: 'missed_contain',
        description: 'Edge defender crashed inside, lost outside leverage.',
        likely_impact: 'Allowed a 25-yard gain around the edge.',
        correction: 'Teach the edge defender to squeeze, not crash.',
        drill: 'Force-and-spill mirror drill',
        evidence_frames: [3, 4],
        confidence: 0.8,
      },
    ]

    await persistMistakeEvents(supabase, { teamId: 'team-1', playSequenceId: 'play-1' }, mistakes)

    expect(inserted.mistake_events).toHaveLength(1)
    const row = inserted.mistake_events[0] as Record<string, unknown>
    expect(row.team_id).toBe('team-1')
    expect(row.play_sequence_id).toBe('play-1')
    expect(row.severity).toBe('major')
    expect(row.category).toBe('missed_contain')
    expect(row.title).toBe('Missed contain on jet sweep')
    expect(row.correction).toContain('Teach the edge defender to squeeze')
    expect(row.correction).toContain('Drill: Force-and-spill mirror drill')
    expect(row.confidence).toBe(0.8)
    expect((row.evidence as { frames: number[] }).frames).toEqual([3, 4])
  })

  it('does nothing when there are no mistakes', async () => {
    const { supabase, inserted } = makeFakeSupabase()
    await persistMistakeEvents(supabase, { teamId: 'team-1' }, [])
    expect(inserted.mistake_events).toBeUndefined()
  })

  it('does nothing when mistakes is undefined', async () => {
    const { supabase, inserted } = makeFakeSupabase()
    await persistMistakeEvents(supabase, { teamId: 'team-1' }, undefined)
    expect(inserted.mistake_events).toBeUndefined()
  })
})

describe('persistTeamTendencies', () => {
  it('inserts a new tendency row when none exists yet', async () => {
    const { supabase, inserted } = makeFakeSupabase({ existingTendencyRow: null })
    const offensive: Tendency[] = [
      { tendency_type: 'run_direction', label: 'Runs right', rate: 0.71, confidence: 0.6, sample_size: 14, description: 'Favors the right side.' },
    ]

    await persistTeamTendencies(supabase, 'team-1', { offensive })

    expect(inserted.team_tendencies).toHaveLength(1)
    const row = inserted.team_tendencies[0] as Record<string, unknown>
    expect(row.team_id).toBe('team-1')
    expect(row.tendency_type).toBe('run_direction')
    expect(row.label).toBe('Runs right')
    expect((row.value as { rate: number }).rate).toBeCloseTo(0.71)
    expect(row.sample_size).toBe(14)
  })

  it('rolls up into an existing row instead of inserting a duplicate', async () => {
    const { supabase, inserted, updated } = makeFakeSupabase({
      existingTendencyRow: { id: 'existing-id', value: { rate: 0.8 }, sample_size: 10, confidence: 0.6 },
    })
    const offensive: Tendency[] = [
      { tendency_type: 'run_direction', label: 'Runs right', rate: 0.4, confidence: 0.5, sample_size: 10, description: 'Second clip.' },
    ]

    await persistTeamTendencies(supabase, 'team-1', { offensive })

    expect(inserted.team_tendencies).toBeUndefined()
    expect(updated.team_tendencies).toHaveLength(1)
    const patch = updated.team_tendencies[0] as Record<string, unknown>
    expect((patch.value as { rate: number }).rate).toBeCloseTo(0.6) // (0.8*10 + 0.4*10)/20
    expect(patch.sample_size).toBe(20)
  })

  it('does nothing when there are no tendencies', async () => {
    const { supabase, inserted, updated } = makeFakeSupabase()
    await persistTeamTendencies(supabase, 'team-1', {})
    expect(inserted.team_tendencies).toBeUndefined()
    expect(updated.team_tendencies).toBeUndefined()
  })
})
