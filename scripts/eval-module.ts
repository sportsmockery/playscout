/**
 * Run ANY intelligence module against a clip on disk, several times, and say
 * how it did.
 *
 *   GOOGLE_API_KEY=... npx tsx scripts/eval-module.ts <clip> [MODULE|all] [runs]
 *   EVAL_TRUTH=run,touchdown,qb  — facts about the clip to check answers against
 *
 * `scripts/eval-statsiq.ts` measures the one module with a checkable answer: a
 * box score is right or wrong. Every other module returns a grade and a
 * paragraph, and there is no ground truth for "the left tackle's kick slide was
 * a 74". That is not a reason to ship them unmeasured — it is a reason to
 * measure the things that ARE checkable without knowing the right answer:
 *
 *   DOES IT RUN        — schema rejections and thrown calls. A response the Zod
 *                        schema refuses costs the money and then saves nothing;
 *                        StatsIQ shipped that failure to production silently.
 *   IS IT STABLE       — the same clip read three times. A module that grades
 *                        one rep 62, 78 and 91 is broken whichever number is
 *                        right, and this is exactly how StatsIQ's real defect
 *                        was found: not by being wrong once, but by being
 *                        differently wrong each time.
 *   IS IT GROUNDED     — claims that point at a moment in the film, cue markers
 *                        that describe something visible rather than renaming
 *                        the cue and grading it (lib/intelligence/report-quality.ts,
 *                        which has existed unused since the rubrics landed).
 *   DOES IT INVENT     — jersey numbers on film with no roster, citations
 *                        outside the clip, more plays than the clip contains,
 *                        a pass on a run play. Each of these is false ON ITS
 *                        FACE, no ground truth needed.
 *   WHAT IT COSTS      — tokens and wall time per run.
 *
 * Reads the key from the environment. Nothing here writes it anywhere.
 */
import { readFileSync } from 'node:fs'
import { GoogleGenAI, MediaResolution } from '@google/genai'
import { MODULE_MAP } from '../lib/intelligence/analyze-position'
import { PositionAnalysisOutputSchema, type ModulePromptInput } from '../lib/intelligence/schemas'
import {
  buildPlayLocatorPrompt,
  PLAY_LOCATOR_SCHEMA,
  parseLocatedPlays,
  playWindow,
} from '../lib/intelligence/locate-play'
import { measureDepth, measureSpecificity } from '../lib/intelligence/report-quality'
import { QBIQ_CUES, OLIQ_CUES, RBIQ_CUES, RUBRICS } from '../lib/intelligence/rubrics'
import { computeOverall, weightsFor } from '../lib/intelligence/scoring'
import { contentWords, jaccard } from '../lib/intelligence/aggregate-batch'
import type { CueCatalog } from '../lib/intelligence/breakdown'

const MODEL = 'gemini-2.5-pro'

/** Cue catalogs exist only for the three modules that grade one player's rep. */
const CATALOGS: Record<string, CueCatalog> = { QBIQ: QBIQ_CUES, OLIQ: OLIQ_CUES, RBIQ: RBIQ_CUES }

/** PlaybookIQ parses documents, not film — it has no place in a film harness. */
const FILM_MODULES = ['QBIQ', 'OLIQ', 'RBIQ', 'TEAMIQ', 'MISTAKEIQ', 'SCOUTIQ', 'RANKERIQ', 'STATSIQ']

const clipPath = process.argv[2]
const moduleArg = (process.argv[3] ?? 'all').toUpperCase()
const runs = Number(process.argv[4] ?? 3)

if (!clipPath) {
  console.error('usage: GOOGLE_API_KEY=... npx tsx scripts/eval-module.ts <clip> [MODULE|all] [runs]')
  process.exit(1)
}
const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('GOOGLE_API_KEY is not set.')
  process.exit(1)
}

const modules = moduleArg === 'ALL' ? FILM_MODULES : moduleArg.split(',')
const client = new GoogleGenAI({ apiKey })
const bytes = readFileSync(clipPath)
const mimeType = clipPath.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'
const clipSeconds = Number(process.env.EVAL_CLIP_SECONDS ?? 31.68)

/**
 * What the coach says is true about this clip, as a comma list — anything a
 * module can be caught contradicting. `run`/`pass` gates the play-type check;
 * `touchdown` and a position id are recorded for the report.
 */
const truth = (process.env.EVAL_TRUTH ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)

const input: ModulePromptInput = {
  moduleKey: 'QBIQ',
  teamId: 'eval',
  frames: [],
  team: {
    name: 'Eval Team',
    side_of_ball: 'offense',
    game_type: 'tackle',
    offensive_style: process.env.EVAL_OFFENSE || undefined,
  },
  evidenceMode: 'video',
}

async function call(
  systemPrompt: string,
  schema: object,
  opts: { fps: number; resolution: 'low' | 'medium' | 'high'; start?: number; end?: number }
) {
  const videoMetadata: Record<string, unknown> = { fps: opts.fps }
  if (opts.start != null) videoMetadata.startOffset = `${opts.start.toFixed(3)}s`
  if (opts.end != null) videoMetadata.endOffset = `${opts.end.toFixed(3)}s`

  const startedAt = Date.now()
  const res = await client.models.generateContent({
    model: MODEL,
    contents: [
      { role: 'user', parts: [{ inlineData: { mimeType, data: bytes.toString('base64') }, videoMetadata }] },
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.2,
      maxOutputTokens: 8192,
      mediaResolution:
        opts.resolution === 'high'
          ? MediaResolution.MEDIA_RESOLUTION_HIGH
          : opts.resolution === 'low'
            ? MediaResolution.MEDIA_RESOLUTION_LOW
            : MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    },
  })
  return {
    text: res.text ?? '',
    inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
    ms: Date.now() - startedAt,
  }
}

interface RunResult {
  ok: boolean
  failure?: string
  ms: number
  inputTokens: number
  outputTokens: number
  score: number | null
  claims: number
  anchoredProse: number
  anchoredCues: number
  emptyMarkers: number
  catalogCoverage: number | null
  /** Claims joined, for measuring how much two runs of the same clip agree. */
  claimText: string[]
  violations: string[]
}

/**
 * Checks that need no ground truth, only the clip in front of us. Every one of
 * these is a statement that is false on its face.
 */
function findViolations(moduleKey: string, parsed: Record<string, unknown>, raw: string): string[] {
  const out: string[] = []

  // A jersey number in prose, with no roster on file. Both number-verifying
  // modules scrub unverified numbers in code, so one surviving into the text a
  // coach reads means a gate leaked.
  const prose = [
    parsed.summary,
    ...((parsed.strengths as string[]) ?? []),
    ...((parsed.weaknesses as string[]) ?? []),
    ...Object.values((parsed.reasoning as Record<string, string>) ?? {}),
  ]
    .filter((t): t is string => typeof t === 'string')
    .join(' ')
  const numbers = prose.match(/#\s?\d{1,2}\b/g)
  if (numbers) out.push(`jersey number in prose with no roster on file: ${[...new Set(numbers)].join(', ')}`)

  // Citations have to land inside the film that was actually shown.
  const stamps = (parsed.evidence_timestamps as number[]) ?? []
  const outOfRange = stamps.filter((t) => t < 0 || t > clipSeconds)
  if (outOfRange.length) out.push(`timestamp outside the clip: ${outOfRange.join(', ')}`)

  // One snap in, one snap out.
  const observed = parsed.plays_observed as number | undefined
  if (typeof observed === 'number' && observed > 1) out.push(`claims ${observed} plays in a one-play clip`)

  // The play type, where the coach told us what it was. Checked against the
  // raw response so it catches a module that states it in prose rather than a
  // field — this is the error that cost the most trust on StatsIQ.
  //
  // Sentence by sentence and negation-aware, because these prompts legitimately
  // say "no pass attempt was made on this rep" and a naive substring match
  // would score the right answer as the wrong one. A check that cries wolf gets
  // ignored, and then it is worth less than no check.
  if (truth.includes('run')) {
    if (/"play_type"\s*:\s*"pass"/i.test(raw)) out.push('charted play_type "pass" on a run play')
    const asserted = raw
      .split(/(?<=[.!?])\s+|","|\\n/)
      .filter(
        (s) =>
          /\bpass(?:ing)? (?:play|attempt|touchdown)\b|\bcompleted? (?:a )?pass\b|\bthrew\b|\bthrow(?:s|ing)? (?:the ball|downfield|to)\b/i.test(s) &&
          !/\b(?:no|not|never|without|n't|rather than|instead of|non-|zero)\b/i.test(s)
      )
    for (const s of asserted.slice(0, 2)) out.push(`asserts a pass on a run play: "${s.trim().slice(0, 120)}"`)
  }

  // A score is a grade on a 0-100 scale; anything else is a schema that let
  // something through.
  const score = parsed.overall_score as number | undefined
  if (typeof score === 'number' && (score < 0 || score > 100)) out.push(`overall_score out of range: ${score}`)

  // TEAMIQ and SCOUTIQ report tendencies with a sample size; a tendency
  // claiming more plays than the clip holds is invented frequency.
  for (const key of ['offensive_tendencies', 'defensive_tendencies']) {
    for (const t of (parsed[key] as { sample_size?: number; tendency?: string }[]) ?? []) {
      if ((t.sample_size ?? 0) > 1) out.push(`${key}: sample_size ${t.sample_size} from one play`)
    }
  }

  if (moduleKey === 'SCOUTIQ') {
    // SCOUTIQ scouts the OPPONENT. Pointed at our own film it should say so
    // rather than scouting us to ourselves.
    const graded = (parsed.unit_graded ?? parsed.subject_graded) as string | undefined
    if (typeof graded === 'string' && /eval team/i.test(graded)) {
      out.push('scouted our own team as the opponent')
    }
  }

  return out
}

async function runOnce(moduleKey: string, window: { start?: number; end?: number }): Promise<RunResult> {
  const config = MODULE_MAP[moduleKey]
  const prompt = config.buildPrompt({ ...input, moduleKey: moduleKey as ModulePromptInput['moduleKey'] })

  let res
  try {
    res = await call(prompt, config.schema, {
      fps: config.fps,
      resolution: config.resolution,
      ...window,
    })
  } catch (err) {
    return blank(`THREW: ${err instanceof Error ? err.message : err}`)
  }

  let json: unknown
  try {
    json = JSON.parse(res.text)
  } catch {
    return { ...blank('INVALID JSON'), ms: res.ms, inputTokens: res.inputTokens, outputTokens: res.outputTokens }
  }

  const parsed = PositionAnalysisOutputSchema.safeParse(json)
  if (!parsed.success) {
    return {
      ...blank(`SCHEMA REJECTED: ${parsed.error.issues.slice(0, 2).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`),
      ms: res.ms,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    }
  }

  const data = parsed.data
  const catalog = CATALOGS[moduleKey]
  const depth = catalog ? measureDepth(data, catalog) : null
  const spec = measureSpecificity(data)

  // The number a coach actually sees. For the three rubric modules the model is
  // told NOT to do the arithmetic — scoring.ts derives it from the dimension
  // scores and reweights for dimensions with no evidence — so reading
  // overall_score straight off the response reported "no score" and hid the one
  // figure whose run-to-run variance matters most.
  const rubric = RUBRICS[moduleKey]
  const score = rubric
    ? computeOverall(data.position_scores, weightsFor(rubric)).value
    : (data.overall_score ?? null)

  return {
    ok: true,
    ms: res.ms,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    score,
    claims: (data.strengths?.length ?? 0) + (data.weaknesses?.length ?? 0) + Object.keys(data.reasoning ?? {}).length,
    anchoredProse: spec.anchoredProse,
    anchoredCues: spec.anchoredCues,
    emptyMarkers: spec.emptyMarkers,
    catalogCoverage: depth?.catalogCoverage ?? null,
    claimText: [...(data.strengths ?? []), ...(data.weaknesses ?? [])],
    violations: findViolations(moduleKey, data as Record<string, unknown>, res.text),
  }
}

function blank(failure: string): RunResult {
  return {
    ok: false, failure, ms: 0, inputTokens: 0, outputTokens: 0, score: null, claims: 0,
    anchoredProse: 0, anchoredCues: 0, emptyMarkers: 0, catalogCoverage: null,
    claimText: [], violations: [],
  }
}

/**
 * How much two readings of the SAME clip say the same thing. Averaged over
 * every pair of runs. Low agreement is not a style problem: it means the module
 * is reporting something other than what is on the film, because the film did
 * not change between runs.
 */
function selfConsistency(results: RunResult[]): number | null {
  const sets = results.filter((r) => r.ok).map((r) => contentWords(r.claimText.join(' ')))
  if (sets.length < 2) return null
  let total = 0
  let pairs = 0
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      total += jaccard(sets[i], sets[j])
      pairs++
    }
  }
  return pairs ? total / pairs : null
}

function pct(n: number | null): string {
  return n == null ? '  — ' : `${Math.round(n * 100)}%`.padStart(4)
}

async function main() {
  // The locator runs for STATSIQ only, exactly as production does — every other
  // module is shown the whole clip, and measuring them on a narrowed one would
  // measure something nobody ships.
  let statsWindow: { start?: number; end?: number } = {}
  if (modules.includes('STATSIQ')) {
    const loc = await call(buildPlayLocatorPrompt(input), PLAY_LOCATOR_SCHEMA, { fps: 2, resolution: 'low' })
    const w = playWindow(parseLocatedPlays(loc.text), clipSeconds)
    if (w) statsWindow = { start: w.startOffsetSeconds, end: w.endOffsetSeconds }
  }

  const table: string[] = []

  for (const moduleKey of modules) {
    if (!MODULE_MAP[moduleKey]) {
      console.log(`\n${moduleKey}: no such module`)
      continue
    }
    const config = MODULE_MAP[moduleKey]
    const window = moduleKey === 'STATSIQ' ? statsWindow : {}
    console.log(`\n═══ ${moduleKey}  (${config.fps}fps/${config.resolution}${window.start != null ? ', windowed' : ''}) ═══`)

    const results: RunResult[] = []
    for (let i = 1; i <= runs; i++) {
      const r = await runOnce(moduleKey, window)
      results.push(r)
      const scores = r.score == null ? 'no score' : `score ${r.score}`
      console.log(
        r.ok
          ? `  run ${i}: ok   ${scores.padEnd(10)} ${r.claims} claims  ${(r.ms / 1000).toFixed(1)}s  ${r.inputTokens} tok` +
            (r.violations.length ? `\n         ⚠ ${r.violations.join('\n         ⚠ ')}` : '')
          : `  run ${i}: ✗ ${r.failure}`
      )
    }

    const ok = results.filter((r) => r.ok)
    const scores = ok.map((r) => r.score).filter((s): s is number => s != null)
    const spread = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : null
    const avg = (f: (r: RunResult) => number) => (ok.length ? ok.reduce((s, r) => s + f(r), 0) / ok.length : 0)
    const violations = results.flatMap((r) => r.violations)

    table.push(
      [
        moduleKey.padEnd(10),
        `${ok.length}/${results.length}`.padEnd(5),
        spread == null ? '  — ' : `±${spread}`.padStart(4),
        pct(selfConsistency(results)),
        pct(avg((r) => r.anchoredProse)),
        // Only the three rubric modules have a cue catalog to cover.
        pct(CATALOGS[moduleKey] && ok.length ? avg((r) => r.catalogCoverage ?? 0) : null),
        String(violations.length).padStart(4),
        `${(avg((r) => r.ms) / 1000).toFixed(0)}s`.padStart(5),
        `${Math.round(avg((r) => r.inputTokens) / 1000)}k`.padStart(5),
      ].join('  ')
    )
  }

  console.log('\n\n══════════════════ SUMMARY ══════════════════')
  console.log('module      ok     spread  agree  anchor  cues  viol   time   tok')
  for (const row of table) console.log(row)
  console.log(`
  ok      runs that parsed AND passed the result schema
  spread  max minus min overall_score across runs of the SAME clip
  agree   how much two runs' strengths/weaknesses overlap (content words)
  anchor  share of prose claims citing a frame or a timestamp
  cues    share of the module's rubric catalog the breakdown accounted for
  viol    claims false on their face — see the per-run warnings above`)
}

main()
