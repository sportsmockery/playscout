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
import {
  buildSTATSIQFactsPrompt,
  STATSIQ_FACTS_RESPONSE_SCHEMA,
} from '../lib/intelligence/modules/statsiq-facts'
import { factsOutputToAnalysisOutput } from '../lib/intelligence/stat-facts'
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
  flagMeshPointCarries,
  schemeHasQbMesh,
} from '../lib/intelligence/stat-verify'
import { tallyStatPlays } from '../lib/intelligence/stat-lines'

const MODEL = 'gemini-2.5-pro'

const clipPath = process.argv[2]
const runs = Number(process.argv[3] ?? 1)

/**
 * Which charting prompt is under test: `narrative` (the shipped default) or
 * `facts` (the closed-question rebuild). Everything downstream of the charting
 * call is identical, so a difference in the scorecard is a difference in the
 * ask and nothing else.
 *
 * Recorded baseline for `narrative`, 4 runs per clip:
 *   clip A (4th-down pass, right WR) — play 4/4, TD 4/4, player withheld 4/4
 *   clip B (55yd QB keeper TD)       — play 4/4, TD 4/4, yards 4/4, carrier withheld 4/4
 * Nothing measured is wrong on either; the gap is that neither names the player.
 * `facts` replaces the default only if it beats that on BOTH clips.
 */
const CHARTING = process.env.EVAL_CHARTING === 'facts' ? 'facts' : 'narrative'
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
    // Which team is ours. Measured to matter enormously: with no colour, the
    // charting prompt falls to its "work out which side is ours from the play"
    // branch, and on a deep ball caught among defenders it called a completion
    // an INTERCEPTION on two runs out of three.
    jersey_color: process.env.EVAL_JERSEY || undefined,
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

/**
 * What the coach says actually happened, so a run can be SCORED rather than
 * eyeballed.
 *
 * Reading run lines by hand is how two wrong "fixes" got shipped earlier in
 * this module's history: a change looks better because the one line you happen
 * to read looks better. A per-dimension pass/fail over N runs is the only thing
 * that can say whether a prompt change helped, and it is the difference between
 * "seems right" and "4 of 4".
 *
 *   EVAL_TRUTH_PLAY=run|pass     EVAL_TRUTH_PLAYER=qb
 *   EVAL_TRUTH_TD=1|0            EVAL_TRUTH_YARDS=55
 *
 * Every field is optional — a dimension with no declared truth is not scored,
 * because inventing a expected value is worse than measuring one thing fewer.
 */
interface Truth {
  play?: 'run' | 'pass'
  /** The principal actor: the carrier on a run, the receiver on a pass. */
  player?: string
  touchdown?: boolean
  yards?: number
}

const truth: Truth = {
  play: (process.env.EVAL_TRUTH_PLAY as 'run' | 'pass' | undefined) || undefined,
  player: process.env.EVAL_TRUTH_PLAYER || undefined,
  touchdown: process.env.EVAL_TRUTH_TD ? process.env.EVAL_TRUTH_TD === '1' : undefined,
  yards: process.env.EVAL_TRUTH_YARDS ? Number(process.env.EVAL_TRUTH_YARDS) : undefined,
}

type Mark = 'pass' | 'fail' | 'withheld' | 'n/a'
interface Scorecard {
  play: Mark
  player: Mark
  touchdown: Mark
  yards: Mark
}

const scorecards: Scorecard[] = []

/** Yardage is right if it lands inside the same tolerance the pipeline uses. */
function yardsMark(counted: number, unmeasured: number, expected?: number): Mark {
  if (expected == null) return 'n/a'
  // Withheld is not wrong — it is the module declining to guess, which is a
  // different outcome from a wrong number and has to be counted separately or
  // "never answer" would score as well as "always right".
  if (unmeasured > 0 && counted === 0) return 'withheld'
  const tolerance = Math.max(3, Math.abs(expected) * 0.12)
  return Math.abs(counted - expected) <= tolerance ? 'pass' : 'fail'
}

function score(tally: ReturnType<typeof tallyStatPlays>): Scorecard {
  const o = tally.team.offense
  const chartedPlay = o.carries > 0 ? 'run' : o.pass_attempts > 0 ? 'pass' : null

  // The principal actor as the SHEET has it — a line with the carry or the
  // catch. An unattributed credit has no line, which is a real answer ("we
  // know what, not who") and scores as withheld rather than wrong.
  const principal =
    tally.lines.find((l) => l.offense.carries > 0 || l.offense.receptions > 0)?.positionId ?? null

  return {
    play: truth.play == null ? 'n/a' : chartedPlay == null ? 'withheld' : chartedPlay === truth.play ? 'pass' : 'fail',
    player:
      truth.player == null
        ? 'n/a'
        : principal == null
          ? 'withheld'
          : principal === truth.player
            ? 'pass'
            : 'fail',
    touchdown:
      truth.touchdown == null
        ? 'n/a'
        : o.rush_td + o.pass_td + o.receiving_td > 0 === truth.touchdown
          ? 'pass'
          : 'fail',
    yards: yardsMark(
      o.rush_yards + o.pass_yards,
      tally.team.unmeasuredYardagePlays ?? 0,
      truth.yards
    ),
  }
}

const MARK_ICON: Record<Mark, string> = { pass: '✓', fail: '✗', withheld: '·', 'n/a': ' ' }

function printScorecard() {
  if (!scorecards.length) return
  const dims: (keyof Scorecard)[] = ['play', 'player', 'touchdown', 'yards']
  console.log(`\n══════════ SCORECARD — ${CHARTING} charting ══════════`)
  console.log('            ' + scorecards.map((_, i) => `r${i + 1}`).join('  '))
  for (const d of dims) {
    const marks = scorecards.map((c) => ` ${MARK_ICON[c[d]]}`)
    const hits = scorecards.filter((c) => c[d] === 'pass').length
    const scored = scorecards.filter((c) => c[d] !== 'n/a').length
    console.log(
      `${d.padEnd(11)} ${marks.join('  ')}   ${scored ? `${hits}/${scored}` : '— not declared'}`
    )
  }
  console.log('\n  ✓ right   ✗ wrong   · withheld (declined to answer, not wrong)')
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

  // 2. Chart it — with whichever charting prompt is under test.
  //
  // The two paths converge on stat_plays, so everything after this point is
  // byte-identical between them and the only variable measured is the ask.
  const charting = await call(
    CHARTING === 'facts' ? buildSTATSIQFactsPrompt(input) : buildSTATSIQSystemPrompt(input),
    CHARTING === 'facts' ? STATSIQ_FACTS_RESPONSE_SCHEMA : STATSIQ_RESPONSE_SCHEMA,
    {
      fps: 6,
      resolution: 'medium',
      start: window?.startOffsetSeconds,
      end: window?.endOffsetSeconds,
    }
  )
  console.log(`charting (${CHARTING}) input tokens: ${charting.inputTokens}`)

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(charting.text)
  } catch {
    console.log('✗ CHARTING RETURNED INVALID JSON:', charting.text.slice(0, 400))
    return
  }
  if (CHARTING === 'facts') parsedJson = factsOutputToAnalysisOutput(parsedJson)

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

  // 4. Reconcile, park what corroboration cannot settle, and tally — the exact
  //    code a coach's sheet is built from.
  const reconciled = reconcileReadings(plays, verified)
  const meshScheme = schemeHasQbMesh(input.team?.offensive_style)
  const settled = flagMeshPointCarries(reconciled.plays, { qbMeshScheme: meshScheme })
  const tally = tallyStatPlays(settled, { declaredSide: 'offense', allowUnverifiedNumbers: true })

  console.log('agreement:', reconciled.agreement)
  console.log('disputes:', reconciled.disputes)
  console.log('mesh scheme:', meshScheme)
  console.log(
    'SHEET →',
    `rush ${tally.team.offense.carries}/${tally.team.offense.rush_yards}yd`,
    `pass ${tally.team.offense.pass_completions}/${tally.team.offense.pass_attempts} ${tally.team.offense.pass_yards}yd`,
    `TD ${tally.team.offense.rush_td + tally.team.offense.pass_td}`,
    `pending ${tally.team.pendingQuestions}`
  )
  // What the model charted BEFORE the mesh question parked it — the accuracy
  // figure to track. The gate makes a wrong carrier harmless; it does not make
  // the read right, and only this line says whether the read improved.
  const card = score(tally)
  scorecards.push(card)
  console.log(
    'SCORE →',
    `play ${MARK_ICON[card.play]}  player ${MARK_ICON[card.player]}  td ${MARK_ICON[card.touchdown]}  yards ${MARK_ICON[card.yards]}`
  )
  console.log(
    'carrier as charted:',
    (reconciled.plays[0]?.credits ?? [])
      .filter((c) => c.stat === 'rush')
      .map((c) => c.position)
      .join(', ') || 'none'
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
  printScorecard()
}

main()
