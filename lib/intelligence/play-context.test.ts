import { describe, it, expect } from 'vitest'
import { buildPlayContext } from './play-context'
import { buildQBIQSystemPrompt } from './modules/qbiq'
import { buildOLIQSystemPrompt } from './modules/oliq'
import { buildRBIQSystemPrompt } from './modules/rbiq'
import { buildTEAMIQSystemPrompt } from './modules/teamiq'
import { buildMISTAKEIQSystemPrompt } from './modules/mistakeiq'
import { buildSCOUTIQSystemPrompt } from './modules/scoutiq'
import { buildRANKERIQSystemPrompt } from './modules/rankeriq'
import { mapHudlRow, toPlaySequenceFields } from '../import/hudl-breakdown'
import type { ModulePromptInput } from './schemas'

const BUILDERS: Record<string, (i: ModulePromptInput) => string> = {
  QBIQ: buildQBIQSystemPrompt,
  OLIQ: buildOLIQSystemPrompt,
  RBIQ: buildRBIQSystemPrompt,
  TEAMIQ: buildTEAMIQSystemPrompt,
  MISTAKEIQ: buildMISTAKEIQSystemPrompt,
  SCOUTIQ: buildSCOUTIQSystemPrompt,
  RANKERIQ: buildRANKERIQSystemPrompt,
}

const play = {
  down: 3,
  distance: 2,
  hash: 'L' as const,
  offensive_formation: 'Tight Double Wing',
  play_name: 'Power Right',
  play_direction: 'Right',
  gain_loss: 14,
  odk: 'O' as const,
}

describe('buildPlayContext', () => {
  it('reads the way a coach would say it', () => {
    expect(buildPlayContext(play)).toContain(
      '3rd & 2 · left hash · offense in Tight Double Wing · play called "Power Right" · to the Right · gained 14 yards'
    )
  })

  it('tells the model this is recorded fact, not something to re-derive', () => {
    const text = buildPlayContext(play)
    expect(text).toContain('recorded by the coaching staff')
    // It must still be allowed to disagree out loud — silently overriding the
    // staff's tag would be worse than either.
    expect(text).toContain('say so explicitly')
  })

  it('states only what was recorded', () => {
    // A blank column must not become "unknown": the model would reason about
    // our gap rather than about the film.
    const text = buildPlayContext({ down: 1, distance: 10 })
    expect(text).toContain('1st & 10')
    expect(text).not.toContain('unknown')
    expect(text).not.toContain('undefined')
  })

  it('renders nothing at all when there is nothing recorded', () => {
    expect(buildPlayContext(undefined)).toBe('')
    expect(buildPlayContext({})).toBe('')
  })

  it('names the unit on the field', () => {
    expect(buildPlayContext({ odk: 'D', down: 2 })).toContain('Unit on the field: defense')
  })
})

describe('every module receives the breakdown', () => {
  // Each module used to build its own play context: QBIQ and RBIQ rendered
  // down and distance, OLIQ rendered only the coach's label, and the four team
  // modules rendered nothing — so the same clip told different modules
  // different amounts about the situation it was in.
  it.each(Object.keys(BUILDERS))('%s states the down, formation and call', (module) => {
    const prompt = BUILDERS[module]({
      moduleKey: module,
      teamId: 't1',
      frames: [],
      playSequence: play,
    })

    expect(prompt).toContain('3rd & 2')
    expect(prompt).toContain('Tight Double Wing')
    expect(prompt).toContain('Power Right')
  })

  it('carries a real Hudl row end to end', () => {
    const stored = toPlaySequenceFields(
      mapHudlRow(
        { DN: '3', DIST: '2', HASH: 'L', 'OFF FORM': 'Tight Double Wing', 'OFF PLAY': 'Power Right' },
        0
      )
    )
    const prompt = buildQBIQSystemPrompt({
      moduleKey: 'QBIQ',
      teamId: 't1',
      frames: [],
      playSequence: stored as ModulePromptInput['playSequence'],
    })

    expect(prompt).toContain('3rd & 2')
    expect(prompt).toContain('offense in Tight Double Wing')
  })
})
