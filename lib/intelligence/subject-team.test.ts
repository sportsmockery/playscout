import { describe, it, expect } from 'vitest'
import { buildSubjectTeamContext } from './subject-team'
import { buildQBIQSystemPrompt } from './modules/qbiq'
import { buildOLIQSystemPrompt } from './modules/oliq'
import { buildRBIQSystemPrompt } from './modules/rbiq'
import type { ModulePromptInput } from './schemas'

describe('naming which team is ours', () => {
  it('names the colour and forbids grading the other side', () => {
    const text = buildSubjectTeamContext({ name: 'Carter Andrew', jersey_color: 'Blue' }, 'the quarterback')
    expect(text).toContain('Carter Andrew')
    expect(text).toContain('they wear Blue')
    expect(text).toContain('Grade ONLY the quarterback wearing that')
    expect(text).toContain('must not be graded')
  })

  it('falls back to reading it off the play rather than guessing', () => {
    const text = buildSubjectTeamContext({ name: 'Carter Andrew' }, 'the quarterback')
    expect(text).toContain('no jersey or helmet colour was given')
    expect(text).toContain("ball carrier's blockers")
    expect(text).toContain('lower your confidence')
  })

  it('survives a team row with nothing on it', () => {
    expect(buildSubjectTeamContext(null, 'players')).toContain('this team')
  })
})

describe('the modules that grade one named child all say it', () => {
  // The gap this closes: QBIQ, OLIQ and RBIQ hand the model a name, a position
  // and a jersey number, then say "grade the quarterback visible in the clip".
  // On two-team film there are two quarterbacks, and the failure is silent —
  // a fluent report about somebody else's kid, filed under yours.
  const input = (jersey?: string): ModulePromptInput =>
    ({
      moduleKey: 'QBIQ',
      teamId: 't',
      frames: [],
      team: { name: 'Carter Andrew', game_type: 'tackle', level: 'High School', jersey_color: jersey },
      player: { name: 'A Player', position: 'QB' },
      evidenceMode: 'video',
    }) as ModulePromptInput

  const builders: [string, (i: ModulePromptInput) => string][] = [
    ['QBIQ', buildQBIQSystemPrompt],
    ['OLIQ', buildOLIQSystemPrompt],
    ['RBIQ', buildRBIQSystemPrompt],
  ]

  for (const [name, build] of builders) {
    it(`${name} names the colour when the coach set one`, () => {
      expect(build(input('Blue'))).toContain('they wear Blue')
    })

    it(`${name} says how to work it out when the coach did not`, () => {
      const prompt = build(input(undefined))
      expect(prompt).toContain('no jersey or helmet colour was given')
      expect(prompt).toContain('lower your confidence')
    })
  }
})
