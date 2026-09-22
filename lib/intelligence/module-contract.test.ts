import { describe, it, expect } from 'vitest'
import { MODULE_MAP } from './analyze-position'
import { PositionAnalysisOutputSchema } from './schemas'
import { STATSIQ_FACTS_RESPONSE_SCHEMA } from './modules/statsiq-facts'
import { factsOutputToAnalysisOutput } from './stat-facts'

/**
 * Every module's Gemini response schema must promise a shape the result schema
 * accepts.
 *
 * TEAMIQ failed this for an unknown length of time and nothing caught it. When
 * `attack_points` became `{point, category}` objects for SCOUTIQ's rollup,
 * TEAMIQ's emitter was left declaring an array of bare STRINGS — and since
 * `attack_points` sits in TEAMIQ's required list, the model returned strings on
 * every single run. `PositionAnalysisOutputSchema` then rejected all of them and
 * `analyze-position` threw "Malformed TEAMIQ output", AFTER paying for the
 * whole Gemini video call. The module was dead in production. No unit test
 * covered it because the two schemas are declared in different files in
 * different notations, and nothing had ever compared them.
 *
 * This is that comparison. It builds a synthetic response from each module's own
 * Gemini schema — every declared property, filled with a value that schema says
 * is legal — and requires the result schema to accept it. It needs no API key,
 * no film and no model, so it runs on every commit; a mismatch like the above
 * fails here in milliseconds instead of in a coach's browser after a paid call.
 */

type GeminiSchema = {
  type?: unknown
  properties?: Record<string, GeminiSchema>
  items?: GeminiSchema
  enum?: string[]
  nullable?: boolean
}

/** The @google/genai Type enum is a plain string union at runtime. */
function typeName(node: GeminiSchema): string {
  return String(node.type ?? '').toLowerCase()
}

/**
 * A value this schema node declares to be legal. Fills EVERY property, not only
 * the required ones — an optional field with the wrong type is the same bug,
 * it just takes longer to show up.
 */
function sample(node: GeminiSchema, depth = 0): unknown {
  if (depth > 8) return null
  switch (typeName(node)) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(node.properties ?? {})) {
        out[key] = sample(child, depth + 1)
      }
      return out
    }
    case 'array':
      return node.items ? [sample(node.items, depth + 1)] : []
    case 'string':
      return node.enum?.length ? node.enum[0] : 'x'
    case 'integer':
    case 'number':
      return 1
    case 'boolean':
      return true
    default:
      return 'x'
  }
}

describe('every module promises a shape the result schema accepts', () => {
  for (const [moduleKey, config] of Object.entries(MODULE_MAP)) {
    it(`${moduleKey}`, () => {
      const response = sample(config.schema as GeminiSchema)
      const parsed = PositionAnalysisOutputSchema.safeParse(response)

      if (!parsed.success) {
        // Name the field, both shapes, and which file to fix — the failure this
        // test exists for took a model run and a stack trace to diagnose.
        const detail = parsed.error.issues
          .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('\n')
        throw new Error(
          `${moduleKey}'s Gemini response schema declares a shape PositionAnalysisOutputSchema rejects.\n` +
            `Fix the emitter in lib/intelligence/modules/${moduleKey.toLowerCase()}.ts, or the contract in schemas.ts:\n${detail}`
        )
      }
      expect(parsed.success).toBe(true)
    })
  }

  // The closed-question charting path does not go straight into the result
  // schema — its answers are assembled into credits first — so the contract it
  // has to satisfy is "schema, then conversion, then the result schema". Same
  // failure mode as TEAMIQ's, one step further along the pipe.
  it('STATSIQ (closed-question charting)', () => {
    const response = sample(STATSIQ_FACTS_RESPONSE_SCHEMA as GeminiSchema)
    const parsed = PositionAnalysisOutputSchema.safeParse(factsOutputToAnalysisOutput(response))

    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n')
      throw new Error(
        `The facts charting schema, once converted, is a shape PositionAnalysisOutputSchema rejects.\n` +
          `Fix modules/statsiq-facts.ts or the conversion in stat-facts.ts:\n${detail}`
      )
    }
    expect(parsed.success).toBe(true)
  })

  /**
   * Accepting a response is not the same as KEEPING it.
   *
   * `z.object` strips unknown keys rather than rejecting them, so a module can
   * declare a field, the model can answer it perfectly, and the answer can be
   * deleted between the API response and the report with every test above
   * still green. The loop tests that the parse SUCCEEDS; this tests that the
   * evidence survives it.
   */
  const EVIDENCE_FIELDS: Record<string, string[]> = {
    SCOUTIQ: [
      'offensive_tendencies',
      'defensive_tendencies',
      'situational_tells',
      'attack_points',
      'target_players',
      'defensive_snaps',
    ],
    STATSIQ: ['stat_plays'],
    RANKERIQ: ['player_grades'],
    MISTAKEIQ: ['mistakes'],
  }

  for (const [moduleKey, fields] of Object.entries(EVIDENCE_FIELDS)) {
    it(`${moduleKey} keeps the evidence it asked for`, () => {
      const config = MODULE_MAP[moduleKey]
      const response = sample(config.schema as GeminiSchema) as Record<string, unknown>
      const parsed = PositionAnalysisOutputSchema.parse(response) as Record<string, unknown>

      for (const field of fields) {
        expect(
          response[field],
          `${moduleKey}'s Gemini schema no longer declares ${field} — the emitter changed, not this test.`
        ).toBeDefined()
        expect(
          parsed[field],
          `${moduleKey} asks the model for ${field} and PositionAnalysisOutputSchema throws the answer away. Add it to schemas.ts.`
        ).toBeDefined()
      }
    })
  }

  it('covers every module that can be analyzed, so none can be added untested', () => {
    // A module added to MODULE_MAP is automatically covered by the loop above;
    // this guards against MODULE_MAP itself being emptied or renamed away.
    expect(Object.keys(MODULE_MAP).length).toBeGreaterThanOrEqual(8)
  })
})
