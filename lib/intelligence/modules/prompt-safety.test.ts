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
