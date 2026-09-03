import { describe, it, expect } from 'vitest'
import {
  hasAnchor,
  measureDepth,
  measureSpecificity,
  findBoilerplate,
  type QualityInput,
} from './report-quality'
import { QBIQ_CUES } from './rubrics/cues'

const note = (over: Partial<{ cue: string; visible_marker: string; at_seconds: number | null }> = {}) => ({
  cue: 'base_width',
  dimension: 'mechanics',
  verdict: 'at_standard',
  visible_marker: 'feet land just outside the shoulders as the ball comes out',
  at_seconds: 1.2,
  ...over,
})

describe('hasAnchor', () => {
  it('recognises the anchors the prompt asks for', () => {
    expect(hasAnchor('frame 6: hands land outside')).toBe(true)
    expect(hasAnchor('at 00:02.4 the front foot lands closed')).toBe(true)
    expect(hasAnchor('2.4s into the rep he bails')).toBe(true)
  })

  it('rejects a claim with nothing to check it against', () => {
    expect(hasAnchor('needs to improve his footwork')).toBe(false)
    expect(hasAnchor('good pocket presence overall')).toBe(false)
  })
})

describe('measureDepth', () => {
  it('counts claims and how much of the catalog was accounted for', () => {
    const total = Object.values(QBIQ_CUES).flat().length
    const depth = measureDepth(
      {
        strengths: ['a', 'b'],
        weaknesses: ['c'],
        reasoning: { mechanics: 'x', decision_making: 'y' },
        breakdown: {
          cue_notes: [note(), note({ cue: 'release_point' })],
          not_evaluable: [{ cue: 'eye_discipline', dimension: 'decision_making', why: 'angle' }],
        },
      },
      QBIQ_CUES
    )

    expect(depth.claims).toBe(5)
    expect(depth.cueNotes).toBe(2)
    expect(depth.notEvaluable).toBe(1)
    expect(depth.catalogCoverage).toBeCloseTo(3 / total)
  })

  it('scores the old flat report shape as zero coverage', () => {
    // This is the baseline the change has to beat: three bullets and a
    // paragraph, accounting for none of the catalog.
    const depth = measureDepth(
      { strengths: ['a'], weaknesses: ['b'], summary: 'solid rep' },
      QBIQ_CUES
    )
    expect(depth.catalogCoverage).toBe(0)
  })
})

describe('measureSpecificity', () => {
  it('reports the share of claims that point at a moment', () => {
    const spec = measureSpecificity({
      strengths: ['frame 4: steps to the target'],
      weaknesses: ['needs to be more consistent'],
      breakdown: { cue_notes: [note(), note({ at_seconds: null })] },
    })

    expect(spec.anchoredProse).toBe(0.5)
    expect(spec.anchoredCues).toBe(0.5)
  })

  it('catches a marker that just renames the cue', () => {
    // "poor mechanics" for the cue `mechanics` describes nothing that was on
    // screen — it is the generic failure wearing the schema's clothes.
    const spec = measureSpecificity({
      breakdown: {
        cue_notes: [
          note({ cue: 'base_width', visible_marker: 'base width' }),
          note({ cue: 'release_point', visible_marker: 'poor release point' }),
          note({ cue: 'follow_through', visible_marker: 'hand finishes across the body, thumb down' }),
        ],
      },
    })

    expect(spec.emptyMarkers).toBe(2)
  })

  it('handles a report with nothing in it', () => {
    expect(measureSpecificity({})).toEqual({
      anchoredProse: 0,
      anchoredCues: 0,
      emptyMarkers: 0,
    })
  })
})

describe('findBoilerplate', () => {
  const prior: QualityInput[] = [
    { weaknesses: ['The quarterback needs to improve his footwork and step toward the target'] },
  ]

  it('flags a claim that is a near-copy of one from another clip', () => {
    const hits = findBoilerplate(
      { weaknesses: ['The quarterback needs to improve footwork and step toward his target'] },
      prior
    )

    expect(hits).toHaveLength(1)
    expect(hits[0].score).toBeGreaterThanOrEqual(0.75)
  })

  it('leaves a genuinely clip-specific claim alone', () => {
    const hits = findBoilerplate(
      { weaknesses: ['At 00:02.1 the front foot lands closed, pulling the throw wide of the hash'] },
      prior
    )
    expect(hits).toEqual([])
  })

  it('reports nothing when there is no history to compare against', () => {
    expect(findBoilerplate({ weaknesses: ['anything'] }, [])).toEqual([])
  })

  it('keeps only the closest match per claim', () => {
    const hits = findBoilerplate({ weaknesses: ['needs to improve his footwork and step to the target'] }, [
      ...prior,
      { weaknesses: ['needs to improve his footwork and step to the target'] },
    ])

    expect(hits).toHaveLength(1)
    expect(hits[0].score).toBe(1)
  })
})
