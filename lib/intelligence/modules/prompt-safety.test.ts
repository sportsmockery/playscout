import { describe, it, expect } from 'vitest'
import { buildQBIQSystemPrompt } from './qbiq'
import { buildOLIQSystemPrompt } from './oliq'
import { buildRBIQSystemPrompt } from './rbiq'
import { buildTEAMIQSystemPrompt } from './teamiq'
import { buildMISTAKEIQSystemPrompt } from './mistakeiq'
import { buildSCOUTIQSystemPrompt } from './scoutiq'
import { buildRANKERIQSystemPrompt } from './rankeriq'
import { buildPlaybookIQPrompt } from './playbookiq'
import type { ModulePromptInput } from '../schemas'

const BUILDERS: Record<string, (input: ModulePromptInput) => string> = {
  QBIQ: buildQBIQSystemPrompt,
  OLIQ: buildOLIQSystemPrompt,
  RBIQ: buildRBIQSystemPrompt,
  TEAMIQ: buildTEAMIQSystemPrompt,
  MISTAKEIQ: buildMISTAKEIQSystemPrompt,
  SCOUTIQ: buildSCOUTIQSystemPrompt,
  RANKERIQ: buildRANKERIQSystemPrompt,
}

const input = (over: Partial<ModulePromptInput> = {}): ModulePromptInput => ({
  moduleKey: 'QBIQ',
  teamId: 't1',
  frames: [],
  ...over,
})

describe('the flag/tackle contact gate reaches every film module', () => {
  // RBIQ was the one module that never injected buildGameTypeContext, so it
  // recommended drills with no idea whether the team plays flag — and
  // football-brain's rule 14 had nothing concrete to gate on. safety.ts only
  // backstops *named* prohibited drills, not the contact class generally.
  it.each(Object.keys(BUILDERS))('%s states the game type when it is flag', (module) => {
    const prompt = BUILDERS[module](
      input({ moduleKey: module, team: { name: 'T', game_type: 'flag' } })
    )
    expect(prompt).toContain('GAME TYPE: Flag football')
    expect(prompt).toContain('no legal contact')
  })

  it.each(Object.keys(BUILDERS))('%s defaults to the safest assumption when unstated', (module) => {
    const prompt = BUILDERS[module](input({ moduleKey: module }))
    expect(prompt).toContain('GAME TYPE: Not specified')
  })
})

describe('level calibration reaches every module', () => {
  it.each(Object.keys(BUILDERS))('%s grades a varsity team against varsity standards', (module) => {
    const prompt = BUILDERS[module](
      input({ moduleKey: module, team: { name: 'T', age_group: 'Varsity', level: 'High School' } })
    )
    expect(prompt).toContain('COMPETITION LEVEL: high-school varsity')
    expect(prompt).not.toContain('COMPETITION LEVEL: youth (9U–10U)')
  })

  it('PlaybookIQ resolves a tier instead of using the neutral default', () => {
    // It was the only module calling the hardcoded 'unknown'-tier export,
    // despite having the age group in hand.
    const varsity = buildPlaybookIQPrompt({
      extractedText: 'Play 1: Power Right',
      ageGroup: 'Varsity',
      level: 'High School',
    })
    expect(varsity).toContain('COMPETITION LEVEL: high-school varsity')

    const youth = buildPlaybookIQPrompt({ extractedText: 'Play 1: Power Right', ageGroup: '10U' })
    expect(youth).toContain('COMPETITION LEVEL: youth (9U–10U)')
  })
})

describe('SCOUTIQ subject identification', () => {
  const base = { moduleKey: 'SCOUTIQ' as const, teamId: 't', frames: [], evidenceMode: 'video' as const }

  it('names the opponent colour as the subject when one is given', () => {
    const prompt = buildSCOUTIQSystemPrompt({
      ...base,
      team: { name: 'TP White', jersey_color: 'white' },
      opponent: { name: 'TP Blue', jersey_color: 'blue' },
    })
    expect(prompt).toContain('they wear blue')
    expect(prompt).toContain('ARE the opponent being scouted')
  })

  it('never defines the opponent by ruling out the coach’s colour', () => {
    // Scouting a future opponent off their game against a THIRD team is
    // normal. On TP Blue vs HW film scouted by TP White, "everyone who is not
    // white is the opponent" folds HW's defense into TP Blue's report.
    const prompt = buildSCOUTIQSystemPrompt({
      ...base,
      team: { name: 'TP White', jersey_color: 'white' },
      opponent: { name: 'TP Blue' },
    })
    expect(prompt).not.toMatch(/everyone else in the frame is the opponent/i)
    expect(prompt).toContain('may not contain the coach')
    expect(prompt).toMatch(/lower your confidence/i)
  })

  it('still refuses to guess when neither side has a colour', () => {
    const prompt = buildSCOUTIQSystemPrompt({ ...base, opponent: { name: 'TP Blue' } })
    expect(prompt).toMatch(/Do not guess/i)
  })

  it('does not grade the other side just because the stated colour is absent', () => {
    // A cut-up can contain a clip where that colour never takes the field.
    // Grading whoever IS there puts a third team's play in this report.
    const prompt = buildSCOUTIQSystemPrompt({
      ...base,
      opponent: { name: 'TP Blue', jersey_color: 'blue' },
    })
    expect(prompt).toMatch(/do NOT grade the other side/i)
    expect(prompt).toContain('subject_confirmed')
  })

  it('requires the model to report which side it graded and who had the ball', () => {
    // The prompt has always asked "say which side you graded"; until now there
    // was no field to answer in, so nothing downstream could check it.
    const prompt = buildSCOUTIQSystemPrompt({ ...base, opponent: { name: 'TP Blue' } })
    expect(prompt).toContain('subject_graded')
    expect(prompt).toContain('opponent_possession')
    expect(prompt).toMatch(/on DEFENSE/i)
  })
})

describe('SCOUTIQ writes for the coach scouting, not the team being scouted', () => {
  const base = { moduleKey: 'SCOUTIQ' as const, teamId: 't', frames: [], evidenceMode: 'video' as const }

  it('frames the three shared fields as adversarial, not as a report card', () => {
    // strengths/weaknesses/drills are required by the shared result envelope
    // and used to arrive with NO framing, so the model filled them the only
    // way they make sense alone — as a development plan for the opponent.
    // Reported from real use: "acted like it was my team, want strategy to
    // beat them not improve."
    const prompt = buildSCOUTIQSystemPrompt({ ...base, opponent: { name: 'TP Blue' } })

    expect(prompt).toMatch(/what TP Blue does WELL that we must plan around/i)
    expect(prompt).toMatch(/written so OUR coach can attack it/i)
    expect(prompt).toMatch(/drills\s+for the coach reading this report/i)
    expect(prompt).toMatch(/never drills for\s+TP Blue/i)
  })

  it('forbids recommending anything that helps the opponent', () => {
    const prompt = buildSCOUTIQSystemPrompt({ ...base, opponent: { name: 'TP Blue' } })
    expect(prompt).toMatch(/never recommend anything that would help TP Blue play better/i)
    expect(prompt).toMatch(/You are not\s+their coach/i)
  })
})

describe('MISTAKEIQ drills come from a catalog, not from the model', () => {
  const base = { moduleKey: 'MISTAKEIQ' as const, teamId: 't', frames: [], evidenceMode: 'video' as const }

  it('hands the model a closed menu of real defensive drills', () => {
    // Until the catalog had a defensive half, this prompt asked for "one
    // specific practice drill" with nothing behind it, so every drill a coach
    // read on a defensive clip was invented — which is what the catalog exists
    // to prevent everywhere else.
    const prompt = buildMISTAKEIQSystemPrompt({
      ...base,
      team: { name: 'TP White', age_group: '10U', game_type: 'tackle' },
    })
    expect(prompt).toContain('DRILL MENU')
    expect(prompt).toMatch(/do not invent a drill/i)
    expect(prompt).toContain('def_force_box')
    expect(prompt).toContain('drill_id')
  })

  it('never offers a flag team a contact drill', () => {
    // The menu is filtered before the prompt is built, so the unsafe option is
    // not on the page to be chosen.
    const prompt = buildMISTAKEIQSystemPrompt({
      ...base,
      team: { name: 'TP White', age_group: '10U', game_type: 'flag' },
    })
    expect(prompt).toContain('def_force_box')
    expect(prompt).not.toContain('def_angle_tackle')
    expect(prompt).not.toContain('def_step_and_shock')
  })
})
