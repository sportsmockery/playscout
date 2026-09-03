import type { SupabaseClient } from '@supabase/supabase-js'
import { callClaude } from '@/lib/ai/providers/anthropic'
import { getRoute } from '@/lib/ai/model-router'
import { recordUsage } from '@/lib/ai/record-usage'
import { buildFootballBrain } from './football-brain'
import { tierLabel, type LevelTier } from './levels'
import { buildRubricPrompt } from './rubrics/render'
import type { ModuleRubric } from './rubrics/types'
import type { RepBreakdown } from './breakdown'
import type { DrillPrescription } from './rubrics/drills'

/**
 * The write pass.
 *
 * PLAYSCOUTIQ_SPEC already splits this product into System B (evidence, from
 * film) and System A (interpretation, over evidence). One Gemini call was
 * doing both — grading a rep and writing the coaching prose in the same
 * breath — and the prose was the part that suffered. A vision model spending
 * its attention on reading hands and feet is not also going to write the
 * paragraph a coach wants to read.
 *
 * So the observation record from pass one becomes the input here, and Claude
 * writes from it. Nothing new can be observed at this stage: the writer is
 * given the cues, the verdicts, the markers and the timestamps, and told to
 * work only from them. That constraint is the point — it is what stops the
 * longer prose becoming more invented prose.
 */

export interface ObservationRecord {
  moduleKey: string
  positionScores: Record<string, number | null | undefined>
  overallScore: number | null
  breakdown?: RepBreakdown
  prescriptions: DrillPrescription[]
  confidenceReasons: string[]
  playerName?: string
  playContext?: string
  coachNote?: string
  /** Prior findings for this player/team, so a report can say "again" and mean it. */
  priorFindings?: string[]
}

export interface WrittenReport {
  summary: string
  reasoning: Record<string, string>
  strengths: string[]
  weaknesses: string[]
}

/**
 * The stable half of the prompt: identical for every clip of the same module
 * at the same level, so it caches across a whole batch. Everything that varies
 * per clip goes in the user message, after the cache breakpoint.
 */
function buildWriterSystem(rubric: ModuleRubric, tier: LevelTier): string {
  return `${buildFootballBrain(tier)}

${buildRubricPrompt(rubric, tier)}

YOU ARE WRITING THE REPORT, NOT WATCHING THE FILM.

Another analyst has already watched this rep and recorded what was visible: which technique cues
they could read, the verdict on each, the marker they read it from, and when it happened. Your job
is to turn that record into what a ${tierLabel(tier)} coach reads.

HARD CONSTRAINT — you did not see the film. Every statement you make must trace to a specific
observation in the record. Do not add a cue that was not observed, do not upgrade a verdict, do not
describe anything the record does not contain. If the record is thin, say what was thin about it;
that is more useful than filling the gap.

Write:
- reasoning: one entry per scored dimension. Walk the cues that were actually observed for it, in
  the order the rep happened, naming the timestamp or frame each came from. This is the body of the
  report — give it the length the observations support, and no more.
- strengths / weaknesses: the things that mattered on THIS rep, each carrying its anchor. Rank by
  what actually affected the outcome, not by dimension order. A cue graded at standard is usually
  neither — do not pad either list to look balanced.
- summary: what a coach needs in four or five sentences — what happened, what decided it, what to
  work on. Speak to the coach, not about the player in the abstract.

Never repeat a sentence you could have written about a different rep. If a phrase would fit any
quarterback in any clip, it is filler — replace it with what this record actually says.

Return ONLY JSON: { "summary": string, "reasoning": { "<dimension>": string }, "strengths":
string[], "weaknesses": string[] }`
}

/** The volatile half — this clip's evidence, after the cache breakpoint. */
function buildObservationMessage(obs: ObservationRecord): string {
  const lines: string[] = []

  if (obs.playerName) lines.push(`PLAYER: ${obs.playerName}`)
  if (obs.playContext) lines.push(`PLAY: ${obs.playContext}`)
  if (obs.coachNote) lines.push(`COACH NOTE: ${obs.coachNote}`)

  lines.push(
    '',
    'DIMENSION SCORES (already computed — do not recompute or contradict them):',
    ...Object.entries(obs.positionScores).map(
      ([k, v]) => `  ${k}: ${v == null ? 'no applicable evidence on this rep' : v}`
    ),
    `  overall: ${obs.overallScore ?? 'not scored'}`
  )

  const phases = obs.breakdown?.phases ?? []
  if (phases.length) {
    lines.push('', 'THE REP, IN ORDER:')
    for (const p of phases) {
      lines.push(`  [${anchorOf(p)}] ${p.phase}: ${p.observed}${p.verdict ? ` (${p.verdict})` : ''}`)
    }
  }

  const notes = obs.breakdown?.cue_notes ?? []
  if (notes.length) {
    lines.push('', 'TECHNIQUE CUES OBSERVED:')
    for (const n of notes) {
      lines.push(`  [${anchorOf(n)}] ${n.dimension} / ${n.cue} — ${n.verdict}: ${n.visible_marker}`)
    }
  }

  if (obs.breakdown?.key_moment) {
    lines.push(
      '',
      `THE MOMENT IT TURNED: [${anchorOf(obs.breakdown.key_moment)}] ${obs.breakdown.key_moment.why_it_decided_the_rep}`
    )
  }

  const notEvaluable = obs.breakdown?.not_evaluable ?? []
  if (notEvaluable.length) {
    lines.push('', 'COULD NOT BE GRADED (say so rather than guessing):')
    for (const n of notEvaluable) lines.push(`  ${n.cue} — ${n.why}`)
  }

  if (obs.confidenceReasons.length) {
    lines.push('', 'LIMITS OF THIS FILM:', ...obs.confidenceReasons.map((r) => `  ${r}`))
  }

  if (obs.prescriptions.length) {
    lines.push(
      '',
      'DRILLS ALREADY PRESCRIBED (do not invent others; you may reference these):',
      ...obs.prescriptions.map((p) => `  ${p.name} — for ${p.fixes_cue}`)
    )
  }

  if (obs.priorFindings?.length) {
    lines.push(
      '',
      'PREVIOUSLY ON THIS PLAYER/TEAM (only reference one if this rep genuinely repeats it):',
      ...obs.priorFindings.map((f) => `  ${f}`)
    )
  }

  return lines.join('\n')
}

function anchorOf(item: { at_seconds?: number | null; at_frame?: number | null }): string {
  if (item.at_seconds != null) return `${item.at_seconds.toFixed(1)}s`
  if (item.at_frame != null) return `frame ${item.at_frame}`
  return 'no anchor'
}

/**
 * Returns null rather than throwing when the write pass fails. Pass one's own
 * prose is kept as the fallback, so an Anthropic outage costs a coach a better
 * write-up, not their analysis.
 */
export async function writeReport(
  obs: ObservationRecord,
  ctx: { rubric: ModuleRubric; tier: LevelTier; teamId: string; userId: string | null },
  supabase: SupabaseClient
): Promise<WrittenReport | null> {
  const route = getRoute('report_generation')

  try {
    const result = await callClaude(
      route.model,
      buildWriterSystem(ctx.rubric, ctx.tier),
      [{ role: 'user', content: buildObservationMessage(obs) }],
      {
        maxTokens: 4000,
        // The system half is byte-identical for every clip of this module at
        // this level, so a 60-clip batch pays for it once.
        cacheSystem: true,
        thinking: true,
        effort: 'medium',
      }
    )

    await recordUsage(supabase, {
      teamId: ctx.teamId,
      userId: ctx.userId,
      jobType: 'report_generation',
      provider: route.provider,
      model: route.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    })

    return parseWrittenReport(result.text)
  } catch (err) {
    console.error('[write-report] write pass failed, keeping the observation pass prose', err)
    return null
  }
}

export function parseWrittenReport(raw: string): WrittenReport | null {
  // Claude may wrap JSON in prose or a fence despite the instruction.
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<WrittenReport>
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) return null

    return {
      summary: parsed.summary,
      reasoning:
        parsed.reasoning && typeof parsed.reasoning === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.reasoning).filter(([, v]) => typeof v === 'string')
            )
          : {},
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter(isText) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.filter(isText) : [],
    }
  } catch {
    return null
  }
}

function isText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}
