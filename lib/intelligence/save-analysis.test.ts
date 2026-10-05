import { describe, it, expect, vi } from 'vitest'

vi.mock('./memory', () => ({ saveToTeamMemory: vi.fn(() => Promise.resolve()) }))
vi.mock('./film-subject', () => ({
  resolveFilmSubject: vi.fn(() => Promise.resolve({ filmType: 'opponent' })),
  isMisdirectedRun: vi.fn(() => false),
}))

import { saveAnalysisResult } from './save-analysis'
import type { PositionAnalysisInput, PositionAnalysisResult } from './schemas'

function fakeSupabase() {
  const inserted: Record<string, unknown>[] = []
  const client = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row)
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'r1' }, error: null }) }) }
      },
    }),
  }
  return { client, inserted }
}

describe('saveAnalysisResult — SCOUTIQ evidence', () => {
  it('stores the charted snaps and both halves of the scout, not just the summary fields', async () => {
    // defensive_snaps was computed on every run and never written here, so
    // every game plan's defensive structure was built from zero snaps.
    const { client, inserted } = fakeSupabase()
    const result = {
      overall_score: 70, position_scores: {}, reasoning: {}, strengths: [], weaknesses: [], drills: [],
      summary: 's', confidence: 0.7, confidence_reasons: [], evidence_frames: [], evidence_timestamps: [],
      analysisMode: 'video', model: 'm', framesAnalyzed: 0,
      opponent_possession: 'offense',
      attack_points: [{ point: 'p', category: 'motion', weakness: 'soft_coverage' }],
      defensive_snaps: [{ presnap_shell: 'one_high' }],
      offensive_snaps: [{ formation: 'double_wing', play_type: 'inside_run' }],
      stop_points: [{ point: 'q', category: 'run_fits', threat: 'inside_run' }],
      key_players: [{ identifier: 'Tailback', reason: 'r', confidence: 0.8 }],
    } as unknown as PositionAnalysisResult
    const input = { moduleKey: 'SCOUTIQ', teamId: 't', videoId: 'v', frames: [] } as unknown as PositionAnalysisInput

    await saveAnalysisResult(client as never, input, result)

    const evidence = inserted[0].evidence as Record<string, unknown>
    expect(evidence.defensive_snaps).toEqual(result.defensive_snaps)
    expect(evidence.offensive_snaps).toEqual(result.offensive_snaps)
    expect(evidence.stop_points).toEqual(result.stop_points)
    expect(evidence.key_players).toEqual(result.key_players)
    expect((evidence.attack_points as { weakness?: string }[])[0].weakness).toBe('soft_coverage')
  })
})
