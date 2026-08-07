import { describe, it, expect } from 'vitest'
import { rollupTendency } from './tendency-rollup'

describe('rollupTendency', () => {
  it('caps confidence for a lone-clip (sample_size <= 1) observation', () => {
    const result = rollupTendency(null, {
      tendency_type: 'run_direction', label: 'Runs right', rate: 0.8, confidence: 0.9, sample_size: 1,
    })
    expect(result.confidence).toBeLessThanOrEqual(0.4)
  })

  it('does not cap confidence when the first observation has a real sample', () => {
    const result = rollupTendency(null, {
      tendency_type: 'run_direction', label: 'Runs right', rate: 0.7, confidence: 0.75, sample_size: 14,
    })
    expect(result.confidence).toBe(0.75)
  })

  it('weight-averages rate by sample size across two clips', () => {
    const existing = { tendency_type: 'run_direction', label: 'Runs right', rate: 0.8, confidence: 0.6, sample_size: 10 }
    const incoming = { tendency_type: 'run_direction', label: 'Runs right', rate: 0.4, confidence: 0.5, sample_size: 10 }
    const result = rollupTendency(existing, incoming)
    // (0.8*10 + 0.4*10) / 20 = 0.6
    expect(result.rate).toBeCloseTo(0.6)
    expect(result.sample_size).toBe(20)
  })

  it('weight-averages confidence proportionally to sample size', () => {
    const existing = { tendency_type: 'front', label: '4-4', rate: null, confidence: 0.9, sample_size: 30 }
    const incoming = { tendency_type: 'front', label: '4-4', rate: null, confidence: 0.3, sample_size: 1 }
    const result = rollupTendency(existing, incoming)
    // (0.9*30 + 0.3*1) / 31 ≈ 0.8806
    expect(result.confidence).toBeCloseTo(0.8806, 3)
  })

  it('falls back to the incoming rate when the existing tendency has no rate', () => {
    const existing = { tendency_type: 'formation_frequency', label: 'Tight double wing', rate: null, confidence: 0.5, sample_size: 5 }
    const incoming = { tendency_type: 'formation_frequency', label: 'Tight double wing', rate: 0.6, confidence: 0.5, sample_size: 5 }
    const result = rollupTendency(existing, incoming)
    expect(result.rate).toBe(0.6)
  })
})
