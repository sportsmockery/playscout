import { describe, it, expect } from 'vitest'
import {
  buildBreakdownPrompt,
  pruneBreakdownCitations,
  breakdownCoverage,
  REP_PHASES,
  CUE_VERDICTS,
  type RepBreakdown,
} from './breakdown'
import { QBIQ_CUES, OLIQ_CUES, RBIQ_CUES } from './rubrics/cues'
import { buildQBIQSystemPrompt } from './modules/qbiq'

describe('buildBreakdownPrompt', () => {
  it('names every cue the model is allowed to report', () => {
    // The closed list is the anti-generic mechanism: the model has to say
    // WHICH cue it is describing, so "work on footwork" has no slot.
    const prompt = buildBreakdownPrompt(QBIQ_CUES, 'video')
    for (const cue of Object.values(QBIQ_CUES).flat()) {
      expect(prompt).toContain(cue)
    }
    expect(prompt).toContain('do not invent cue names')
  })

  it('asks for the anchor that exists in the mode being used', () => {
    expect(buildBreakdownPrompt(QBIQ_CUES, 'video')).toContain('`at_seconds`')
    expect(buildBreakdownPrompt(QBIQ_CUES, 'video')).not.toContain('`at_frame`')
    expect(buildBreakdownPrompt(QBIQ_CUES, 'frames')).toContain('`at_frame`')
  })

  it('walks the documented phase ladder', () => {
    expect(buildBreakdownPrompt(OLIQ_CUES, 'frames')).toContain(REP_PHASES.join(' → '))
  })
})

describe('module prompts carry the breakdown', () => {
  it('QBIQ asks for a cue-anchored breakdown and no longer caps length', () => {
    const prompt = buildQBIQSystemPrompt({
      moduleKey: 'QBIQ',
      teamId: 't1',
      frames: [],
      evidenceMode: 'video',
    })

    expect(prompt).toContain('REP BREAKDOWN')
    expect(prompt).toContain('hip_shoulder_separation')
    expect(prompt).toContain('LENGTH FOLLOWS EVIDENCE')
    // The instruction that was holding every dimension to a paragraph.
    expect(prompt).not.toContain('2-3 sentences')
  })
})

describe('pruneBreakdownCitations', () => {
  const breakdown = (over: Partial<RepBreakdown> = {}): RepBreakdown => ({
    phases: [{ phase: 'snap', at_seconds: 1, observed: 'clean exchange' }],
    cue_notes: [
      { cue: 'base_width', dimension: 'mechanics', verdict: 'at_standard', visible_marker: 'm', at_seconds: 2 },
    ],
    not_evaluable: [],
    coaching_point: 'step to your target',
    ...over,
  })

  const opts = { clipSeconds: 6, shownFrames: new Set<number>([0, 3]), mode: 'video' as const }

  it('keeps anchors that fall inside the clip', () => {
    const out = pruneBreakdownCitations(breakdown(), opts)
    expect(out?.phases?.[0].at_seconds).toBe(1)
    expect(out?.cue_notes?.[0].at_seconds).toBe(2)
  })

  it('drops a second the model could not have seen', () => {
    // A citation past the end of the clip would seek a coach to nothing.
    const out = pruneBreakdownCitations(
      breakdown({ phases: [{ phase: 'finish', at_seconds: 99, observed: 'x' }] }),
      opts
    )
    expect(out?.phases?.[0].at_seconds).toBeNull()
    expect(out?.phases?.[0].observed).toBe('x')
  })

  it('drops a frame index that was never shown', () => {
    const out = pruneBreakdownCitations(
      breakdown({ phases: [{ phase: 'snap', at_frame: 7, observed: 'x' }] }),
      opts
    )
    expect(out?.phases?.[0].at_frame).toBeNull()

    const kept = pruneBreakdownCitations(
      breakdown({ phases: [{ phase: 'snap', at_frame: 3, observed: 'x' }] }),
      opts
    )
    expect(kept?.phases?.[0].at_frame).toBe(3)
  })

  it('prunes the key moment too', () => {
    const out = pruneBreakdownCitations(
      breakdown({ key_moment: { at_seconds: 500, why_it_decided_the_rep: 'sack' } }),
      opts
    )
    expect(out?.key_moment?.at_seconds).toBeNull()
    expect(out?.key_moment?.why_it_decided_the_rep).toBe('sack')
  })

  it('accepts any second when the clip length is unknown', () => {
    const out = pruneBreakdownCitations(breakdown(), { ...opts, clipSeconds: null })
    expect(out?.cue_notes?.[0].at_seconds).toBe(2)
  })

  it('passes an absent breakdown through', () => {
    expect(pruneBreakdownCitations(undefined, opts)).toBeUndefined()
  })
})

describe('breakdownCoverage', () => {
  it('counts how much of the catalog was actually accounted for', () => {
    const total = Object.values(RBIQ_CUES).flat().length
    const coverage = breakdownCoverage(
      {
        cue_notes: [
          { cue: 'correct_arm', dimension: 'ball_security', verdict: 'elite', visible_marker: 'm', at_seconds: 1 },
          { cue: 'high_and_tight', dimension: 'ball_security', verdict: 'at_standard', visible_marker: 'm' },
        ],
        not_evaluable: [{ cue: 'finds_the_cutback', dimension: 'vision_decision', why: 'angle' }],
      },
      RBIQ_CUES
    )

    expect(coverage).toEqual({ evaluated: 2, notEvaluable: 1, total, anchored: 1 })
  })

  it('reports zero coverage for a missing breakdown rather than throwing', () => {
    expect(breakdownCoverage(undefined, QBIQ_CUES).evaluated).toBe(0)
  })
})

describe('cue catalogs', () => {
  it('use stable snake_case ids with no duplicates', () => {
    for (const catalog of [QBIQ_CUES, OLIQ_CUES, RBIQ_CUES]) {
      const cues = Object.values(catalog).flat()
      expect(new Set(cues).size).toBe(cues.length)
      for (const cue of cues) expect(cue).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('cover every dimension each module scores', () => {
    expect(Object.keys(QBIQ_CUES)).toEqual(['mechanics', 'decision_making', 'pocket_presence'])
    expect(Object.keys(OLIQ_CUES)).toEqual(['pass_protection', 'run_blocking', 'footwork_leverage'])
    expect(Object.keys(RBIQ_CUES)).toEqual(['vision_decision', 'ball_security', 'footwork_contact'])
  })

  it('offers verdicts that are anchored, not a free scale', () => {
    expect(CUE_VERDICTS).toContain('at_standard')
    expect(CUE_VERDICTS).not.toContain('not_visible')
  })
})
