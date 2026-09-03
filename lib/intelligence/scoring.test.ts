import { describe, it, expect } from 'vitest'
import { computeOverall, weightsFor, scoreBand } from './scoring'
import { deriveConfidence } from './confidence'
import { QBIQ_RUBRIC } from './rubrics'

describe('computeOverall', () => {
  const w = { mechanics: 0.4, decision_making: 0.4, pocket_presence: 0.2 }

  it('applies the documented weights', () => {
    const out = computeOverall({ mechanics: 80, decision_making: 70, pocket_presence: 60 }, w)
    expect(out.value).toBe(72) // 0.4*80 + 0.4*70 + 0.2*60
    expect(out.skipped).toEqual([])
  })

  it('reweights the dimensions that have evidence', () => {
    // A run-only clip has no pocket_presence evidence. Its 20% is
    // redistributed 50/50, not scored as a zero and not silently dropped.
    const out = computeOverall({ mechanics: 80, decision_making: 70, pocket_presence: null }, w)
    expect(out.value).toBe(75)
    expect(out.skipped).toEqual(['pocket_presence'])
    expect(out.weights).toEqual({ mechanics: 0.5, decision_making: 0.5 })
  })

  it('returns null rather than a number when nothing could be graded', () => {
    const out = computeOverall({ mechanics: null, decision_making: null, pocket_presence: null }, w)
    expect(out.value).toBeNull()
    expect(out.skipped).toHaveLength(3)
  })

  it('ignores a dimension the model invented outside the rubric', () => {
    const out = computeOverall({ mechanics: 80, decision_making: 80, pocket_presence: 80, vibes: 100 }, w)
    expect(out.value).toBe(80)
  })

  it('clamps a score outside 0-100', () => {
    expect(computeOverall({ mechanics: 140, decision_making: 100, pocket_presence: 100 }, w).value).toBe(100)
    expect(computeOverall({ mechanics: -20, decision_making: 0, pocket_presence: 0 }, w).value).toBe(0)
  })

  it('takes its weights from the rubric so prompt and arithmetic agree', () => {
    expect(weightsFor(QBIQ_RUBRIC)).toEqual(w)
  })
})

describe('scoreBand', () => {
  it('uses the bands the whole product speaks in', () => {
    expect(scoreBand(95)).toBe('Elite')
    expect(scoreBand(80)).toBe('Advanced')
    expect(scoreBand(70)).toBe('Solid')
    expect(scoreBand(60)).toBe('Developing')
    expect(scoreBand(41)).toBe('Beginner')
  })
})

describe('deriveConfidence', () => {
  it('is highest when the subject is known and the angle is tight', () => {
    const out = deriveConfidence({
      subject_identified: 'yes',
      view_quality: 'tight',
      criteria_visible: 8,
      criteria_attempted: 8,
    })
    expect(out.value).toBeGreaterThan(0.8)
    expect(out.reasons).toEqual([])
  })

  it('explains itself rather than just being low', () => {
    // The old free number could not be explained to a coach at all.
    const out = deriveConfidence({
      subject_identified: 'no',
      view_quality: 'wide',
      criteria_visible: 3,
      criteria_attempted: 12,
      occlusion_events: 2,
    })
    expect(out.value).toBeLessThan(0.3)
    expect(out.reasons.join(' ')).toContain('could not be identified')
    expect(out.reasons.join(' ')).toContain('3 of 12')
  })

  it('penalises a role-only identification less than a failed one', () => {
    const inferred = deriveConfidence({ subject_identified: 'inferred', view_quality: 'tight' })
    const none = deriveConfidence({ subject_identified: 'no', view_quality: 'tight' })
    expect(inferred.value).toBeGreaterThan(none.value)
  })

  it('scales with how much of the rubric the film supported', () => {
    const half = deriveConfidence({ criteria_visible: 5, criteria_attempted: 10 })
    const all = deriveConfidence({ criteria_visible: 10, criteria_attempted: 10 })
    expect(all.value).toBeGreaterThan(half.value)
  })

  it('never claims certainty and never bottoms out at zero', () => {
    const best = deriveConfidence({ subject_identified: 'yes', view_quality: 'tight' })
    const worst = deriveConfidence({
      subject_identified: 'no',
      view_quality: 'obstructed',
      criteria_visible: 0,
      criteria_attempted: 20,
      occlusion_events: 10,
    })
    expect(best.value).toBeLessThanOrEqual(0.95)
    expect(worst.value).toBeGreaterThanOrEqual(0.05)
  })

  it('is reproducible for the same inputs', () => {
    const signals = { subject_identified: 'inferred' as const, view_quality: 'sideline' as const }
    expect(deriveConfidence(signals)).toEqual(deriveConfidence(signals))
  })
})
