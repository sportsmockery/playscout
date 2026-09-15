import { describe, it, expect } from 'vitest'
import { buildSTATSIQSystemPrompt, STATSIQ_RESPONSE_SCHEMA } from './statsiq'
import { STAT_KINDS } from '../stat-lines'
import { STAT_POSITIONS } from '../positions'
import type { ModulePromptInput } from '../schemas'

const input = (over: Partial<ModulePromptInput> = {}): ModulePromptInput => ({
  moduleKey: 'STATSIQ',
  teamId: 't1',
  frames: [],
  ...over,
})

describe('the charting order the coach asked for', () => {
  it('walks formation, then positions, then the play, then the credits', () => {
    const prompt = buildSTATSIQSystemPrompt(input())
    const formation = prompt.indexOf('STEP 1 — FORMATION')
    const positions = prompt.indexOf('STEP 2 — POSITIONS')
    const play = prompt.indexOf('STEP 3 — THE PLAY')
    const credits = prompt.indexOf('STEP 4 — CREDITS')
    expect(formation).toBeGreaterThan(-1)
    expect(positions).toBeGreaterThan(formation)
    expect(play).toBeGreaterThan(positions)
    expect(credits).toBeGreaterThan(play)
  })

  it('gives the closed position vocabulary and fixes what left and right mean', () => {
    const prompt = buildSTATSIQSystemPrompt(input({ team: { name: 'T' } }))
    expect(prompt).toContain('POSITION VOCABULARY')
    expect(prompt).toContain('wingback_left')
    expect(prompt).toContain('lb_middle')
    // A camera-relative left/right would flip between sideline and end-zone
    // angles of the same snap, and no two plays could then be added up.
    expect(prompt).toContain('Never from the camera')
  })
})

describe('yardage', () => {
  it('tells the model that "not determinable" is a correct answer', () => {
    const prompt = buildSTATSIQSystemPrompt(input())
    expect(prompt).toContain('not_determinable')
    expect(prompt).toContain('NORMAL answer')
  })

  it("uses the staff's tagged gain when the play carries one", () => {
    const prompt = buildSTATSIQSystemPrompt(
      input({ playSequence: { down: 2, distance: 6, gain_loss: 11 } })
    )
    expect(prompt).toContain('tagged it as 11 yards')
    expect(prompt).toContain('coach_breakdown')
  })
})

describe('identification', () => {
  it('tells the model no number can be verified when there is no roster', () => {
    const prompt = buildSTATSIQSystemPrompt(input({ roster: [] }))
    expect(prompt).toContain('NO ROSTER ON FILE')
  })

  it('gives the roster as a closed set, never as a lookup table', () => {
    const prompt = buildSTATSIQSystemPrompt(
      input({ roster: [{ jersey_number: '22', position: 'RB', name: 'C. Burhans' }] })
    )
    expect(prompt).toContain('the ONLY jersey numbers that exist')
    expect(prompt).toContain('NEVER assign a number because the roster says a player')
  })

  it('claims no numbers at all on scrimmage film', () => {
    const prompt = buildSTATSIQSystemPrompt(
      input({ roster: [{ jersey_number: '22' }], filmConditions: 'scrimmage' })
    )
    expect(prompt).toContain('SCRIMMAGE / PRACTICE FILM')
  })
})

describe('the model is not asked to keep the totals', () => {
  it('says so explicitly', () => {
    const prompt = buildSTATSIQSystemPrompt(input())
    expect(prompt).toContain('produce a total — report the credits and let the app count')
  })

  it('offers exactly the stat ids the tally knows how to count', () => {
    const stat = STATSIQ_RESPONSE_SCHEMA.properties.stat_plays.items.properties.credits.items
      .properties.stat as { enum: string[] }
    expect([...stat.enum].sort()).toEqual([...STAT_KINDS].sort())
  })

  it('offers exactly the positions the box score files credits under', () => {
    const position = STATSIQ_RESPONSE_SCHEMA.properties.stat_plays.items.properties.credits.items
      .properties.position as { enum: string[] }
    // 'unknown' is deliberately withheld — it is code's fallback, not an
    // answer the model gets to choose.
    expect([...position.enum].sort()).toEqual([...STAT_POSITIONS].sort())
    expect(position.enum).not.toContain('unknown')
  })
})
