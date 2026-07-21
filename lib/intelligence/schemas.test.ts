import { describe, it, expect } from 'vitest'
import { PositionAnalysisInputSchema, PositionAnalysisOutputSchema } from './schemas'

describe('PositionAnalysisInputSchema', () => {
  it('accepts a minimal valid input', () => {
    const result = PositionAnalysisInputSchema.safeParse({ moduleKey: 'QBIQ', teamId: 'team-1' })
    expect(result.success).toBe(true)
  })

  it('defaults frames to an empty array when omitted', () => {
    const result = PositionAnalysisInputSchema.parse({ moduleKey: 'QBIQ', teamId: 'team-1' })
    expect(result.frames).toEqual([])
  })

  it('rejects a missing teamId', () => {
    const result = PositionAnalysisInputSchema.safeParse({ moduleKey: 'QBIQ' })
    expect(result.success).toBe(false)
  })
})

describe('PositionAnalysisOutputSchema — rejects malformed model output', () => {
  const validOutput = {
    overall_score: 82,
    position_scores: { mechanics: 80, decision_making: null },
    reasoning: { mechanics: 'Good base width.' },
    strengths: ['Quick release'],
    weaknesses: ['Footwork under pressure'],
    drills: ['3-step drop reps'],
    summary: 'Solid outing overall.',
    confidence: 0.8,
    evidence_frames: [2, 5, 9],
  }

  it('accepts a well-formed response', () => {
    expect(PositionAnalysisOutputSchema.safeParse(validOutput).success).toBe(true)
  })

  it('accepts a response missing optional fields', () => {
    const required = { ...validOutput } as Record<string, unknown>
    delete required.confidence
    delete required.evidence_frames
    delete required.plays_observed
    expect(PositionAnalysisOutputSchema.safeParse(required).success).toBe(true)
  })

  it('rejects a response missing a required field (summary)', () => {
    const broken = { ...validOutput } as Record<string, unknown>
    delete broken.summary
    expect(PositionAnalysisOutputSchema.safeParse(broken).success).toBe(false)
  })

  it('rejects overall_score sent as a string instead of a number', () => {
    const broken = { ...validOutput, overall_score: '82' }
    expect(PositionAnalysisOutputSchema.safeParse(broken).success).toBe(false)
  })

  it('rejects strengths sent as a single string instead of an array', () => {
    const broken = { ...validOutput, strengths: 'Quick release' }
    expect(PositionAnalysisOutputSchema.safeParse(broken).success).toBe(false)
  })

  it('rejects a non-object entirely (e.g. the model returned a bare string)', () => {
    expect(PositionAnalysisOutputSchema.safeParse('not an object').success).toBe(false)
  })

  it('allows a null score inside position_scores (the "no evidence" convention)', () => {
    const withNull = { ...validOutput, position_scores: { pocket_presence: null } }
    expect(PositionAnalysisOutputSchema.safeParse(withNull).success).toBe(true)
  })
})
