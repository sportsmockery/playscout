/**
 * Confidence, derived from what the model could actually see.
 *
 * It used to be a free NUMBER the model emitted with nothing anchoring it,
 * defaulted to 0.7 in analyze-position when absent. That number could not be
 * calibrated (nobody could ask whether 0.8-confidence claims are right 80% of
 * the time), could not be audited, and could not be explained to a coach — it
 * was a decoration on the report.
 *
 * The model now reports what it could see; the number is computed from that.
 * Which means the UI can say WHY confidence is low, and the same inputs always
 * give the same answer.
 */

export const SUBJECT_IDENTIFICATION = ['yes', 'inferred', 'no'] as const
export type SubjectIdentification = (typeof SUBJECT_IDENTIFICATION)[number]

export const VIEW_QUALITY = ['tight', 'sideline', 'wide', 'obstructed'] as const
export type ViewQuality = (typeof VIEW_QUALITY)[number]

export interface ConfidenceSignals {
  /** Whether the model actually identified the player it graded. */
  subject_identified?: SubjectIdentification | null
  /** How much of the technique the camera angle could resolve. */
  view_quality?: ViewQuality | null
  /** Rubric cues it could read, out of those it tried to read. */
  criteria_visible?: number | null
  criteria_attempted?: number | null
  /** Moments the subject was blocked from view. */
  occlusion_events?: number | null
}

/**
 * Starting point before any deduction. Not 1.0: film analysis of a single rep
 * is never certain, and the product's own rules say never to claim it is.
 */
const BASE = 0.85

const SUBJECT_PENALTY: Record<SubjectIdentification, number> = {
  yes: 0,
  // Grading "the left tackle" without knowing which player that is still
  // describes a real rep, but it is a weaker claim.
  inferred: 0.12,
  no: 0.3,
}

/**
 * Youth sideline film is the common case and it genuinely cannot resolve hand
 * placement or foot position — the penalty reflects the angle, not the model.
 */
const VIEW_PENALTY: Record<ViewQuality, number> = {
  tight: 0,
  sideline: 0.1,
  wide: 0.22,
  obstructed: 0.35,
}

export interface DerivedConfidence {
  value: number
  /** Coach-readable reasons, so a low number is explained rather than asserted. */
  reasons: string[]
}

export function deriveConfidence(signals: ConfidenceSignals): DerivedConfidence {
  const reasons: string[] = []
  let value = BASE

  const subject = signals.subject_identified
  if (subject && subject !== 'yes') {
    value -= SUBJECT_PENALTY[subject]
    reasons.push(
      subject === 'no'
        ? 'The subject could not be identified in this clip.'
        : 'The subject was identified by role rather than recognised outright.'
    )
  }

  const view = signals.view_quality
  if (view && view !== 'tight') {
    value -= VIEW_PENALTY[view]
    reasons.push(
      view === 'obstructed'
        ? 'The view of the subject was blocked for part of the rep.'
        : `The angle is ${view} — fine detail like hand placement is not resolvable.`
    )
  }

  // How much of the rubric the film actually supported. Half the cues visible
  // is a materially weaker read than all of them, however confident the prose.
  const attempted = signals.criteria_attempted ?? 0
  const visible = signals.criteria_visible ?? 0
  if (attempted > 0) {
    const coverage = Math.min(1, Math.max(0, visible / attempted))
    if (coverage < 1) {
      value -= (1 - coverage) * 0.3
      reasons.push(
        `Only ${visible} of ${attempted} technique cues were visible on this rep.`
      )
    }
  }

  const occlusions = signals.occlusion_events ?? 0
  if (occlusions > 0) {
    value -= Math.min(0.15, occlusions * 0.05)
    reasons.push(
      `The subject was blocked from view ${occlusions} ${occlusions === 1 ? 'time' : 'times'}.`
    )
  }

  return { value: round2(Math.min(0.95, Math.max(0.05, value))), reasons }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** The Gemini-side declaration of the signals the model reports. */
export const CONFIDENCE_SIGNALS_SCHEMA = {
  subject_identified: { type: 'STRING', enum: [...SUBJECT_IDENTIFICATION] },
  view_quality: { type: 'STRING', enum: [...VIEW_QUALITY] },
  criteria_visible: { type: 'INTEGER' },
  criteria_attempted: { type: 'INTEGER' },
  occlusion_events: { type: 'INTEGER' },
}

export const CONFIDENCE_PROMPT = `CONFIDENCE — do not give a number. Report what you could see and
the number is computed from it:
  - subject_identified: yes (you know which player this is) | inferred (you graded a role, e.g.
    "the left tackle", without identifying the player) | no
  - view_quality: tight | sideline | wide | obstructed
  - criteria_attempted / criteria_visible: how many rubric cues you tried to read, and how many
    the film actually let you read
  - occlusion_events: how many times the subject was blocked from view
A wide angle honestly reported beats a confident number over a read you could not make.`
