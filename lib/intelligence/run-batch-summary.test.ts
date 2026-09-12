import { describe, it, expect } from 'vitest'
import { summaryTokenBudget } from './run-batch-summary'

describe('summaryTokenBudget', () => {
  // The bug this exists to prevent: a fixed 8000 truncated a 191-clip report
  // mid-word, which surfaced to the coach as "Invalid JSON from batch summary"
  // followed by 200 characters of a perfectly good report.
  it('gives a 191-clip batch far more room than the fixed 8000 that truncated it', () => {
    expect(summaryTokenBudget(191)).toBeGreaterThan(30_000)
  })

  it('grows with the batch, because every clip needs its own comment', () => {
    expect(summaryTokenBudget(100)).toBeGreaterThan(summaryTokenBudget(10))
    expect(summaryTokenBudget(10)).toBeGreaterThan(summaryTokenBudget(2))
  })

  it('still gives a two-clip batch room for the narrative around the comments', () => {
    expect(summaryTokenBudget(2)).toBeGreaterThan(8_000)
  })

  // Opus 5 tops out at 128k output, and adaptive thinking spends from the
  // same budget — an unbounded formula would eventually just 400.
  it('caps below the model ceiling however many clips arrive', () => {
    expect(summaryTokenBudget(10_000)).toBeLessThanOrEqual(64_000)
  })
})
