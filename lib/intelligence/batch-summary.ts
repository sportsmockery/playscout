import { z } from 'zod'
import { buildFootballBrain } from './football-brain'
import { resolveLevelTier, type LevelTier } from './levels'
import type { BatchAggregate, BatchClipResult } from './aggregate-batch'

/**
 * The narrative layer over a finished batch — PlayScout's System A reasoning
 * over evidence System B already proved (see PLAYSCOUTIQ_SPEC.md).
 *
 * A coach who queues 40 clips does not want 40 verdicts; they want to know
 * what keeps happening. This produces one cumulative read plus a one-line
 * comment on every individual clip, so the batch reads as a single film
 * session rather than a pile of disconnected reports.
 *
 * It NEVER re-derives numbers. Counts, averages, and rankings come from
 * aggregate-batch.ts and are handed in as facts; the model's job is to
 * explain what they mean and what to do about it on Tuesday.
 */

export const BatchSummarySchema = z.object({
  headline: z.string(),
  cumulative_summary: z.string(),
  what_repeats: z.array(z.object({
    pattern: z.string(),
    clips_seen: z.number(),
    why_it_matters: z.string(),
  })),
  per_video: z.array(z.object({
    video_id: z.string(),
    comment: z.string(),
  })),
  priorities: z.array(z.object({
    title: z.string(),
    why: z.string(),
    fix: z.string(),
  })),
  practice_focus: z.array(z.string()),
  evidence_note: z.string(),
})
export type BatchSummary = z.infer<typeof BatchSummarySchema>

interface BuildArgs {
  moduleKey: string
  teamName?: string | null
  ageGroup?: string | null
  level?: string | null
  gameType?: string | null
  clips: BatchClipResult[]
  aggregate: BatchAggregate
  coachNote?: string
}

/** Compact, factual digest of the per-clip results the model reasons over. */
function renderClips(clips: BatchClipResult[]): string {
  return clips
    .map((c, i) => {
      const lines = [
        `CLIP ${i + 1} — video_id: ${c.videoId} — "${c.videoTitle}"`,
        `  score: ${c.overallScore ?? 'n/a'}${c.confidence != null ? ` (confidence ${c.confidence})` : ''}`,
        c.summary ? `  summary: ${c.summary}` : null,
        c.strengths?.length ? `  strengths: ${c.strengths.join(' | ')}` : null,
        c.weaknesses?.length ? `  weaknesses: ${c.weaknesses.join(' | ')}` : null,
      ]
      if (c.playerGrades?.length) {
        const graded = c.playerGrades
          .map((g) => `${g.identifier} ${g.position ?? ''} ${g.grade ?? '?'} (${g.note})`)
          .join(' | ')
        lines.push(`  player grades: ${graded}`)
      }
      if (c.mistakes?.length) {
        lines.push(`  mistakes: ${c.mistakes.map((m) => `${m.category} (${m.severity})`).join(' | ')}`)
      }
      return lines.filter(Boolean).join('\n')
    })
    .join('\n\n')
}

function renderAggregate(agg: BatchAggregate): string {
  const lines = [
    `clips analyzed: ${agg.clipsAnalyzed}`,
    `average score: ${agg.averageScore ?? 'n/a'}`,
    agg.playsObserved ? `plays observed: ${agg.playsObserved}` : null,
    agg.bestClip ? `best clip: "${agg.bestClip.videoTitle}" (${agg.bestClip.score})` : null,
    agg.worstClip ? `weakest clip: "${agg.worstClip.videoTitle}" (${agg.worstClip.score})` : null,
  ]
  if (agg.recurringWeaknesses.length) {
    lines.push(
      `weaknesses by how many clips they appear in: ${agg.recurringWeaknesses
        .map((w) => `${w.text} (${w.clips})`)
        .join(' | ')}`
    )
  }
  if (agg.recurringStrengths.length) {
    lines.push(
      `strengths by how many clips they appear in: ${agg.recurringStrengths
        .map((w) => `${w.text} (${w.clips})`)
        .join(' | ')}`
    )
  }
  if (agg.playerRollup.length) {
    lines.push(
      `player averages across the batch: ${agg.playerRollup
        .map((p) => `${p.identifier} ${p.averageGrade} over ${p.reps} rep${p.reps === 1 ? '' : 's'}${p.trend != null ? ` (trend ${p.trend > 0 ? '+' : ''}${p.trend})` : ''}`)
        .join(' | ')}`
    )
  }
  if (agg.mistakeRollup.length) {
    lines.push(
      `mistake counts: ${agg.mistakeRollup.map((m) => `${m.category} x${m.count} (worst ${m.worstSeverity})`).join(' | ')}`
    )
  }
  return lines.filter(Boolean).join('\n')
}

export function buildBatchSummaryPrompt(args: BuildArgs): string {
  const tier: LevelTier = resolveLevelTier({ age_group: args.ageGroup, level: args.level })

  return `${buildFootballBrain(tier)}

You are writing the CUMULATIVE report for a batch of ${args.clips.length} clips already analyzed by PlayScout's ${args.moduleKey} module.
${args.teamName ? `TEAM: ${args.teamName}${args.ageGroup ? ` | ${args.ageGroup}` : ''}` : ''}
${args.gameType ? `GAME TYPE: ${args.gameType}` : ''}
${args.coachNote ? `COACH NOTE FOR THIS BATCH: ${args.coachNote}` : ''}

You did NOT watch this film. You are reasoning over per-clip findings that were
produced from frame evidence. Every claim you make must trace to something below.
Never invent a play, a player, a jersey number, or a statistic that isn't here.

=== COMPUTED TOTALS (these are facts — quote them, never recalculate them) ===
${renderAggregate(args.aggregate)}

=== PER-CLIP FINDINGS ===
${renderClips(args.clips)}

Produce ONE report across the whole batch, as JSON matching this shape exactly:

{
  "headline": "one sentence a coach reads first — the single most important thing this film session showed",
  "cumulative_summary": "3-6 sentences on what the batch showed as a whole. Cite how many clips support each claim ('in 7 of 11 clips...'). Say what is consistent versus what was a one-off.",
  "what_repeats": [
    { "pattern": "the thing that keeps happening", "clips_seen": <the exact count from COMPUTED TOTALS>, "why_it_matters": "what it costs on the field" }
  ],
  "per_video": [
    { "video_id": "<exact video_id from the clip list>", "comment": "ONE sentence on what THIS clip specifically showed and how it fits the batch — must be specific to this clip, never interchangeable filler" }
  ],
  "priorities": [
    { "title": "what to fix first", "why": "the evidence across clips that makes it first", "fix": "the concrete coaching correction" }
  ],
  "practice_focus": ["drills for this week, each naming the weakness it fixes and a coaching cue"],
  "evidence_note": "how much to trust this: how many clips, how clear the film was, and what could NOT be determined"
}

HARD REQUIREMENTS:
- Refer to players EXACTLY by the labels given above and nothing else. Many players are
  identified by role ("left guard") because their jersey number was not legible on this film —
  that is normal. NEVER attach a jersey number to a player who is listed without one, never
  invent a name, and never merge two differently-labelled players into one. If a label has no
  number, neither does your sentence about them.
- per_video MUST contain exactly one entry for every clip listed above, using the exact video_id strings given. Do not skip a clip, do not invent one.
- EVERY entry in what_repeats must correspond to a line in the "weaknesses by how many clips"
  or "strengths by how many clips" lists in COMPUTED TOTALS, and clips_seen must be that line's
  number exactly. You may reword the pattern for readability, but you may NOT invent a count,
  estimate one, add up clips yourself, or include a pattern that isn't in those lists. If a list
  shows nothing appearing in more than one clip, return an empty what_repeats array and say in
  cumulative_summary that no pattern repeated across clips yet — that is a real, useful finding,
  not a gap to paper over.
- The same rule governs the prose: any count you state in cumulative_summary ("in 7 of 11
  clips...") must come from COMPUTED TOTALS. Do not count clips yourself from the per-clip
  findings — you will get it wrong, and a coach cannot tell.
- Prioritize what repeats across clips over what was dramatic in one clip. A single bad rep is not a trend, and say so when a coach might read it as one.
- If the batch is small or the film was unclear, say that plainly in evidence_note and keep your claims proportionally modest.
- Every drill must respect the safety rules above.

Return ONLY the JSON object. No preamble, no markdown fence.`
}

/**
 * Claude returns text; it may arrive wrapped in a markdown fence despite the
 * instruction. Strip that, parse, and validate — the same defensive path the
 * ScoutIQ game-plan route uses.
 */
export function parseBatchSummary(raw: string): BatchSummary {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Invalid JSON from batch summary: ${cleaned.slice(0, 200)}`)
  }
  const result = BatchSummarySchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Malformed batch summary: ${result.error.message}`)
  }
  return result.data
}
