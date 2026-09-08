import { describe, it, expect } from 'vitest'
import {
  isOwnTeamModule,
  isMisdirectedRun,
  subjectNameFor,
  OWN_FILM,
  type FilmSubject,
} from './film-subject'

const OPPONENT_FILM: FilmSubject = { filmType: 'opponent', opponentName: 'TP Blue' }
const UNNAMED_OPPONENT: FilmSubject = { filmType: 'opponent', opponentName: null }

describe('isOwnTeamModule', () => {
  it('covers every module whose subject is the coach s own team', () => {
    for (const key of ['QBIQ', 'OLIQ', 'RBIQ', 'TEAMIQ', 'MISTAKEIQ', 'RANKERIQ']) {
      expect(isOwnTeamModule(key)).toBe(true)
    }
  })

  it('leaves SCOUTIQ out — it is the one module that scouts somebody else', () => {
    expect(isOwnTeamModule('SCOUTIQ')).toBe(false)
  })
})

describe('isMisdirectedRun', () => {
  it('flags an own-team module pointed at opponent film', () => {
    // The real case: a RANKERIQ batch over TP Blue vs HW, run by TP White.
    // It graded TP Blue and filed the grades under TP White's roster.
    expect(isMisdirectedRun('RANKERIQ', OPPONENT_FILM)).toBe(true)
    expect(isMisdirectedRun('TEAMIQ', OPPONENT_FILM)).toBe(true)
  })

  it('does not flag SCOUTIQ on opponent film — that is the intended pairing', () => {
    expect(isMisdirectedRun('SCOUTIQ', OPPONENT_FILM)).toBe(false)
  })

  it('does not flag an own-team module on the team s own film', () => {
    expect(isMisdirectedRun('RANKERIQ', OWN_FILM)).toBe(false)
  })

  it('treats film we know nothing about as the coach s own', () => {
    // The safe default: untagged film must not start refusing to write grades.
    expect(isMisdirectedRun('RANKERIQ', { filmType: 'self', opponentName: null })).toBe(false)
  })
})

describe('subjectNameFor', () => {
  it('keeps the coach s team name on their own film', () => {
    expect(subjectNameFor('RANKERIQ', OWN_FILM, 'TP White')).toBe('TP White')
  })

  it('names the opponent, never the coach s team, on opponent film', () => {
    // The observed bug in one line: the clip prose read "The Tinley Park
    // Bulldogs LW defense" about a team the coach has never played for.
    expect(subjectNameFor('RANKERIQ', OPPONENT_FILM, 'TP White')).toBe('TP Blue')
  })

  it('returns nothing rather than the wrong name when the opponent is unnamed', () => {
    expect(subjectNameFor('RANKERIQ', UNNAMED_OPPONENT, 'TP White')).toBeUndefined()
  })

  it('leaves SCOUTIQ alone — its prompt already handles the opponent itself', () => {
    expect(subjectNameFor('SCOUTIQ', OPPONENT_FILM, 'TP White')).toBe('TP White')
  })
})
