import type { SupabaseClient } from '@supabase/supabase-js'
import {
  analyzeFramesWithGemini,
  analyzeClipWithGemini,
  type ClipResolution,
} from '@/lib/ai/providers/google'
import { getRoute } from '@/lib/ai/model-router'
import { recordUsage, hashCacheKey, getCachedResponse, setCachedResponse } from '@/lib/ai/record-usage'
import { buildQBIQSystemPrompt, QBIQ_RESPONSE_SCHEMA } from './modules/qbiq'
import { buildOLIQSystemPrompt, OLIQ_RESPONSE_SCHEMA } from './modules/oliq'
import { buildRBIQSystemPrompt, RBIQ_RESPONSE_SCHEMA } from './modules/rbiq'
import { buildTEAMIQSystemPrompt, TEAMIQ_RESPONSE_SCHEMA } from './modules/teamiq'
import { buildMISTAKEIQSystemPrompt, MISTAKEIQ_RESPONSE_SCHEMA } from './modules/mistakeiq'
import { buildSCOUTIQSystemPrompt, SCOUTIQ_RESPONSE_SCHEMA } from './modules/scoutiq'
import { buildRANKERIQSystemPrompt, RANKERIQ_RESPONSE_SCHEMA } from './modules/rankeriq'
import {
  PositionAnalysisOutputSchema,
  type PositionAnalysisInput,
  type ModulePromptInput,
  type PositionAnalysisResult,
} from './schemas'
import { framesFromBase64, type EvidenceFrame } from './get-frames'
import { getAnalysisClip, type ResolvedClip } from './get-clip'
import { pruneBreakdownCitations } from './breakdown'
import { RUBRICS, allCueIds, drillMenuFor, resolvePrescriptions, renderPrescriptions } from './rubrics'
import { computeOverall, weightsFor } from './scoring'
import { writeReport } from './write-report'
import { deriveConfidence, type ConfidenceSignals, type SubjectIdentification, type ViewQuality } from './confidence'
import type { EvidenceMode } from './football-brain'
import { applyDrillSafetyFilter, scrubProhibitedDrillMentions } from './safety'
import { rankPlayerGrades } from './player-grades'
import { resolveLevelTier } from './levels'

type ModuleConfig = {
  buildPrompt: (input: ModulePromptInput) => string
  schema: object
  /**
   * How densely to sample the clip when reading it as video.
   *
   * This is a rubric decision, not a cost knob. QBIQ and OLIQ grade cues that
   * only exist between frames — weight transfer, kick slide, hand timing, leg
   * drive — so they need a rate that resolves motion. TEAMIQ and SCOUTIQ grade
   * alignment and tendency, which are legible in far fewer frames, so they
   * sample low and cost less than the 16-frame path they replace.
   */
  fps: number
  resolution: ClipResolution
}

const MODULE_MAP: Record<string, ModuleConfig> = {
  QBIQ:      { buildPrompt: buildQBIQSystemPrompt,      schema: QBIQ_RESPONSE_SCHEMA,      fps: 8, resolution: 'medium' },
  OLIQ:      { buildPrompt: buildOLIQSystemPrompt,      schema: OLIQ_RESPONSE_SCHEMA,      fps: 8, resolution: 'medium' },
  RBIQ:      { buildPrompt: buildRBIQSystemPrompt,      schema: RBIQ_RESPONSE_SCHEMA,      fps: 8, resolution: 'medium' },
  TEAMIQ:    { buildPrompt: buildTEAMIQSystemPrompt,    schema: TEAMIQ_RESPONSE_SCHEMA,    fps: 2, resolution: 'low' },
  MISTAKEIQ: { buildPrompt: buildMISTAKEIQSystemPrompt, schema: MISTAKEIQ_RESPONSE_SCHEMA, fps: 4, resolution: 'medium' },
  SCOUTIQ:   { buildPrompt: buildSCOUTIQSystemPrompt,   schema: SCOUTIQ_RESPONSE_SCHEMA,   fps: 2, resolution: 'low' },
  RANKERIQ:  { buildPrompt: buildRANKERIQSystemPrompt,  schema: RANKERIQ_RESPONSE_SCHEMA,  fps: 6, resolution: 'medium' },
}

/**
 * `frames` is the wire contract with the browser (bare base64 strings, no
 * timing). Callers that read frames from `video_frames` have the real frame
 * index and capture time and should pass `evidenceFrames` instead, so the
 * labels shown to the model — and therefore every citation it makes — refer
 * to a real moment rather than a position in an array.
 */
export type AnalyzePositionInput = PositionAnalysisInput & {
  evidenceFrames?: EvidenceFrame[]
  /**
   * Forces the frame path even when the clip could be read as video. Used by
   * the eval harness to compare the two modes on identical film.
   */
  forceFrames?: boolean
}

/**
 * Reading the clip itself is preferred, but not always possible: film added
 * from an external link has no stored copy, a quick-clip upload posts frames
 * straight from the browser, and storage can fail. None of those should cost
 * a coach their analysis, so each falls back to frames — a slightly worse
 * read beats no read. The mode is recorded on the result either way.
 */
async function resolveEvidence(
  input: AnalyzePositionInput,
  supabase: SupabaseClient
): Promise<{ mode: EvidenceMode; clip: ResolvedClip | null; frames: EvidenceFrame[] }> {
  const postedFrames = input.frames.length > 0 || (input.evidenceFrames?.length ?? 0) > 0

  if (!input.forceFrames && input.videoId && !input.frames.length) {
    const clip = await getAnalysisClip(input.videoId, supabase, {
      playSequenceId: input.playSequenceId,
    }).catch(() => null)
    if (clip) return { mode: 'video', clip, frames: [] }
  }

  const frames = postedFrames
    ? (input.evidenceFrames ?? framesFromBase64(input.frames))
    : []
  return { mode: 'frames', clip: null, frames }
}

export async function analyzePosition(
  input: AnalyzePositionInput,
  // null when a background batch job runs film queued by a coach whose
  // account has since been removed — the usage ledger takes a null user.
  userId: string | null,
  supabase: SupabaseClient
): Promise<PositionAnalysisResult> {
  const config = MODULE_MAP[input.moduleKey]
  if (!config) throw new Error(`Unknown module: ${input.moduleKey}`)

  const { mode: evidenceMode, clip, frames } = await resolveEvidence(input, supabase)
  if (!clip && !frames.length) {
    throw new Error('No film available to analyze — this video has neither a stored clip nor extracted frames.')
  }

  // game_type drives the flag/tackle contact-drill safety gate — fetched
  // authoritatively from the DB rather than trusted from the client, since
  // a client-supplied value here would let a caller bypass the gate.
  const { data: teamRow } = await supabase
    .from('teams')
    .select('game_type, level, age_group')
    .eq('id', input.teamId)
    .maybeSingle()
  const gameType = teamRow?.game_type as 'flag' | 'tackle' | 'rookie_tackle' | null | undefined
  const tier = resolveLevelTier(teamRow as { age_group?: string | null; level?: string | null } | null)
  // RANKERIQ verifies every jersey number against the roster, so the roster is
  // read here from the DB rather than accepted from the caller — it decides
  // which numbers are allowed to exist, which makes it a trust boundary.
  let roster: { id: string; jersey_number: string | null; position: string | null; name: string | null }[] = []
  if (input.moduleKey === 'RANKERIQ') {
    const { data: players } = await supabase
      .from('players')
      .select('id, jersey_number, primary_position, first_name, last_name')
      .eq('team_id', input.teamId)
    roster = (players ?? []).map((p) => ({
      id: p.id as string,
      jersey_number: p.jersey_number != null ? String(p.jersey_number) : null,
      position: (p.primary_position as string | null) ?? null,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    }))
  }

  const inputWithGameType: ModulePromptInput = {
    ...input,
    team: input.team ? { ...input.team, game_type: gameType ?? undefined } : input.team,
    roster: roster.map(({ jersey_number, position, name }) => ({ jersey_number, position, name })),
    // Decided here, never accepted from a client: it tells the model whether
    // to cite timestamps or labelled frame numbers.
    evidenceMode,
  }

  const systemPrompt = config.buildPrompt(inputWithGameType)
  // Every module here is a frame-based structured-output call — route them
  // all through the same job type so the model choice has one source of
  // truth (lib/ai/model-router.ts) instead of being hardcoded per provider.
  const route = getRoute('frame_observation')

  // In video mode the evidence is the clip plus the slice and sample rate we
  // read it at, so that — not frame bytes — is what identifies the request.
  const evidenceKey = clip
    ? [
        clip.source.kind === 'file' ? clip.source.fileUri : clip.source.bytes.toString('base64'),
        `${clip.startOffsetSeconds ?? 0}-${clip.endOffsetSeconds ?? ''}@${config.fps}/${config.resolution}`,
      ]
    : frames.map((f) => f.base64)

  const cacheHash = hashCacheKey(
    'frame_observation',
    `${input.moduleKey}:${evidenceMode}:${systemPrompt}`,
    evidenceKey
  )
  const cached = await getCachedResponse<string>(supabase, cacheHash)

  let rawJson: string
  if (cached != null) {
    rawJson = cached
    await recordUsage(supabase, {
      teamId: input.teamId, userId, jobType: 'frame_observation',
      provider: route.provider, model: route.model,
      inputTokens: 0, outputTokens: 0, cacheHit: true,
    })
  } else {
    const result = clip
      ? await analyzeClipWithGemini(systemPrompt, clip.source, config.schema, {
          model: route.model,
          fps: config.fps,
          mediaResolution: config.resolution,
          startOffsetSeconds: clip.startOffsetSeconds,
          endOffsetSeconds: clip.endOffsetSeconds,
        })
      : await analyzeFramesWithGemini(systemPrompt, frames, config.schema, { model: route.model })
    rawJson = result.text
    await recordUsage(supabase, {
      teamId: input.teamId, userId, jobType: 'frame_observation',
      provider: route.provider, model: route.model,
      inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
    })
    await setCachedResponse(supabase, cacheHash, 'frame_observation', rawJson)
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawJson)
  } catch {
    throw new Error(`Invalid JSON from ${input.moduleKey}: ${rawJson.slice(0, 200)}`)
  }

  // Syntactically valid JSON can still be the wrong shape (missing field, a
  // string where a number was expected) — reject that here rather than
  // rendering a report built on it. See PositionAnalysisOutputSchema's doc
  // comment.
  const result = PositionAnalysisOutputSchema.safeParse(parsedJson)
  if (!result.success) {
    throw new Error(`Malformed ${input.moduleKey} output: ${result.error.message}`)
  }
  const parsed = result.data

  const rubric = RUBRICS[input.moduleKey]

  // The headline number is computed, not asked for. The prompts stated the
  // formula and then had the model apply it inside a vision call — including
  // reweighting by hand whenever a dimension came back null, which is where
  // the formula quietly stopped being followed. Same argument player-grades.ts
  // already makes for RankerIQ: a score a model invents per call cannot be
  // compared across clips, and a trend line needs it to be.
  const overall = rubric
    ? computeOverall(parsed.position_scores, weightsFor(rubric))
    : { value: parsed.overall_score ?? null, weights: {}, skipped: [] }

  // Confidence likewise: the model reports what it could see, code turns that
  // into the number, so it is reproducible and the UI can say why it is low.
  const signals = (parsed.confidence_signals ?? {}) as {
    subject_identified?: string | null
    view_quality?: string | null
    criteria_visible?: number | null
    criteria_attempted?: number | null
    occlusion_events?: number | null
  }
  const confidenceSignals: ConfidenceSignals = {
    subject_identified: (signals.subject_identified as SubjectIdentification | null) ?? null,
    view_quality: (signals.view_quality as ViewQuality | null) ?? null,
    criteria_visible: signals.criteria_visible ?? null,
    criteria_attempted: signals.criteria_attempted ?? null,
    occlusion_events: signals.occlusion_events ?? null,
  }
  const hasSignals = Object.values(confidenceSignals).some((v) => v != null)
  const derived = hasSignals ? deriveConfidence(confidenceSignals) : null
  // Drills are chosen from this team's filtered catalog, not invented, so the
  // ones that survive here name a real drill fixing a cue in this module's
  // rubric. A drill id the model made up — or one off this team's contact
  // menu — is dropped rather than shown to a coach as a prescription.
  const prescriptions = rubric
    ? resolvePrescriptions(parsed.prescriptions, {
        menu: drillMenuFor({ cueIds: allCueIds(rubric), gameType, tier }),
        cueIds: allCueIds(rubric),
      })
    : []

  // Belt-and-suspenders: the prompt already bans these, but scrub the
  // structured output too before it can reach a coach's screen.
  const { drills: safeDrills } = applyDrillSafetyFilter(
    prescriptions.length ? renderPrescriptions(prescriptions) : parsed.drills,
    gameType,
    tier
  )
  const safeMistakes = parsed.mistakes?.map((m) => {
    const correction = scrubProhibitedDrillMentions(m.correction)
    const drill = m.drill
      ? applyDrillSafetyFilter([m.drill], gameType, tier).drills[0]
      : m.drill
    return { ...m, correction, drill, evidence_frames: keepCited(m.evidence_frames) }
  })

  // The model can only cite a frame it was actually shown. An index outside
  // that set is the cheapest hallucination signal we have — and rendering it
  // would seek a coach to nothing — so drop it here rather than pass it on.
  // Frames are labelled by their real `video_frames.frame_index`, so this
  // compares against identity, not array position.
  const shownIndexes = new Set(frames.map((f) => f.index))
  const keepCited = (cited?: number[]) => (cited ?? []).filter((i) => shownIndexes.has(i))

  // The video-mode equivalent: a cited second must fall inside the clip the
  // model was actually shown. Times are measured from the start of that clip
  // (the prompt says so explicitly), so the window is 0..duration and the
  // player adds the play's own offset when seeking.
  const clipSeconds = clip?.durationSeconds ?? null
  const keepTimestamps = (cited?: number[]) =>
    (cited ?? []).filter(
      (t) => Number.isFinite(t) && t >= 0 && (clipSeconds == null || t <= clipSeconds)
    )

  const prunedBreakdown = pruneBreakdownCitations(parsed.breakdown, {
    clipSeconds,
    shownFrames: shownIndexes,
    mode: evidenceMode,
  })

  // Pass two. The observation pass read the film; this one writes from what it
  // recorded, and can see nothing else. PLAYSCOUTIQ_SPEC has always described
  // these as separate systems — one call was doing both, and the prose was the
  // half that suffered for it.
  const written = rubric
    ? await writeReport(
        {
          moduleKey: input.moduleKey,
          positionScores: parsed.position_scores,
          overallScore: overall.value,
          breakdown: prunedBreakdown,
          prescriptions,
          confidenceReasons: derived?.reasons ?? [],
          playerName: input.player?.name,
          playContext: [
            input.playSequence?.down
              ? `${input.playSequence.down} & ${input.playSequence.distance ?? '?'}`
              : null,
            input.playSequence?.yard_line,
            input.playSequence?.coach_label,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
          coachNote: input.coachNote,
        },
        { rubric, tier, teamId: input.teamId, userId },
        supabase
      )
    : null

  // RANKERIQ: the model reports observations; the grade itself is computed
  // here from those factors so a 78 in clip 3 means what a 78 means in clip
  // 40 — otherwise ranking players across a game is comparing scales, not
  // performances. Identity is resolved against the roster fetched above.
  // Scrimmage/practice film: pinnies carry numbers belonging to other players,
  // so a roster "match" there proves nothing about who is wearing it.
  const allowNumbers = input.filmConditions !== 'scrimmage'
  const rankedGrades = parsed.player_grades?.length
    ? rankPlayerGrades(parsed.player_grades, roster, { allowNumbers })
    : parsed.player_grades

  return {
    overall_score: overall.value ?? 0,
    position_scores: parsed.position_scores,
    reasoning: written?.reasoning && Object.keys(written.reasoning).length
      ? written.reasoning
      : parsed.reasoning,
    strengths: written?.strengths ?? parsed.strengths,
    weaknesses: written?.weaknesses ?? parsed.weaknesses,
    drills: safeDrills,
    prescriptions,
    summary: written?.summary ?? parsed.summary,
    // No silent 0.7 default: an unexplained number is what made confidence
    // decoration in the first place.
    confidence: derived?.value ?? parsed.confidence ?? 0.5,
    confidence_reasons: derived?.reasons ?? [],
    confidence_signals: hasSignals ? confidenceSignals : undefined,
    evidence_frames: keepCited(parsed.evidence_frames),
    evidence_timestamps: keepTimestamps(parsed.evidence_timestamps),
    breakdown: prunedBreakdown,
    analysisMode: evidenceMode,
    plays_observed: parsed.plays_observed,
    head_contact_flag: parsed.head_contact_flag,
    offensive_tendencies: parsed.offensive_tendencies,
    defensive_tendencies: parsed.defensive_tendencies,
    formations: parsed.formations,
    explosive_plays: parsed.explosive_plays,
    situational_tells: parsed.situational_tells,
    attack_points: parsed.attack_points,
    mistakes: safeMistakes,
    player_grades: rankedGrades,
    unit_graded: parsed.unit_graded,
    players_not_evaluable: parsed.players_not_evaluable,
    target_players: parsed.target_players,
    model: route.model,
    // In video mode there are no discrete frames to count, so report what the
    // sample rate actually produced — that is the number comparable to the 16
    // the frame path used to send.
    framesAnalyzed: clip
      ? clipSeconds != null
        ? Math.round(clipSeconds * config.fps)
        : 0
      : frames.length,
  }
}
