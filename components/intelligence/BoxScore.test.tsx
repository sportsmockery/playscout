import { describe, it, expect } from 'vitest'
import { yardsOrDash } from './BoxScore'

/**
 * Reported from a real sheet: the QB row read "YDS 0" while the Team row
 * directly beneath it read "YDS —" for the same single completion.
 *
 * Both came from this rule; only the totals were passed through it. A sheet
 * that makes two different claims about one play in two adjacent rows gives a
 * coach no reason to trust any number on it — which is exactly what happened.
 */
describe('zero yards and unmeasured yards are different facts', () => {
  it('shows a dash when every attempt behind the figure was unmeasurable', () => {
    expect(yardsOrDash(0, 1, 1)).toBe('—')
    expect(yardsOrDash(0, 7, 7)).toBe('—')
  })

  it('shows a real zero when the plays were measured and gained nothing', () => {
    // Two carries, both measured, both stuffed. That is a 0, not a dash.
    expect(yardsOrDash(0, 2, 0)).toBe(0)
  })

  it('shows the measured total when only SOME attempts were unmeasurable', () => {
    // "7 carries, 22 yards" reads as the yards from the carries that could be
    // measured — the unmeasured ones are reported separately, not as zero.
    expect(yardsOrDash(22, 7, 3)).toBe(22)
    expect(yardsOrDash(0, 7, 3)).toBe(0)
  })

  it('shows zero rather than a dash when there were no attempts at all', () => {
    // Nothing to be unmeasured about; an empty line is legitimately 0.
    expect(yardsOrDash(0, 0, 0)).toBe(0)
  })

  it('never dashes a non-zero figure', () => {
    expect(yardsOrDash(55, 1, 1)).toBe(55)
    expect(yardsOrDash(-4, 1, 1)).toBe(-4)
  })
})
