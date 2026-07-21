import { describe, it, expect } from 'vitest'
import { estimateCostUsd } from './pricing'

describe('estimateCostUsd', () => {
  it('computes gemini-2.5-pro cost from the documented per-1M rates', () => {
    // 15,000 input @ $1.25/1M + 800 output @ $10/1M
    const cost = estimateCostUsd('google', 'gemini-2.5-pro', 15000, 800)
    expect(cost).toBeCloseTo(0.02675, 5)
  })

  it('computes claude-opus-4-5 cost from the documented per-1M rates', () => {
    // 2,000 input @ $15/1M + 500 output @ $75/1M
    const cost = estimateCostUsd('anthropic', 'claude-opus-4-5', 2000, 500)
    expect(cost).toBeCloseTo(0.0675, 5)
  })

  it('returns 0 for zero tokens', () => {
    expect(estimateCostUsd('google', 'gemini-2.5-pro', 0, 0)).toBe(0)
  })

  it('returns 0 for an unknown provider/model pair rather than throwing', () => {
    expect(estimateCostUsd('made-up-provider', 'made-up-model', 1000, 1000)).toBe(0)
  })

  it('scales linearly with token count', () => {
    const one = estimateCostUsd('anthropic', 'claude-sonnet-4-5', 1000, 0)
    const ten = estimateCostUsd('anthropic', 'claude-sonnet-4-5', 10000, 0)
    expect(ten).toBeCloseTo(one * 10, 8)
  })
})
