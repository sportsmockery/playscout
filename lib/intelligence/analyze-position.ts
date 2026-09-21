import type { SupabaseClient } from '@supabase/supabase-js'
import {
  analyzeFramesWithGemini,
  analyzeClipWithGemini,
  type ClipResolution,
} from '@/lib/ai/providers/google'
import { getRoute } from '@/lib/ai/model-router'
import { recordUsage, hashCacheKey, getCachedResponse, setCachedResponse, promptVersion } from '@/lib/ai/record-usage'
import { buildQBIQSystemPrompt, QBIQ_RESPONSE_SCHEMA } from './modules/qbiq'
import { buildOLIQSystemPrompt, OLIQ_RESPONSE_SCHEMA } from './modules/oliq'
import { buildRBIQSystemPrompt, RBIQ_RESPONSE_SCHEMA } from './modules/rbiq'
import { buildTEAMIQSystemPrompt, TEAMIQ_RESPONSE_SCHEMA } from './modules/teamiq'
import { buildMISTAKEIQSystemPrompt, MISTAKEIQ_RESPONSE_SCHEMA } from './modules/mistakeiq'
import { buildSCOUTIQSystemPrompt, SCOUTIQ_RESPONSE_SCHEMA } from './modules/scoutiq'
import { buildRANKERIQSystemPrompt, RANKERIQ_RESPONSE_SCHEMA } from './modules/rankeriq'
import { buildSTATSIQSystemPrompt, STATSIQ_RESPONSE_SCHEMA } from './modules/statsiq'
import { buildSTATSIQFactsPrompt, STATSIQ_FACTS_RESPONSE_SCHEMA } from './modules/statsiq-facts'
import { factsOutputToAnalysisOutput } from './stat-facts'
import { normalizeDefensiveSnap } from './defense-structure'
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
import { rankPlayerGrades, scrubUnverifiedNumbers } from './player-grades'
import { tallyStatPlays } from './stat-lines'
import {
  buildPlayLocatorPrompt,
  PLAY_LOCATOR_SCHEMA,
  parseLocatedPlays,
  playWindow,
  type ClipWindow,
} from './locate-play'
import {
  buildPlayVerificationPrompt,
  PLAY_VERIFICATION_SCHEMA,
  parseVerification,
  reconcileReadings,
  hasPlayTypeDispute,
  verificationsAgreeOnPlayType,
  flagMeshPointCarries,
  schemeHasQbMesh,
} from './stat-verify'
import { resolveLevelTier } from './levels'
import { isMisdirectedRun, resolveFilmSubject, subjectNameFor } from './film-subject'

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

/**
 * Exported so the eval harness drives the SAME prompt, schema, frame rate and
 * resolution production does. A harness with its own copy of this table
 * measures a configuration nobody ships.
 */
export const MODULE_MAP: Record<string, ModuleConfig> = {
  QBIQ:      { buildPrompt: buildQBIQSystemPrompt,      schema: QBIQ_RESPONSE_SCHEMA,      fps: 8, resolution: 'medium' },
  OLIQ:      { buildPrompt: buildOLIQSystemPrompt,      schema: OLIQ_RESPONSE_SCHEMA,      fps: 8, resolution: 'medium' },
  RBIQ:      { buildPrompt: buildRBIQSystemPrompt,      schema: RBIQ_RESPONSE_SCHEMA,      fps: 8, resolution: 'medium' },
  TEAMIQ:    { buildPrompt: buildTEAMIQSystemPrompt,    schema: TEAMIQ_RESPONSE_SCHEMA,    fps: 2, resolution: 'low' },
  MISTAKEIQ: { buildPrompt: buildMISTAKEIQSystemPrompt, schema: MISTAKEIQ_RESPONSE_SCHEMA, fps: 4, resolution: 'medium' },
  SCOUTIQ:   { buildPrompt: buildSCOUTIQSystemPrompt,   schema: SCOUTIQ_RESPONSE_SCHEMA,   fps: 2, resolution: 'low' },
  RANKERIQ:  { buildPrompt: buildRANKERIQSystemPrompt,  schema: RANKERIQ_RESPONSE_SCHEMA,  fps: 6, resolution: 'medium' },
  // 6fps/medium, MEASURED — see scripts/eval-statsiq.ts.
  //
  // I raised this to 8fps/high on the theory that reading a handoff needs
  // pixels, and it made the module worse. Swept against real film, 8fps/high
  // read a quarterback touchdown RUN as an intercepted pass on both windowed
  // and whole-clip reads, while 6fps/medium got "run, touchdown" every time and
  // came within a yard of the true gain. More frames at higher fidelity is not
  // a better read; past some point it is a worse one. Do not raise this again
  // without running the sweep.
  STATSIQ:   { buildPrompt: buildSTATSIQSystemPrompt,   schema: STATSIQ_RESPONSE_SCHEMA,   fps: 6, resolution: 'medium' },
}

/**
 * Which StatsIQ charting prompt runs: the narrative one above, or the
 * closed-question rebuild in modules/statsiq-facts.ts.
 *
 * `narrative` is the default and stays the default until a measurement says
 * otherwise. The rebuild exists because the charting pass is the module's
 * unreliable component — right once in nine runs on the two clips whose truth
 * we have, against a short closed-question prompt that was right every time it
 * answered — but "this ought to be better" is exactly the reasoning that
 * shipped four StatsIQ fixes of which two were wrong. Nothing about the sample
 * rate, the resolution or the jersey colour survived contact with the eval
 * either.
 *
 * Flip it with `STATSIQ_CHARTING=facts`, and only flip the default after
 * `EVAL_CHARTING=facts npx tsx scripts/eval-statsiq.ts <clip> 4` beats the
 * recorded baseline on BOTH ground-truth clips. The two paths converge on
 * RawStatPlay, so reconciliation, the mesh gate, the identity gates and the
 * tally are identical either way — the only variable is the ask.
 */
export type ChartingStrategy = 'narrative' | 'facts'

export function statsIQChartingStrategy(): ChartingStrategy {
  return process.env.STATSIQ_CHARTING === 'facts' ? 'facts' : 'narrative'
}

/**
 * Modules that may report a jersey number, and therefore need the roster as a
 * closed set to check one against. Each attributes something to a specific
 * child — a grade, a carry, a blown assignment — so all of them go through the
 * same gates.
 *
 * MISTAKEIQ was added after the module sweep caught it writing "#6" and "#18"
 * into a report on film with no roster on file. It had no roster and no scrub
 * because it reports mistakes as PROSE rather than as numbered claims, so the
 * structured identity gates never saw them — and prose reaches the same coach.
 */
const NUMBER_VERIFYING_MODULES = ['RANKERIQ', 'STATSIQ', 'MISTAKEIQ']

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
  const baseConfig = MODULE_MAP[input.moduleKey]
  if (!baseConfig) throw new Error(`Unknown module: ${input.moduleKey}`)

  // The sample rate and resolution are MEASURED for this module and belong to
  // the film, not to the prompt — only the ask changes.
  const charting = input.moduleKey === 'STATSIQ' ? statsIQChartingStrategy() : 'narrative'
  const config: ModuleConfig =
    charting === 'facts'
      ? {
          ...baseConfig,
          buildPrompt: buildSTATSIQFactsPrompt,
          schema: STATSIQ_FACTS_RESPONSE_SCHEMA,
        }
      : baseConfig

  const { mode: evidenceMode, clip, frames } = await resolveEvidence(input, supabase)
  if (!clip && !frames.length) {
    throw new Error('No film available to analyze — this video has neither a stored clip nor extracted frames.')
  }

  // game_type drives the flag/tackle contact-drill safety gate — fetched
  // authoritatively from the DB rather than trusted from the client, since
  // a client-supplied value here would let a caller bypass the gate.
  const { data: teamRow } = await supabase
    .from('teams')
    .select('game_type, level, age_group, offensive_style, defensive_style, home_jersey_color, away_jersey_color')
    .eq('id', input.teamId)
    .maybeSingle()
  const gameType = teamRow?.game_type as 'flag' | 'tackle' | 'rookie_tackle' | null | undefined

  /**
   * The coach's jersey colour when the module screen did not ask for one.
   *
   * Only four of the eight module screens carry the home/away picker, so
   * QBIQ, OLIQ and RBIQ — the three that grade ONE NAMED CHILD — were reaching
   * the model with no way to tell which of the two teams on the field is ours.
   * The team row already knows, so it is supplied here rather than by adding a
   * picker to three more screens.
   *
   * WHEN THE TEAM WEARS TWO COLOURS THIS STAYS EMPTY, deliberately. A WRONG
   * colour is worse than none: with none the prompt grades only what it can
   * attribute unambiguously, and with the opposite colour it confidently
   * grades the other team's quarterback under this child's name. That is the
   * exact trap the module screens' picker was changed to avoid — it used to
   * default to HOME and silently shipped the wrong colour on away film — so
   * this must not reintroduce it by guessing.
   */
  const unambiguousTeamColor = (() => {
    const home = (teamRow?.home_jersey_color as string | null) ?? null
    const away = (teamRow?.away_jersey_color as string | null) ?? null
    if (home && away) return home.trim().toLowerCase() === away.trim().toLowerCase() ? home : undefined
    return home ?? away ?? undefined
  })()
  const tier = resolveLevelTier(teamRow as { age_group?: string | null; level?: string | null } | null)
  // Whose film is this? Read from the video row, never from the caller: it
  // decides how the subject is named and whether the coach's roster is a valid
  // closed set of jersey numbers for the players on screen.
  const filmSubject = await resolveFilmSubject(supabase, input.videoId)
  const misdirected = isMisdirectedRun(input.moduleKey, filmSubject)

  // RANKERIQ and STATSIQ verify every jersey number against the roster, so the
  // roster is read here from the DB rather than accepted from the caller — it
  // decides which numbers are allowed to exist, a trust boundary.
  //
  // On opponent film that boundary inverts: the coach's roster is a list of
  // numbers worn by players who are NOT on screen, so matching against it
  // would hand one of their kids' identities to an opposing player. An
  // opponent run gets no roster and therefore grades by role only.
  let roster: { id: string; jersey_number: string | null; position: string | null; name: string | null }[] = []
  if (NUMBER_VERIFYING_MODULES.includes(input.moduleKey) && !misdirected) {
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

  // An own-team module on opponent film must not be handed the coach's team
  // name as the subject — that is what produced an opponent's players being
  // described as "The Tinley Park Bulldogs LW defense".
  const subjectName = subjectNameFor(input.moduleKey, filmSubject, input.team?.name)

  const inputWithGameType: ModulePromptInput = {
    ...input,
    team: input.team
      ? {
          ...input.team,
          name: subjectName,
          // The coach's jersey colour identifies the coach's team. On opponent
          // film they may not be on screen at all, and TEAMIQ's prompt reads
          // "the <colour> players ARE the subject team" — which would pick the
          // wrong side, or nobody. Dropping it moves those prompts onto their
          // own careful no-colour branch.
          // A colour the coach chose for THIS run always wins — they know
          // which kit was worn. The team row is the fallback, and only when it
          // is unambiguous.
          jersey_color: misdirected ? undefined : input.team.jersey_color ?? unambiguousTeamColor,
          game_type: gameType ?? undefined,
          // Standing scheme context from the team row, so a coach records it
          // once in team settings rather than retyping it into every run.
          // A value the client sent for THIS run still wins — some module
          // screens let a coach override the style for one analysis — and it
          // is dropped entirely on opponent film, where it describes the
          // wrong team.
          offensive_style: misdirected
            ? undefined
            : input.team.offensive_style ?? (teamRow?.offensive_style as string | undefined),
          defensive_style: misdirected
            ? undefined
            : input.team.defensive_style ?? (teamRow?.defensive_style as string | undefined),
        }
      : input.team,
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

  // STATSIQ: find the football before reading it.
  //
  // A clip of "one play" is mostly not the play — the 31-second clip that
  // produced three contradictory sheets holds a snap at ~6.5s and a score at
  // ~22s, and the rest is teams lining up. Handed all of it, the charting pass
  // anchored on a different stretch each run and reported a different
  // FORMATION each time. Locating the play first costs one cheap low-fps call
  // and hands the expensive pass a window that is mostly football.
  let located: ClipWindow | null = null
  if (input.moduleKey === 'STATSIQ' && clip) {
    const locatorPrompt = buildPlayLocatorPrompt(inputWithGameType)
    const locatorKey = [
      clip.source.kind === 'file' ? clip.source.fileUri : clip.source.bytes.toString('base64'),
      `locate@${clip.startOffsetSeconds ?? 0}-${clip.endOffsetSeconds ?? ''}`,
    ]
    const locatorHash = hashCacheKey('frame_observation', locatorPrompt, locatorKey)
    let locatorJson = await getCachedResponse<string>(supabase, locatorHash)
    if (locatorJson == null) {
      // Deliberately cheap: finding a snap does not need to resolve a jersey.
      const locatorResult = await analyzeClipWithGemini(
        locatorPrompt,
        clip.source,
        PLAY_LOCATOR_SCHEMA,
        {
          model: route.model,
          fps: 2,
          mediaResolution: 'low',
          startOffsetSeconds: clip.startOffsetSeconds,
          endOffsetSeconds: clip.endOffsetSeconds,
        }
      ).catch(() => null)
      if (locatorResult) {
        locatorJson = locatorResult.text
        await recordUsage(supabase, {
          teamId: input.teamId, userId, jobType: 'frame_observation',
          provider: route.provider, model: route.model,
          inputTokens: locatorResult.usage.inputTokens, outputTokens: locatorResult.usage.outputTokens,
        })
        await setCachedResponse(supabase, locatorHash, 'frame_observation', locatorJson)
      }
    }
    if (locatorJson != null) {
      located = playWindow(
        parseLocatedPlays(locatorJson),
        clip.durationSeconds,
        clip.startOffsetSeconds != null && clip.endOffsetSeconds != null
          ? { startOffsetSeconds: clip.startOffsetSeconds, endOffsetSeconds: clip.endOffsetSeconds }
          : null
      )
    }
  }

  // The slice every later pass reads — the located window when there is one,
  // otherwise whatever the clip already resolved to.
  const readWindow = {
    startOffsetSeconds: located?.startOffsetSeconds ?? clip?.startOffsetSeconds,
    endOffsetSeconds: located?.endOffsetSeconds ?? clip?.endOffsetSeconds,
  }

  // In video mode the evidence is the clip plus the slice and sample rate we
  // read it at, so that — not frame bytes — is what identifies the request.
  const evidenceKey = clip
    ? [
        clip.source.kind === 'file' ? clip.source.fileUri : clip.source.bytes.toString('base64'),
        `${readWindow.startOffsetSeconds ?? 0}-${readWindow.endOffsetSeconds ?? ''}@${config.fps}/${config.resolution}`,
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
          startOffsetSeconds: readWindow.startOffsetSeconds,
          endOffsetSeconds: readWindow.endOffsetSeconds,
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

  // The closed-question read answers questions; the credits are assembled from
  // those answers here, before anything downstream sees them. This is the only
  // place in the pipeline that knows which charting prompt ran.
  if (charting === 'facts') {
    parsedJson = factsOutputToAnalysisOutput(parsedJson)
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

  // The model can only cite a frame it was actually shown. An index outside
  // that set is the cheapest hallucination signal we have — and rendering it
  // would seek a coach to nothing — so drop it here rather than pass it on.
  // Frames are labelled by their real `video_frames.frame_index`, so this
  // compares against identity, not array position.
  //
  // Declared before its first use: `safeMistakes` below calls it during its
  // own initializer, so leaving it further down put it in the temporal dead
  // zone and threw on any MISTAKEIQ run that actually found a mistake.
  const shownIndexes = new Set(frames.map((f) => f.index))
  const keepCited = (cited?: number[]) => (cited ?? []).filter((i) => shownIndexes.has(i))

  // Belt-and-suspenders: the prompt already bans these, but scrub the
  // structured output too before it can reach a coach's screen.
  const { drills: safeDrills } = applyDrillSafetyFilter(
    prescriptions.length ? renderPrescriptions(prescriptions) : parsed.drills,
    gameType,
    tier
  )
  // Jersey numbers the roster cannot vouch for, stripped out of free prose.
  //
  // The structured identity gates only ever saw structured claims. MISTAKEIQ
  // states its findings as sentences, so its numbers went straight past them —
  // measured on real film with no roster, it named "#6" and "#18" as the players
  // who blew the play. With no roster there is nothing to check against and
  // every number goes; with one, a number ON it survives, because that is a real
  // identification and "#6 lost his gap" is what a coach wants to read.
  const verifiedNumbers = new Set(
    roster.map((p) => p.jersey_number).filter((n): n is string => !!n).map((n) => String(Number(n)))
  )
  const deident = NUMBER_VERIFYING_MODULES.includes(input.moduleKey)
    ? (text: string | undefined) => (text ? scrubUnverifiedNumbers(text, verifiedNumbers) : text)
    : (text: string | undefined) => text

  const safeMistakes = parsed.mistakes?.map((m) => {
    const correction = scrubProhibitedDrillMentions(m.correction)
    const drill = m.drill
      ? applyDrillSafetyFilter([m.drill], gameType, tier).drills[0]
      : m.drill
    return {
      ...m,
      title: deident(m.title) ?? m.title,
      description: deident(m.description) ?? m.description,
      likely_impact: deident(m.likely_impact) ?? m.likely_impact,
      correction: deident(correction) ?? correction,
      drill,
      evidence_frames: keepCited(m.evidence_frames),
    }
  })

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

  // STATSIQ: the charting read gets checked by a SECOND, independent read
  // before any of it is counted.
  //
  // A single pass produced two mutually exclusive accounts of the same clip on
  // consecutive runs — a rushing touchdown by a back, then a passing touchdown
  // to a receiver — each citing timestamps, each reporting 0.95 confidence, and
  // the truth (a quarterback keeper) matching neither. The model's own
  // confidence cannot detect that, so corroboration has to come from outside
  // it. Where the two reads agree, the credits count. Where they disagree, the
  // coach is asked. See stat-verify.ts.
  let statPlays = parsed.stat_plays
  let statDisputes: string[] = []
  let chartingAgreement: number | null = null
  // Runs on EVERY StatsIQ analysis, both evidence paths. The frame path is the
  // weakest read in the product — a browser quick clip or film we have no
  // stored copy of — so exempting it would have left the least reliable
  // charting as the only uncorroborated charting, while still showing an
  // agreement score. There is no toggle: a sheet nobody checked is the thing
  // this module exists to stop producing.
  if (input.moduleKey === 'STATSIQ' && statPlays?.length) {
    const verifyPrompt = buildPlayVerificationPrompt(inputWithGameType)
    const verifyHash = hashCacheKey('frame_observation', `STATSIQ:verify:${verifyPrompt}`, evidenceKey)
    const cachedVerify = await getCachedResponse<string>(supabase, verifyHash)

    // One read of the film by the checking prompt. Called again below, on a
    // disputed play, to find out whether the check is consistent with itself.
    const runVerification = () =>
      clip
        ? analyzeClipWithGemini(verifyPrompt, clip.source, PLAY_VERIFICATION_SCHEMA, {
            model: route.model,
            fps: config.fps,
            mediaResolution: config.resolution,
            startOffsetSeconds: readWindow.startOffsetSeconds,
            endOffsetSeconds: readWindow.endOffsetSeconds,
          })
        : analyzeFramesWithGemini(verifyPrompt, frames, PLAY_VERIFICATION_SCHEMA, {
            model: route.model,
          })

    let verifyJson = cachedVerify
    if (verifyJson == null) {
      // Retried once, because losing this call is not a neutral outcome.
      //
      // Measured on real film: across six runs the charting pass got the play
      // right once, and the verification pass got it right every time it
      // answered — so when verification drops, what ships is the read that is
      // usually wrong, with only "not corroborated" beside it. A 503 from an
      // overloaded model (observed, mid-eval) is transient and a second attempt
      // costs a few seconds against a sheet that would otherwise carry an
      // interception the film does not contain.
      const verifyResult = await runVerification()
        .catch(() => runVerification())
        .catch(() => null)
      if (verifyResult) {
        verifyJson = verifyResult.text
        await recordUsage(supabase, {
          teamId: input.teamId, userId, jobType: 'frame_observation',
          provider: route.provider, model: route.model,
          inputTokens: verifyResult.usage.inputTokens, outputTokens: verifyResult.usage.outputTokens,
        })
        await setCachedResponse(supabase, verifyHash, 'frame_observation', verifyJson)
      }
    }

    // A verification that fails to run must never fail the analysis — but it
    // must not silently pass it either, so agreement stays null and the sheet
    // says it was not corroborated.
    if (verifyJson != null) {
      const verified = parseVerification(verifyJson)

      // The check may overrule the charting read only when a SECOND run of the
      // check tells the same story. See verificationsAgreeOnPlayType for the
      // measurement: neither "the check always wins" nor "charting always wins"
      // is right on both ground-truth clips, and requiring corroboration scores
      // the best of each (11/11 against 10/11 and 5/11).
      //
      // Paid for only when the veto would actually fire — on a film where the
      // two reads already agree there is nothing to corroborate, which is the
      // overwhelming majority of plays.
      let playTypeVeto: 'check' | 'charting' = 'check'
      if (hasPlayTypeDispute(statPlays, verified)) {
        // A DIFFERENT cache key, or the store hands back the first call's own
        // answer and the corroboration test passes vacuously against itself.
        const verify2Hash = hashCacheKey(
          'frame_observation',
          `STATSIQ:verify2:${verifyPrompt}`,
          evidenceKey
        )
        let verify2Json = await getCachedResponse<string>(supabase, verify2Hash)
        if (verify2Json == null) {
          const second = await runVerification().catch(() => null)
          if (second) {
            verify2Json = second.text
            await recordUsage(supabase, {
              teamId: input.teamId, userId, jobType: 'frame_observation',
              provider: route.provider, model: route.model,
              inputTokens: second.usage.inputTokens, outputTokens: second.usage.outputTokens,
            })
            await setCachedResponse(supabase, verify2Hash, 'frame_observation', verify2Json)
          }
        }
        // A second read we could not get leaves the shipped behaviour in place.
        // Falling the other way would be worse: "charting always wins" scored
        // 1/7 on the pass clip, where the check is the read that is right.
        if (verify2Json != null) {
          playTypeVeto = verificationsAgreeOnPlayType(verified, parseVerification(verify2Json))
            ? 'check'
            : 'charting'
        }
      }

      const reconciled = reconcileReadings(statPlays, verified, { playTypeVeto })
      statPlays = reconciled.plays
      statDisputes = reconciled.disputes
      chartingAgreement = reconciled.agreement
    }

    // The one claim two agreeing reads cannot establish: which of the backfield
    // players came out of the mesh with the ball. Applied after reconciliation
    // and independently of whether it ran, because it is not a disagreement
    // rule — both reads agreeing on the wrong back is the case it exists for.
    // See flagMeshPointCarries.
    statPlays = flagMeshPointCarries(statPlays, {
      qbMeshScheme: schemeHasQbMesh(inputWithGameType.team?.offensive_style),
    })
  }

  // STATSIQ: same division of labour one more time. The model charted plays;
  // every carry, yard and tackle a coach reads is summed here, from credits
  // whose jersey numbers went through the identity gates above. A model asked
  // for a stat line returns one whose own columns disagree.
  const stats = statPlays?.length
    ? tallyStatPlays(statPlays, {
        roster,
        allowNumbers,
        // A stat is checkable by the coach who was at the game in a way a
        // grade is not, so a number the film genuinely showed is kept and
        // labelled unverified rather than discarded for want of a roster.
        // The frame-cited and legibility gates still apply.
        allowUnverifiedNumbers: true,
        declaredSide: input.team?.side_of_ball,
        // The staff's tagged gain outranks any yardage read off the film.
        breakdownGain: input.playSequence?.gain_loss ?? null,
      })
    : null
  // A credit's citations are validated the same way every other citation is:
  // a timestamp outside the clip, or a frame we never showed, is dropped
  // rather than rendered as a seek that goes nowhere.
  const statCredits = stats?.credits.map((c) => ({
    ...c,
    evidenceTimestamps: keepTimestamps(c.evidenceTimestamps),
    evidenceFrames: keepCited(c.evidenceFrames),
  }))

  return {
    // StatsIQ's headline number is how much the two independent reads AGREED,
    // not how sure the model says it is. A self-reported 0.95 sat on top of a
    // wrong answer; measured corroboration cannot.
    overall_score: chartingAgreement ?? overall.value ?? 0,
    position_scores: parsed.position_scores,
    // `deident` runs LAST, over whichever text actually reaches the coach — the
    // Claude write-up when there is one, pass one's own prose when the write-up
    // failed. Scrubbing only the raw read would have left the second pass free
    // to carry a number forward into the version that is displayed.
    reasoning: Object.fromEntries(
      Object.entries(
        written?.reasoning && Object.keys(written.reasoning).length ? written.reasoning : parsed.reasoning
      ).map(([k, v]) => [k, deident(v) ?? v])
    ),
    strengths: (written?.strengths ?? parsed.strengths).map((s) => deident(s) ?? s),
    weaknesses: (written?.weaknesses ?? parsed.weaknesses).map((s) => deident(s) ?? s),
    drills: safeDrills,
    prescriptions,
    summary: deident(written?.summary ?? parsed.summary) ?? parsed.summary,
    // No silent 0.7 default: an unexplained number is what made confidence
    // decoration in the first place.
    confidence: derived?.value ?? parsed.confidence ?? 0.5,
    confidence_reasons: derived?.reasons ?? [],
    confidence_signals: hasSignals ? confidenceSignals : undefined,
    evidence_frames: keepCited(parsed.evidence_frames),
    evidence_timestamps: keepTimestamps(parsed.evidence_timestamps),
    breakdown: prunedBreakdown,
    analysisMode: evidenceMode,
    // Recorded where it is known. A correction made three weeks from now
    // needs to name the prompt that produced the result, not whichever
    // prompt happens to be current when the coach fixes it.
    promptVersion: promptVersion(input.moduleKey, systemPrompt),
    plays_observed: parsed.plays_observed,
    head_contact_flag: parsed.head_contact_flag,
    offensive_tendencies: parsed.offensive_tendencies,
    defensive_tendencies: parsed.defensive_tendencies,
    formations: parsed.formations,
    explosive_plays: parsed.explosive_plays,
    situational_tells: parsed.situational_tells,
    attack_points: parsed.attack_points,
    subject_graded: parsed.subject_graded,
    subject_confirmed: parsed.subject_confirmed,
    opponent_possession: parsed.opponent_possession,
    mistakes: safeMistakes,
    player_grades: rankedGrades,
    stat_plays: statPlays,
    stat_credits: statCredits,
    stat_lines: stats?.lines,
    team_stats: stats?.team,
    stat_warnings: stats ? [...statDisputes, ...stats.warnings] : statDisputes.length ? statDisputes : undefined,
    stat_disputes: statDisputes.length ? statDisputes : undefined,
    unit_graded: parsed.unit_graded,
    players_not_evaluable: parsed.players_not_evaluable,
    target_players: parsed.target_players,
    // Only on a snap where the opponent was DEFENDING. Charted on the offence's
    // own plays it would describe the coach's team as if it were the scouting
    // subject, and the batch rollup would average two different defences
    // together — the one failure this whole block exists to produce evidence
    // against.
    defensive_snaps:
      parsed.opponent_possession === 'defense' || parsed.opponent_possession === 'both'
        ? parsed.defensive_snaps?.map((s) => normalizeDefensiveSnap(s as Record<string, unknown>))
        : undefined,
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
