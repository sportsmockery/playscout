import { z } from 'zod'
import { Type } from '@google/genai'
import type { EvidenceMode } from './football-brain'

/**
 * The per-rep film breakdown.
 *
 * Reports used to be capped by their own shape: three string arrays and a
 * paragraph, with nowhere for a phase-by-phase read to go and an explicit
 * "2-3 sentences" instruction on top. No amount of prompting gets depth out
 * of a schema that has no room for it, so the room is made here.
 *
 * Three things make the depth real rather than padding:
 *
 * - Every observation carries the moment it was read from, so a claim with no
 *   evidence behind it has no slot to live in.
 * - Cues are a closed set per dimension. The model has to say WHICH cue it is
 *   describing, so "work on footwork" is unrepresentable — it must name the
 *   cue, the visible marker, and where it saw it.
 * - What could NOT be evaluated is a required field, not an omission. An
 *   honest "the angle never showed hand placement" is worth more to a coach
 *   than a confident sentence about hand placement that was inferred.
 */

/**
 * The phase ladder every rep is read against, from IQ_ANALYSIS_KNOWLEDGE_BASE
 * §7.7. Shared across the player modules deliberately: a coach comparing a
 * tackle's rep to a quarterback's should be reading the same timeline.
 */
export const REP_PHASES = ['pre_snap', 'snap', 'develop', 'attack', 'finish'] as const
export type RepPhase = (typeof REP_PHASES)[number]

/**
 * Anchored ordinals rather than a free number. A model asked for a holistic
 * score invents a fresh scale on every call — the same reasoning that put
 * RankerIQ's grade in code (see player-grades.ts). Here it keeps "below
 * standard" meaning the same thing in clip 3 and clip 40.
 */
export const CUE_VERDICTS = [
  'elite',
  'above_standard',
  'at_standard',
  'below_standard',
  'failed',
] as const
export type CueVerdict = (typeof CUE_VERDICTS)[number]

export const PhaseReadSchema = z.object({
  phase: z.string(),
  at_seconds: z.number().nullable().optional(),
  at_frame: z.number().nullable().optional(),
  observed: z.string(),
  verdict: z.string().nullable().optional(),
})
export type PhaseRead = z.infer<typeof PhaseReadSchema>

export const CueNoteSchema = z.object({
  cue: z.string(),
  dimension: z.string(),
  verdict: z.string(),
  visible_marker: z.string(),
  at_seconds: z.number().nullable().optional(),
  at_frame: z.number().nullable().optional(),
})
export type CueNote = z.infer<typeof CueNoteSchema>

export const NotEvaluableSchema = z.object({
  cue: z.string(),
  dimension: z.string(),
  why: z.string(),
})
export type NotEvaluable = z.infer<typeof NotEvaluableSchema>

export const RepBreakdownSchema = z.object({
  phases: z.array(PhaseReadSchema).optional(),
  cue_notes: z.array(CueNoteSchema).optional(),
  not_evaluable: z.array(NotEvaluableSchema).optional(),
  key_moment: z
    .object({
      at_seconds: z.number().nullable().optional(),
      at_frame: z.number().nullable().optional(),
      why_it_decided_the_rep: z.string(),
    })
    .nullable()
    .optional(),
  coaching_point: z.string().optional(),
})
export type RepBreakdown = z.infer<typeof RepBreakdownSchema>

/** The Gemini-side declaration of the same shape. */
export const REP_BREAKDOWN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    phases: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          phase: { type: Type.STRING, enum: [...REP_PHASES] },
          at_seconds: { type: Type.NUMBER, nullable: true },
          at_frame: { type: Type.INTEGER, nullable: true },
          observed: { type: Type.STRING },
          verdict: { type: Type.STRING, enum: [...CUE_VERDICTS], nullable: true },
        },
        required: ['phase', 'observed'],
      },
    },
    cue_notes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cue: { type: Type.STRING },
          dimension: { type: Type.STRING },
          verdict: { type: Type.STRING, enum: [...CUE_VERDICTS] },
          visible_marker: { type: Type.STRING },
          at_seconds: { type: Type.NUMBER, nullable: true },
          at_frame: { type: Type.INTEGER, nullable: true },
        },
        required: ['cue', 'dimension', 'verdict', 'visible_marker'],
      },
    },
    not_evaluable: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cue: { type: Type.STRING },
          dimension: { type: Type.STRING },
          why: { type: Type.STRING },
        },
        required: ['cue', 'dimension', 'why'],
      },
    },
    key_moment: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        at_seconds: { type: Type.NUMBER, nullable: true },
        at_frame: { type: Type.INTEGER, nullable: true },
        why_it_decided_the_rep: { type: Type.STRING },
      },
      required: ['why_it_decided_the_rep'],
    },
    coaching_point: { type: Type.STRING },
  },
  required: ['phases', 'cue_notes', 'not_evaluable', 'coaching_point'],
}

/** One dimension's closed cue list, keyed by the dimension name in the module's scores. */
export type CueCatalog = Record<string, readonly string[]>

/**
 * The prompt block that drives the breakdown. Written once and shared, so the
 * three player modules cannot drift into asking for different depth.
 */
export function buildBreakdownPrompt(
  catalog: CueCatalog,
  mode: EvidenceMode = 'frames'
): string {
  const anchor = mode === 'video' ? '`at_seconds`' : '`at_frame`'
  const cueList = Object.entries(catalog)
    .map(([dimension, cues]) => `  ${dimension}: ${cues.join(', ')}`)
    .join('\n')

  return `REP BREAKDOWN — this is the part a coach actually watches film with, so it carries the detail.

CUE CATALOG (use these exact ids; do not invent cue names):
${cueList}

Fill \`breakdown\`:

1. \`phases\` — walk the rep in order through ${REP_PHASES.join(' → ')}. One entry per phase you
   could see, each with what actually happened (not what usually happens) and ${anchor}. Skip a
   phase only if the clip genuinely does not contain it.

2. \`cue_notes\` — ONE ENTRY PER CUE IN THE CATALOG THAT YOU COULD EVALUATE. Each names the cue id,
   its dimension, a verdict from [${CUE_VERDICTS.join(', ')}], the VISIBLE MARKER you read it from
   (what was on screen — "front foot lands closed, pointing to the near hash", not "poor
   mechanics"), and ${anchor}. This is the difference between a report about this rep and a report
   that would read the same for any player: a marker you could not point at on screen is not a
   marker, so leave that cue out of \`cue_notes\` and put it in \`not_evaluable\` instead.

3. \`not_evaluable\` — every catalog cue you could NOT judge, and why (camera angle, occlusion,
   the play never tested it). A coach needs to know the difference between "he did this badly"
   and "the film never showed it". Between them, \`cue_notes\` and \`not_evaluable\` should account
   for every cue in the catalog for every dimension you scored.

4. \`key_moment\` — the single moment the rep turned on, and why. If nothing decided it, say so.

5. \`coaching_point\` — one sentence you would actually say to this player, in their language.

Verdicts are relative to the standard for THIS team's competition level, not an absolute scale.`
}

/**
 * Drops citations the model could not have made honestly: a second outside
 * the clip it was shown, or a frame index it was never given. Same guard the
 * top-level evidence fields get — a breakdown is the part a coach clicks
 * through, so a bad anchor there seeks them to nothing.
 */
export function pruneBreakdownCitations(
  breakdown: RepBreakdown | undefined,
  opts: { clipSeconds: number | null; shownFrames: Set<number>; mode: EvidenceMode }
): RepBreakdown | undefined {
  if (!breakdown) return undefined

  const seconds = (t?: number | null) =>
    t == null || !Number.isFinite(t) || t < 0 || (opts.clipSeconds != null && t > opts.clipSeconds)
      ? null
      : t

  const frame = (i?: number | null) => (i != null && opts.shownFrames.has(i) ? i : null)

  const anchor = <T extends { at_seconds?: number | null; at_frame?: number | null }>(item: T): T => ({
    ...item,
    at_seconds: seconds(item.at_seconds),
    at_frame: frame(item.at_frame),
  })

  return {
    ...breakdown,
    phases: breakdown.phases?.map(anchor),
    cue_notes: breakdown.cue_notes?.map(anchor),
    key_moment: breakdown.key_moment ? anchor(breakdown.key_moment) : breakdown.key_moment,
  }
}

/** How much of the catalog the model actually accounted for — the depth metric, computed not claimed. */
export function breakdownCoverage(
  breakdown: RepBreakdown | undefined,
  catalog: CueCatalog
): { evaluated: number; notEvaluable: number; total: number; anchored: number } {
  const total = Object.values(catalog).reduce((n, cues) => n + cues.length, 0)
  const notes = breakdown?.cue_notes ?? []
  return {
    evaluated: notes.length,
    notEvaluable: breakdown?.not_evaluable?.length ?? 0,
    total,
    anchored: notes.filter((n) => n.at_seconds != null || n.at_frame != null).length,
  }
}
