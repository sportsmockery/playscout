/**
 * Measures the defensive-structure read against clips whose truth a coach gave
 * us. Run:
 *
 *   GOOGLE_API_KEY=... \
 *   EVAL_OPPONENT=Bradley EVAL_OPPONENT_JERSEY='Red and white' \
 *   EVAL_TRUTH_SHELL=zero_high,one_high \
 *   EVAL_TRUTH_COVERAGE=cover_0,cover_1 \
 *   npx tsx scripts/eval-defense.ts <clip.mp4> [runs]
 *
 * WHY THE TRUTH IS A SET. The coach's ground truth for the first possessions of
 * this game is "a mixture of Cover 0 and Cover 1" — which is a real, checkable
 * fact even though it does not name one answer per snap. Scoring it as a set
 * asks the question that actually matters at this stage: does the module land
 * inside the family the defence was playing, or does it report Cover 2 on a
 * defence that played man all night? A read of cover_3 is wrong against that
 * truth, and a read of cover_0 is right, and that distinction is worth more
 * than a per-snap label nobody has time to produce for 76 clips.
 *
 * A single value works too — EVAL_TRUTH_SHELL=one_high scores exactly as the
 * StatsIQ harness does.
 *
 * WITHHELD IS TRACKED APART FROM WRONG, for the reason it always is here: if
 * they scored alike, never answering would look as good as always being right.
 */
import { readFileSync } from 'node:fs'
import { GoogleGenAI, MediaResolution } from '@google/genai'
import { buildSCOUTIQSystemPrompt, SCOUTIQ_RESPONSE_SCHEMA } from '../lib/intelligence/modules/scoutiq'
import { PositionAnalysisOutputSchema, type ModulePromptInput } from '../lib/intelligence/schemas'
import { normalizeDefensiveSnap } from '../lib/intelligence/defense-structure'
import { aggregateDefensiveSnaps } from '../lib/intelligence/aggregate-defense'
import { renderDefensiveProfile } from '../lib/intelligence/game-plan'

const MODEL = 'gemini-2.5-pro'
const clipPath = process.argv[2]
const runs = Number(process.argv[3] ?? 1)

if (!clipPath) {
  console.error('usage: GOOGLE_API_KEY=... npx tsx scripts/eval-defense.ts <clip> [runs]')
  process.exit(1)
}
const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('GOOGLE_API_KEY is not set.')
  process.exit(1)
}

const list = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const truth = {
  shell: list(process.env.EVAL_TRUTH_SHELL),
  coverage: list(process.env.EVAL_TRUTH_COVERAGE),
  rotation: list(process.env.EVAL_TRUTH_ROTATION),
}

/** The abstentions — answering one of these is withheld, not wrong. */
const ABSTENTIONS = new Set(['not_visible', 'not_determinable'])

type Mark = 'pass' | 'fail' | 'withheld' | 'n/a'
const ICON: Record<Mark, string> = { pass: '✓', fail: '✗', withheld: '·', 'n/a': ' ' }

function mark(answer: string | null | undefined, expected: string[]): Mark {
  if (!expected.length) return 'n/a'
  if (!answer || ABSTENTIONS.has(answer)) return 'withheld'
  return expected.includes(answer) ? 'pass' : 'fail'
}

const client = new GoogleGenAI({ apiKey })
const bytes = readFileSync(clipPath)
const mimeType = clipPath.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'

const input: ModulePromptInput = {
  moduleKey: 'SCOUTIQ',
  teamId: 'eval',
  frames: [],
  team: {
    name: process.env.EVAL_TEAM || 'Our team',
    game_type: 'tackle',
    level: 'High School',
    jersey_color: process.env.EVAL_JERSEY || undefined,
  },
  opponent: {
    name: process.env.EVAL_OPPONENT || 'the opponent',
    jersey_color: process.env.EVAL_OPPONENT_JERSEY || undefined,
  },
  evidenceMode: 'video',
} as ModulePromptInput

const cards: { shell: Mark; coverage: Mark; rotation: Mark }[] = []

async function once(run: number) {
  console.log(`\n═══ RUN ${run} ═══`)
  const result = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: bytes.toString('base64') } },
          { text: buildSCOUTIQSystemPrompt(input) },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: SCOUTIQ_RESPONSE_SCHEMA,
      // SCOUTIQ's measured production setting. The harness must drive what
      // ships, or it measures a configuration nobody runs.
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
    },
  })

  const text = result.text ?? ''
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch {
    console.log('✗ INVALID JSON:', text.slice(0, 300))
    return
  }
  const parsed = PositionAnalysisOutputSchema.safeParse(parsedJson)
  if (!parsed.success) {
    console.log('✗ SCHEMA REJECTED:', JSON.stringify(parsed.error.issues).slice(0, 600))
    return
  }

  const possession = parsed.data.opponent_possession
  console.log('opponent possession:', possession)
  if (possession !== 'defense' && possession !== 'both') {
    // Not a failure of the coverage read — the clip simply does not show them
    // defending, and charting one anyway is the bug this guard exists for.
    console.log('· they were not on defense in this clip; nothing to score.')
    return
  }

  const snaps = (parsed.data.defensive_snaps ?? []).map((s) =>
    normalizeDefensiveSnap(s as Record<string, unknown>)
  )
  if (!snaps.length) {
    console.log('· no defensive snap charted.')
    cards.push({ shell: 'withheld', coverage: 'withheld', rotation: 'withheld' })
    return
  }

  const snap = snaps[0]
  console.log(
    'charted:',
    `shell=${snap.presnap_shell} coverage=${snap.coverage_played} rotation=${snap.safety_rotation}`,
    `strength=${snap.strength_declared} hash=${snap.ball_position} pressure=${snap.pressure_look}`
  )
  if (snap.presnap_tells?.length) {
    console.log('tells:', snap.presnap_tells.map((t) => `${t.kind}: ${t.observation}`).join(' | '))
  }
  console.log(renderDefensiveProfile(aggregateDefensiveSnaps(snaps)))

  const card = {
    shell: mark(snap.presnap_shell, truth.shell),
    coverage: mark(snap.coverage_played, truth.coverage),
    rotation: mark(snap.safety_rotation, truth.rotation),
  }
  cards.push(card)
  console.log(
    'SCORE →',
    `shell ${ICON[card.shell]}  coverage ${ICON[card.coverage]}  rotation ${ICON[card.rotation]}`
  )
}

function printScorecard() {
  if (!cards.length) return
  console.log('\n══════════ DEFENSIVE STRUCTURE ══════════')
  if (truth.shell.length) console.log(`truth shell:    one of ${truth.shell.join(', ')}`)
  if (truth.coverage.length) console.log(`truth coverage: one of ${truth.coverage.join(', ')}`)
  console.log('            ' + cards.map((_, i) => `r${i + 1}`).join('  '))
  for (const dim of ['shell', 'coverage', 'rotation'] as const) {
    const marks = cards.map((c) => ` ${ICON[c[dim]]}`)
    const hits = cards.filter((c) => c[dim] === 'pass').length
    const wrong = cards.filter((c) => c[dim] === 'fail').length
    const scored = cards.filter((c) => c[dim] !== 'n/a').length
    console.log(
      `${dim.padEnd(10)} ${marks.join('  ')}   ${scored ? `${hits}/${scored}${wrong ? ` (${wrong} wrong)` : ''}` : '— not declared'}`
    )
  }
  console.log('\n  ✓ inside the truth set   ✗ outside it   · withheld (declined, not wrong)')
}

async function main() {
  for (let i = 1; i <= runs; i += 1) {
    try {
      await once(i)
    } catch (err) {
      console.log(`✗ RUN THREW: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  printScorecard()
}

main()
