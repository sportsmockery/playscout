/**
 * Run the real StatsIQ pipeline against a local clip, and say what it found.
 *
 * CLAUDE.md has listed "no eval harness runs against real film yet — the
 * metrics exist, the runner does not" as a known gap since the rubrics landed.
 * This is the runner, and it exists because four fixes were shipped to StatsIQ
 * on reasoning alone and two of them were wrong. Charting film is not something
 * unit tests can check: the tally is provably correct and the READING is what
 * fails, so the only honest test drives the actual model against actual film.
 *
 * It calls Gemini directly with a file on disk — no Supabase, no cache, no
 * Vercel — so a change can be measured in a minute instead of deployed and
 * guessed at. Running it N times over one clip measures the two things that
 * matter: how often the read is RIGHT, and how often it contradicts ITSELF.
 *
 *   GOOGLE_API_KEY=... npx tsx scripts/eval-statsiq.ts <clip.mov> [runs]
 *
 * Never commit a key: it is read from the environment, and nothing here writes
 * it anywhere.
 */
import { readFileSync } from 'node:fs'
import { GoogleGenAI, MediaResolution } from '@google/genai'
import { buildSTATSIQSystemPrompt, STATSIQ_RESPONSE_SCHEMA } from '../lib/intelligence/modules/statsiq'
import { PositionAnalysisOutputSchema, type ModulePromptInput } from '../lib/intelligence/schemas'
import {
  buildPlayLocatorPrompt,
  PLAY_LOCATOR_SCHEMA,
  parseLocatedPlays,
  playWindow,
} from '../lib/intelligence/locate-play'
import {
  buildPlayVerificationPrompt,
  PLAY_VERIFICATION_SCHEMA,
  parseVerification,
  reconcileReadings,
} from '../lib/intelligence/stat-verify'
import { tallyStatPlays } from '../lib/intelligence/stat-lines'

const MODEL = 'gemini-2.5-pro'

const clipPath = process.argv[2]
const runs = Number(process.argv[3] ?? 1)
if (!clipPath) {
  console.error('usage: GOOGLE_API_KEY=... npx tsx scripts/eval-statsiq.ts <clip> [runs]')
  process.exit(1)
}

const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('GOOGLE_API_KEY is not set.')
  process.exit(1)
}

const client = new GoogleGenAI({ apiKey })
const bytes = readFileSync(clipPath)
const mimeType = clipPath.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'

/** The coach's context, matching what the module screen sends. */
const input: ModulePromptInput = {
  moduleKey: 'STATSIQ',
  teamId: 'eval',
  frames: [],
  team: {
    name: 'Eval Team',
    side_of_ball: 'offense',
    game_type: 'tackle',
    // Set EVAL_OFFENSE to measure what a coach's standing scheme note buys.
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

  const res = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: bytes.toString('base64') }, videoMetadata },
        ],
      },
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
  }
}

async function once(run: number) {
  console.log(`\n═══ RUN ${run} ═══`)

  // 1. Locate the football inside the film.
  const locator = await call(buildPlayLocatorPrompt(input), PLAY_LOCATOR_SCHEMA, {
    fps: 2,
    resolution: 'low',
  })
  const located = parseLocatedPlays(locator.text)
  console.log('located plays:', JSON.stringify(located))

  // Duration is read off the locator's own answer here; the app gets it from
  // the video row.
  const duration = Number(process.env.EVAL_CLIP_SECONDS ?? 31.68)
  const window = playWindow(located, duration)
  console.log('window:', window ? `${window.startOffsetSeconds}s – ${window.endOffsetSeconds}s` : 'whole clip')

  // 2. Chart it.
  const charting = await call(buildSTATSIQSystemPrompt(input), STATSIQ_RESPONSE_SCHEMA, {
    fps: 6,
    resolution: 'medium',
    start: window?.startOffsetSeconds,
    end: window?.endOffsetSeconds,
  })
  console.log(`charting input tokens: ${charting.inputTokens}`)

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(charting.text)
  } catch {
    console.log('✗ CHARTING RETURNED INVALID JSON:', charting.text.slice(0, 400))
    return
  }

  const parsed = PositionAnalysisOutputSchema.safeParse(parsedJson)
  if (!parsed.success) {
    // This is the failure that silently killed a production run: the analysis
    // costs the money, then throws before anything is saved.
    console.log('✗ SCHEMA REJECTED THE CHARTING OUTPUT')
    console.log(JSON.stringify(parsed.error.issues, null, 2).slice(0, 1200))
    return
  }

  const plays = parsed.data.stat_plays ?? []
  console.log(
    'charted:',
    plays.map((p) => `${p.play_type}/${p.result} ${p.yards ?? '?'}yd [${(p.credits ?? []).map((c) => `${c.stat}:${c.position}`).join(', ')}]`)
  )

  // 3. Verify.
  const verification = await call(buildPlayVerificationPrompt(input), PLAY_VERIFICATION_SCHEMA, {
    fps: 6,
    resolution: 'medium',
    start: window?.startOffsetSeconds,
    end: window?.endOffsetSeconds,
  })
  const verified = parseVerification(verification.text)
  console.log('verified:', JSON.stringify(verified))

  // 4. Reconcile and tally — the code a coach's sheet is actually built from.
  const reconciled = reconcileReadings(plays, verified)
  const tally = tallyStatPlays(reconciled.plays, { declaredSide: 'offense', allowUnverifiedNumbers: true })

  console.log('agreement:', reconciled.agreement)
  console.log('disputes:', reconciled.disputes)
  console.log(
    'SHEET →',
    `rush ${tally.team.offense.carries}/${tally.team.offense.rush_yards}yd`,
    `pass ${tally.team.offense.pass_completions}/${tally.team.offense.pass_attempts} ${tally.team.offense.pass_yards}yd`,
    `TD ${tally.team.offense.rush_td + tally.team.offense.pass_td}`,
    `pending ${tally.team.pendingQuestions}`
  )
}

/**
 * Sweep the reading settings against one clip.
 *
 * The regression that motivated this: the FIRST production run, at 6fps and
 * medium resolution over the whole clip, read the play almost correctly (a
 * rushing touchdown, wrong only about which back). Every change after it —
 * more prompt, more frames, more resolution, a narrower window — made the read
 * worse, ending at "intercepted pass". Which of those did the damage is a
 * measurable question, so measure it rather than argue about it.
 */
async function sweep() {
  const window = { start: 5.2, end: 23 }
  const configs: Array<{ label: string; fps: number; resolution: 'low' | 'medium' | 'high'; windowed: boolean }> = [
    { label: '8fps/high/window   (current)', fps: 8, resolution: 'high', windowed: true },
    { label: '6fps/medium/whole  (original)', fps: 6, resolution: 'medium', windowed: false },
    { label: '6fps/medium/window', fps: 6, resolution: 'medium', windowed: true },
    { label: '8fps/high/whole', fps: 8, resolution: 'high', windowed: false },
    { label: '2fps/low/window', fps: 2, resolution: 'low', windowed: true },
  ]

  for (const c of configs) {
    try {
      const res = await call(buildSTATSIQSystemPrompt(input), STATSIQ_RESPONSE_SCHEMA, {
        fps: c.fps,
        resolution: c.resolution,
        ...(c.windowed ? { start: window.start, end: window.end } : {}),
      })
      const parsed = PositionAnalysisOutputSchema.safeParse(JSON.parse(res.text))
      if (!parsed.success) {
        console.log(`${c.label}  →  SCHEMA REJECTED`)
        continue
      }
      const plays = parsed.data.stat_plays ?? []
      console.log(
        `${c.label}  →  ${plays
          .map(
            (p) =>
              `${p.play_type}/${p.result} ${p.yards ?? '?'}yd [${(p.credits ?? [])
                .map((x) => `${x.stat}:${x.position}`)
                .join(', ')}]`
          )
          .join(' | ')}  (${res.inputTokens} tok)`
      )
    } catch (err) {
      console.log(`${c.label}  →  THREW ${err instanceof Error ? err.message : err}`)
    }
  }
}

async function main() {
  if (process.env.EVAL_SWEEP) {
    await sweep()
    return
  }
  for (let i = 1; i <= runs; i++) {
    try {
      await once(i)
    } catch (err) {
      console.log('✗ RUN THREW:', err instanceof Error ? err.message : err)
    }
  }
}

main()
