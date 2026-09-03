import { describe, it, expect } from 'vitest'
import {
  TENDENCY_TYPES,
  OFFENSIVE_TENDENCY_TYPES,
  DEFENSIVE_TENDENCY_TYPES,
  SHARED_TENDENCY_TYPES,
  SITUATION_BUCKETS,
  EXPLOSIVE_PLAY_YARDS,
  EXPLOSIVE_CAUSES,
  buildTaxonomyPrompt,
} from './taxonomy'
import { matchTendencyLabel, rollupTendency } from './tendency-rollup'
import { buildTEAMIQSystemPrompt } from './modules/teamiq'
import { buildSCOUTIQSystemPrompt } from './modules/scoutiq'

describe('tendency taxonomy', () => {
  it('carries the sixteen documented types', () => {
    // The prompts used to emit ten values disjoint from the documented set —
    // blitz_tendency was the only one present in both, so anything written
    // against the documented taxonomy matched nothing.
    expect(TENDENCY_TYPES).toHaveLength(16)
    expect(new Set(TENDENCY_TYPES).size).toBe(16)
    expect(TENDENCY_TYPES).toContain('perimeter_run')
    expect(TENDENCY_TYPES).toContain('gap_loss_inside_out')
    expect(TENDENCY_TYPES).toContain('hash_tendency')
  })

  it('does not carry the old prompt-only values', () => {
    for (const stale of ['formation_frequency', 'run_direction', 'play_family', 'coverage_shell']) {
      expect(TENDENCY_TYPES as readonly string[]).not.toContain(stale)
    }
  })

  it('keeps the three groups distinct', () => {
    const groups = [OFFENSIVE_TENDENCY_TYPES, DEFENSIVE_TENDENCY_TYPES, SHARED_TENDENCY_TYPES]
    const total = groups.reduce((n, g) => n + g.length, 0)
    expect(total).toBe(TENDENCY_TYPES.length)
  })

  it('states the explosive-play threshold the prompts never did', () => {
    expect(EXPLOSIVE_PLAY_YARDS).toBe(10)
    expect(EXPLOSIVE_CAUSES).toEqual(['force_failure', 'gap_failure', 'pursuit_failure'])
  })

  it('defines all seven situation buckets, not the two that used to ship', () => {
    expect(SITUATION_BUCKETS).toHaveLength(7)
    expect(SITUATION_BUCKETS).toContain('money_down')
    expect(SITUATION_BUCKETS).toContain('backed_up')
  })
})

describe('the prompts carry the shared vocabulary', () => {
  const base = { moduleKey: 'TEAMIQ', teamId: 't1', frames: [] as string[] }

  it.each([
    ['TEAMIQ', () => buildTEAMIQSystemPrompt(base)],
    ['SCOUTIQ', () => buildSCOUTIQSystemPrompt({ ...base, moduleKey: 'SCOUTIQ' })],
  ])('%s lists the tendency types and formations', (_name, build) => {
    const prompt = build()
    expect(prompt).toContain('perimeter_run')
    expect(prompt).toContain('double_wing')
    expect(prompt).toContain('money_down')
    expect(prompt).toContain('10+ yards')
    expect(prompt).not.toContain('formation_frequency')
  })

  it('explains why free naming costs the team evidence', () => {
    expect(buildTaxonomyPrompt()).toContain('cannot be counted')
  })
})

describe('matchTendencyLabel', () => {
  const rows = [
    { id: 'a', label: 'Runs right from tight double wing' },
    { id: 'b', label: 'Blitzes the boundary A gap on third and long' },
  ]

  it('matches the same tendency worded differently', () => {
    // This is the bug: exact string equality split these into two rows with
    // half the sample each, and the season aggregate under-counted both.
    const hit = matchTendencyLabel(rows, 'Runs to the right out of the tight double wing')
    expect(hit?.id).toBe('a')
  })

  it('does not merge two genuinely different tendencies', () => {
    expect(matchTendencyLabel(rows, 'Sweeps left from trips')).toBeNull()
  })

  it('picks the closest of several candidates', () => {
    const hit = matchTendencyLabel(
      [...rows, { id: 'c', label: 'Runs right from double wing on first down' }],
      'Runs right from tight double wing'
    )
    expect(hit?.id).toBe('a')
  })

  it('returns nothing for an empty label or empty candidate list', () => {
    expect(matchTendencyLabel(rows, '   ')).toBeNull()
    expect(matchTendencyLabel([], 'Runs right')).toBeNull()
  })
})

describe('rollup after a match', () => {
  it('accumulates one tendency instead of two half-samples', () => {
    const first = rollupTendency(null, {
      tendency_type: 'perimeter_run',
      label: 'Runs right from tight double wing',
      rate: 0.7,
      confidence: 0.6,
      sample_size: 10,
    })
    const merged = rollupTendency(first, {
      tendency_type: 'perimeter_run',
      label: 'Runs to the right out of the tight double wing',
      rate: 0.8,
      confidence: 0.7,
      sample_size: 10,
    })

    expect(merged.sample_size).toBe(20)
    expect(merged.rate).toBeCloseTo(0.75)
  })
})
