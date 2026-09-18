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
  it('tells the model the field is marked and to measure off it', () => {
    // The prompt used to open this section with "film with no yard-line graphic
    // and often no legible field markings" and call not_determinable the NORMAL
    // answer. Youth games are played on lined fields, the stripes are plainly
    // visible on sideline film, and the model obeyed the false premise: it
    // charted a 55-yard touchdown with no yardage and echoed the wording back
    // ("outside of any visible field markings"). The whole rushing column read
    // zero over a gain the coach could see with his own eyes.
    const prompt = buildSTATSIQSystemPrompt(input())
    expect(prompt).toContain('MARKED football field')
    expect(prompt).toContain('THIS IS THE EXPECTED ANSWER')
    expect(prompt).not.toContain('no legible field markings')
    // And the camera following the play is not a reason to abstain.
    expect(prompt).toContain('The lines pan with it')
  })

  it('keeps "not determinable" available for film with nothing to measure against', () => {
    const prompt = buildSTATSIQSystemPrompt(input())
    expect(prompt).toContain('not_determinable')
    expect(prompt).toContain('unlined practice')
  })

  it("uses the staff's tagged gain when the play carries one", () => {
    const prompt = buildSTATSIQSystemPrompt(
      input({ playSequence: { down: 2, distance: 6, gain_loss: 11 } })
    )
    expect(prompt).toContain('tagged it as 11 yards')
    expect(prompt).toContain('coach_breakdown')
  })
})

describe('who carried the ball', () => {
  // Observed on the first real chart: a 55-yard quarterback touchdown run was
  // credited to "Running Back". The old prompt only said a handoff is NOT the
  // quarterback's carry, which is a one-way bias toward crediting a back.
  it('makes the mesh point the test, not the formation', () => {
    const prompt = buildSTATSIQSystemPrompt(input())
    expect(prompt).toContain('DID THE BALL CHANGE HANDS AFTER THE SNAP?')
    expect(prompt).toContain('A quarterback keeper, a designed quarterback run, a sneak')
    expect(prompt).toContain('scramble')
    expect(prompt).toContain('no back gets a carry')
  })

  it('warns against crediting the back the model expects to carry it', () => {
    const prompt = buildSTATSIQSystemPrompt(input())
    expect(prompt).toContain('who you EXPECT to carry the ball')
    expect(prompt).toContain('the quarterback lines up there too')
  })
})

describe('standing team context', () => {
  it("carries the team's scheme into every chart", () => {
    const prompt = buildSTATSIQSystemPrompt(
      input({ team: { name: 'T', offensive_style: 'Tight double wing, QB keeps on power' } })
    )
    expect(prompt).toContain('OUR OFFENSE: Tight double wing, QB keeps on power')
  })

  it('says the film outranks the scheme', () => {
    const prompt = buildSTATSIQSystemPrompt(input({ team: { name: 'T', offensive_style: 'Double wing' } }))
    expect(prompt).toContain('never to decide who ended up with it')
  })

  it('states nothing when the team has recorded no scheme', () => {
    const prompt = buildSTATSIQSystemPrompt(input({ team: { name: 'T' } }))
    expect(prompt).not.toContain('OUR OFFENSE:')
  })
})

describe('penalties', () => {
  it('asks for the flag, and for the two facts that decide whether it counts', () => {
    const prompt = buildSTATSIQSystemPrompt(input())
    expect(prompt).toContain('penalty_enforcement')
    expect(prompt).toContain('penalty_timing')
    expect(prompt).toContain('dead_ball')
  })

  it('tells the model to chart the play anyway and let the app apply the rule', () => {
    const prompt = buildSTATSIQSystemPrompt(input())
    expect(prompt).toContain('Still chart the play')
    expect(prompt).toContain('let the app')
  })

  it('offers the penalty types the tally can file', () => {
    const credit = STATSIQ_RESPONSE_SCHEMA.properties.stat_plays.items.properties.credits.items
      .properties.penalty_type as { enum: string[] }
    expect(credit.enum).toContain('holding')
    expect(credit.enum).toContain('pass_interference')
    expect(credit.enum).toContain('false_start')
  })
})

describe('identification', () => {
  it('asks for the number whenever the film can be read, not only with a roster', () => {
    // The coach's rule: number if the tracker can see it, position if not.
    const prompt = buildSTATSIQSystemPrompt(input({ roster: [] }))
    expect(prompt).toContain('NO ROSTER ON FILE')
    expect(prompt).toContain('Report a number ONLY where you can point to the frame')
    // The old instruction — null every number without a roster — must not
    // survive here; that is RankerIQ's rule, and it emptied this sheet.
    expect(prompt).not.toContain('Set jersey_number to null for EVERY player and identify')
  })

  it('keeps the frame-cited bar as the thing that separates read from invented', () => {
    const prompt = buildSTATSIQSystemPrompt(input())
    expect(prompt).toContain('jersey_number_frame')
    expect(prompt).toContain('No frame means you did not read it')
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
