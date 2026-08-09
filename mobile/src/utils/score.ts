/**
 * Score bands are relative to the team's level (calibrated server-side). We
 * never attach color-only meaning: every band carries a word.
 * 90-100 Elite | 80-89 Advanced | 70-79 Solid | 60-69 Developing | <60 Beginner
 */
export type ScoreTone = 'elite' | 'advanced' | 'solid' | 'developing' | 'beginner';

export interface ScoreBand {
  label: string;
  tone: ScoreTone;
}

export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 90) return { label: 'Elite', tone: 'elite' };
  if (score >= 80) return { label: 'Advanced', tone: 'advanced' };
  if (score >= 70) return { label: 'Solid', tone: 'solid' };
  if (score >= 60) return { label: 'Developing', tone: 'developing' };
  return { label: 'Beginner', tone: 'beginner' };
}

/**
 * Confidence is DISTINCT from the performance score — it describes how much the
 * film supports the read, not how good the play was. Stored 0..1.
 */
export type ConfidenceTone = 'high' | 'medium' | 'low';

export interface ConfidenceView {
  pct: number;
  label: string;
  tone: ConfidenceTone;
}

export function confidenceView(confidence: number | null | undefined): ConfidenceView | null {
  if (confidence == null || Number.isNaN(confidence)) return null;
  const pct = Math.round(confidence * 100);
  if (confidence >= 0.75) return { pct, label: 'High confidence', tone: 'high' };
  if (confidence >= 0.5) return { pct, label: 'Moderate confidence', tone: 'medium' };
  return { pct, label: 'Low confidence', tone: 'low' };
}

/** "14 plays" / "1 play" / "Not enough film" for a sample size. */
export function sampleSizeLabel(n: number | null | undefined): string {
  if (n == null || n <= 0) return 'No plays observed';
  if (n === 1) return '1 play — limited evidence';
  if (n < 5) return `${n} plays — limited evidence`;
  return `${n} plays`;
}
