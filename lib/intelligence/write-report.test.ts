import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const callClaude = vi.fn()
const recordUsage = vi.fn()

vi.mock('@/lib/ai/providers/anthropic', () => ({ callClaude }))
vi.mock('@/lib/ai/record-usage', () => ({ recordUsage }))

const { writeReport, parseWrittenReport } = await import('./write-report')
const { QBIQ_RUBRIC } = await import('./rubrics')

const supabase = {} as SupabaseClient
const ctx = { rubric: QBIQ_RUBRIC, tier: 'varsity' as const, teamId: 't1', userId: 'u1' }

const observation = {
  moduleKey: 'QBIQ',
  positionScores: { mechanics: 72, decision_making: 80, pocket_presence: null },
  overallScore: 76,
  prescriptions: [
    { drill_id: 'line_to_target_step', fixes_cue: 'stride_length', why_this_rep: 'Front foot closed.', name: 'Line-to-target step drill' },
  ],
  confidenceReasons: ['The angle is sideline — fine detail is not resolvable.'],
  breakdown: {
    phases: [{ phase: 'snap', at_seconds: 0.4, observed: 'Clean gun catch' }],
    cue_notes: [
      {
        cue: 'stride_length',
        dimension: 'mechanics',
        verdict: 'below_standard',
        visible_marker: 'Front foot lands closed, pointing at the near hash',
        at_seconds: 2.1,
      },
    ],
    not_evaluable: [{ cue: 'eye_discipline', dimension: 'decision_making', why: 'Camera stayed on the ball' }],
    key_moment: { at_seconds: 2.1, why_it_decided_the_rep: 'The closed front foot pulled the throw wide' },
  },
}

const good = JSON.stringify({
  summary: 'Solid rep with one correctable.',
  reasoning: { mechanics: 'At 2.1s the front foot lands closed.' },
  strengths: ['Clean gun catch at 0.4s'],
  weaknesses: ['Front foot closed at 2.1s'],
})

function lastCall() {
  const [, system, messages, opts] = callClaude.mock.calls.at(-1)!
  return { system: system as string, message: (messages as { content: string }[])[0].content, opts }
}

describe('writeReport', () => {
  beforeEach(() => {
    callClaude.mockReset()
    recordUsage.mockReset()
    callClaude.mockResolvedValue({ text: good, usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } })
  })

  it('hands the writer the observations and nothing else to go on', async () => {
    await writeReport(observation, ctx, supabase)
    const { system, message } = lastCall()

    // The constraint that makes longer prose better rather than just longer.
    expect(system).toContain('YOU ARE WRITING THE REPORT, NOT WATCHING THE FILM')
    expect(system).toContain('you did not see the film')

    expect(message).toContain('Front foot lands closed, pointing at the near hash')
    expect(message).toContain('2.1s')
    expect(message).toContain('Camera stayed on the ball')
    expect(message).toContain('The angle is sideline')
  })

  it('tells the writer a null dimension had no evidence, not a zero', async () => {
    await writeReport(observation, ctx, supabase)
    expect(lastCall().message).toContain('pocket_presence: no applicable evidence on this rep')
  })

  it('keeps the volatile half out of the cached prefix', async () => {
    // The system half must be identical for every clip in a batch, or the
    // cache never hits and the per-clip write pass costs full price.
    await writeReport(observation, ctx, supabase)
    const first = lastCall()

    await writeReport({ ...observation, playerName: 'Someone Else' }, ctx, supabase)
    const second = lastCall()

    expect(second.system).toBe(first.system)
    expect(second.message).not.toBe(first.message)
    expect(first.opts).toMatchObject({ cacheSystem: true })
  })

  it('records what the write pass cost', async () => {
    await writeReport(observation, ctx, supabase)
    expect(recordUsage).toHaveBeenCalledWith(supabase, expect.objectContaining({
      teamId: 't1',
      jobType: 'report_generation',
    }))
  })

  it('returns null rather than throwing when the write pass fails', async () => {
    // An Anthropic outage should cost a coach a better write-up, not their
    // analysis — the observation pass prose is the fallback.
    callClaude.mockRejectedValue(new Error('529'))
    expect(await writeReport(observation, ctx, supabase)).toBeNull()
  })

  it('returns null on an unusable response instead of an empty report', async () => {
    callClaude.mockResolvedValue({ text: 'I cannot help with that.', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } })
    expect(await writeReport(observation, ctx, supabase)).toBeNull()
  })
})

describe('parseWrittenReport', () => {
  it('reads JSON wrapped in prose or a fence', () => {
    const out = parseWrittenReport('Here you go:\n```json\n' + good + '\n```')
    expect(out?.summary).toBe('Solid rep with one correctable.')
    expect(out?.strengths).toHaveLength(1)
  })

  it('rejects a report with no summary', () => {
    expect(parseWrittenReport(JSON.stringify({ strengths: ['a'] }))).toBeNull()
    expect(parseWrittenReport(JSON.stringify({ summary: '   ' }))).toBeNull()
  })

  it('drops non-string entries rather than rendering them', () => {
    const out = parseWrittenReport(
      JSON.stringify({ summary: 'ok', strengths: ['a', 3, '', null], reasoning: { m: 'x', n: 7 } })
    )
    expect(out?.strengths).toEqual(['a'])
    expect(out?.reasoning).toEqual({ m: 'x' })
  })

  it('returns null on malformed JSON', () => {
    expect(parseWrittenReport('{ not json')).toBeNull()
    expect(parseWrittenReport('')).toBeNull()
  })
})
