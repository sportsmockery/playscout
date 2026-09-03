import { contentWords, jaccard } from './aggregate-batch'

// Weighted rollup for team_tendencies: each new clip analyzed contributes a
// sample_size-weighted vote toward the team's rolling tendency, so a team
// with 10 clips of evidence isn't jerked around by one weird clip the way a
// last-write-wins overwrite would.

export interface TendencyObservation {
  tendency_type: string
  label: string
  rate: number | null
  confidence: number
  sample_size: number
}

// A single clip is not a season sample — cap confidence low so the UI and
// chat don't present a one-play read as an established tendency.
const LONE_SAMPLE_CONFIDENCE_CAP = 0.4

export function rollupTendency(
  existing: TendencyObservation | null,
  incoming: TendencyObservation
): TendencyObservation {
  const incomingSample = Math.max(incoming.sample_size, 0)

  if (!existing) {
    return {
      ...incoming,
      sample_size: incomingSample,
      confidence: incomingSample <= 1 ? Math.min(incoming.confidence, LONE_SAMPLE_CONFIDENCE_CAP) : incoming.confidence,
    }
  }

  const totalSample = existing.sample_size + incomingSample
  if (totalSample === 0) {
    return { ...incoming, sample_size: 0 }
  }

  // weighted_rate = Σ(rate_i × plays_observed_i) / Σ plays_observed
  const rate =
    existing.rate != null && incoming.rate != null
      ? (existing.rate * existing.sample_size + incoming.rate * incomingSample) / totalSample
      : incoming.rate ?? existing.rate

  const confidence =
    (existing.confidence * existing.sample_size + incoming.confidence * incomingSample) / totalSample

  return {
    tendency_type: incoming.tendency_type,
    label: incoming.label || existing.label,
    rate,
    sample_size: totalSample,
    confidence: totalSample <= 1 ? Math.min(confidence, LONE_SAMPLE_CONFIDENCE_CAP) : confidence,
  }
}

/**
 * Finds the existing row a new observation belongs to.
 *
 * persist-intelligence used to match on exact string equality of a free-text
 * label, so "Runs right from tight double wing" and "Runs to the right out of
 * the tight double wing" became two rows with half the sample each — and a
 * season aggregate built from them under-counted every tendency it held. The
 * same problem aggregate-batch already solved for repeated coaching points,
 * with the same tool: compare content words, not characters.
 */
const SAME_TENDENCY_SIMILARITY = 0.5

export function matchTendencyLabel<T extends { label: string }>(
  candidates: T[],
  incomingLabel: string,
  similarity = SAME_TENDENCY_SIMILARITY
): T | null {
  const words = contentWords(incomingLabel)
  if (!words.size) return null

  let best: T | null = null
  let bestScore = 0
  for (const c of candidates) {
    const score = jaccard(words, contentWords(c.label))
    if (score >= similarity && score > bestScore) {
      best = c
      bestScore = score
    }
  }
  return best
}
