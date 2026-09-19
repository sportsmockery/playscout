import { describe, it, expect } from 'vitest'
import {
  carrierOf,
  statPlayFromFacts,
  factsOutputToAnalysisOutput,
  type PlayFacts,
} from './stat-facts'
import { tallyStatPlays } from './stat-lines'

function facts(over: Partial<PlayFacts> = {}): PlayFacts {
  return {
    play_index: 1,
    possession: 'ours',
    play_type: 'run',
    ball_changed_hands: 'no',
    snap_taken_by: 'qb',
    ball_ended_with: 'qb',
    touchdown: false,
    yards: 8,
    yards_basis: 'field_landmarks',
    penalty_on: 'none',
    confidence: 0.9,
    ...over,
  }
}

const creditsOf = (f: PlayFacts) => statPlayFromFacts(f).credits ?? []
const statOf = (f: PlayFacts, stat: string) => creditsOf(f).filter((c) => c.stat === stat)

describe('carrierOf — the carry rule, applied rather than asked for', () => {
  it('credits the snap taker when the ball never changed hands', () => {
    expect(carrierOf(facts({ ball_changed_hands: 'no', ball_ended_with: 'qb' })).position).toBe('qb')
  })

  it('credits whoever finished with it when the ball did change hands', () => {
    expect(
      carrierOf(facts({ ball_changed_hands: 'yes', snap_taken_by: 'qb', ball_ended_with: 'rb' }))
        .position
    ).toBe('rb')
  })

  // The failure this whole module is built around: a QB keeper off a dive fake,
  // charted to a back three times in four by the narrative prompt.
  it('names nobody when the mesh was hidden, and offers both readings', () => {
    const { position, candidates } = carrierOf(
      facts({ ball_changed_hands: 'cannot_tell', snap_taken_by: 'qb', ball_ended_with: 'rb' })
    )
    expect(position).toBeNull()
    expect(candidates).toEqual(['qb', 'rb'])
  })

  it('does not invent a carrier from a handoff it could not follow', () => {
    const { position, candidates } = carrierOf(
      facts({ ball_changed_hands: 'yes', snap_taken_by: 'qb', ball_ended_with: null })
    )
    expect(position).toBeNull()
    expect(candidates).toEqual(['qb'])
  })
})

describe('pairing is structural, not instructed', () => {
  it('a completion emits exactly one thrower and one catcher with the same yards', () => {
    const f = facts({
      play_type: 'pass',
      pass_outcome: 'complete',
      thrown_by: 'qb',
      ball_ended_with: 'wr_right',
      yards: 14,
      touchdown: true,
    })
    const complete = statOf(f, 'pass_complete')
    const caught = statOf(f, 'reception')
    expect(complete).toHaveLength(1)
    expect(caught).toHaveLength(1)
    expect(complete[0].position).toBe('qb')
    expect(caught[0].position).toBe('wr_right')
    expect(complete[0].yards).toBe(caught[0].yards)
    expect(complete[0].touchdown).toBe(true)
    expect(caught[0].touchdown).toBe(true)
  })

  // A reception with no completion behind it is the contradiction the box score
  // used to have to detect and display. It is now unreachable.
  it('an unreadable catcher parks the reception but still counts the completion', () => {
    const f = facts({
      play_type: 'pass',
      pass_outcome: 'complete',
      thrown_by: 'qb',
      ball_ended_with: null,
      intended_receiver: null,
      yards: 14,
    })
    expect(statOf(f, 'pass_complete')[0].unresolved).toBe(false)
    const reception = statOf(f, 'reception')[0]
    expect(reception.unresolved).toBe(true)
    expect(reception.question).toBe('Who caught this pass?')
  })

  it('an incompletion credits the thrower and targets the intended receiver', () => {
    const f = facts({
      play_type: 'pass',
      pass_outcome: 'incomplete',
      thrown_by: 'qb',
      intended_receiver: 'wr_left',
      yards: 0,
    })
    expect(statOf(f, 'pass_incomplete')).toHaveLength(1)
    expect(statOf(f, 'target')[0].position).toBe('wr_left')
    expect(statOf(f, 'reception')).toHaveLength(0)
  })

  it('never emits a reception alongside a target for the same play', () => {
    const f = facts({
      play_type: 'pass',
      pass_outcome: 'complete',
      thrown_by: 'qb',
      ball_ended_with: 'wr_left',
      intended_receiver: 'wr_left',
    })
    expect(statOf(f, 'target')).toHaveLength(0)
  })
})

describe('solo versus assisted cannot both be credited', () => {
  it('one tackler alone is a solo tackle', () => {
    const f = facts({ possession: 'theirs', tacklers: ['lb_middle'], tackle_shared: false })
    expect(statOf(f, 'tackle')).toHaveLength(1)
    expect(statOf(f, 'assisted_tackle')).toHaveLength(0)
  })

  it('two tacklers are both assists and never also solos', () => {
    const f = facts({ possession: 'theirs', tacklers: ['lb_middle', 'ss'], tackle_shared: true })
    expect(statOf(f, 'assisted_tackle')).toHaveLength(2)
    expect(statOf(f, 'tackle')).toHaveLength(0)
  })

  it('more than one tackler is shared even when the flag says otherwise', () => {
    const f = facts({ possession: 'theirs', tacklers: ['lb_left', 'de_right'], tackle_shared: false })
    expect(statOf(f, 'tackle')).toHaveLength(0)
    expect(statOf(f, 'assisted_tackle')).toHaveLength(2)
  })

  it('does not credit the same player twice for one stop', () => {
    const f = facts({ possession: 'theirs', tacklers: ['lb_middle', 'lb_middle'] })
    expect(creditsOf(f)).toHaveLength(1)
  })
})

describe('our unit only', () => {
  it('charts no offensive credits while the other team has the ball', () => {
    const f = facts({ possession: 'theirs', play_type: 'run', ball_ended_with: 'rb' })
    expect(statOf(f, 'rush')).toHaveLength(0)
  })

  it('charts nothing at all when possession could not be read', () => {
    expect(creditsOf(facts({ possession: 'unclear' }))).toHaveLength(0)
  })
})

describe('the play row', () => {
  it('reports a touchdown as the result', () => {
    expect(statPlayFromFacts(facts({ touchdown: true })).result).toBe('touchdown')
  })

  it('distinguishes a loss, no gain and a gain', () => {
    expect(statPlayFromFacts(facts({ yards: -3 })).result).toBe('loss')
    expect(statPlayFromFacts(facts({ yards: 0 })).result).toBe('no_gain')
    expect(statPlayFromFacts(facts({ yards: 5 })).result).toBe('gain')
  })

  // Unmeasured and zero are different facts — printing 0 for both is the
  // sheet's worst habit.
  it('keeps an unmeasured gain null rather than zero', () => {
    const play = statPlayFromFacts(facts({ yards: null, yards_basis: 'not_determinable' }))
    expect(play.yards).toBeNull()
    expect(play.result).toBe('unclear')
  })

  it('carries the penalty through to the play row', () => {
    const play = statPlayFromFacts(
      facts({
        penalty_on: 'us',
        penalty_by: 'lt',
        penalty_type: 'holding',
        penalty_enforcement: 'accepted',
        penalty_timing: 'during_play',
        penalty_yards: 10,
      })
    )
    expect(play.penalty_on).toBe('us')
    expect(play.penalty_enforcement).toBe('accepted')
    expect(play.credits?.find((c) => c.stat === 'penalty')?.position).toBe('lt')
  })

  it('does not invent a player for a flag it could not attribute', () => {
    const play = statPlayFromFacts(facts({ penalty_on: 'us', penalty_by: null, penalty_yards: 5 }))
    expect(play.penalty_on).toBe('us')
    expect(play.credits?.some((c) => c.stat === 'penalty')).toBe(false)
  })
})

describe('jersey numbers ride on the player they were read for', () => {
  it('attaches a number to the matching position and nobody else', () => {
    const f = facts({
      play_type: 'pass',
      pass_outcome: 'complete',
      thrown_by: 'qb',
      ball_ended_with: 'wr_right',
      numbers: [
        { position: 'wr_right', jersey_number: '12', jersey_number_frame: 40, identification_confidence: 0.9 },
      ],
    })
    expect(statOf(f, 'reception')[0].jersey_number).toBe('12')
    expect(statOf(f, 'pass_complete')[0].jersey_number).toBeNull()
  })

  it('never puts a number on a credit nobody could attribute', () => {
    const f = facts({
      ball_changed_hands: 'cannot_tell',
      ball_ended_with: 'rb',
      numbers: [{ position: 'rb', jersey_number: '30', identification_confidence: 0.9 }],
    })
    const rush = statOf(f, 'rush')[0]
    expect(rush.unresolved).toBe(true)
    expect(rush.jersey_number).toBeNull()
  })
})

describe('the envelope conversion', () => {
  it('keeps the envelope and replaces plays with charted plays', () => {
    const out = factsOutputToAnalysisOutput({
      plays: [facts(), facts({ play_index: 2, yards: 3 })],
      summary: 'Two carries.',
      overall_score: 70,
    }) as { stat_plays: unknown[]; plays_observed: number; summary: string; plays?: unknown }
    expect(out.stat_plays).toHaveLength(2)
    expect(out.plays_observed).toBe(2)
    expect(out.summary).toBe('Two carries.')
    expect(out.plays).toBeUndefined()
  })

  it('survives a response with no plays at all', () => {
    const out = factsOutputToAnalysisOutput({ summary: 'Nothing chartable.' }) as {
      stat_plays: unknown[]
      plays_observed: number
    }
    expect(out.stat_plays).toEqual([])
    expect(out.plays_observed).toBe(0)
  })
})

describe('end to end: the answers become a box score', () => {
  // The clip whose truth the coach gave us: a QB keeper off a fullback dive
  // fake, 55 yards, touchdown, on a marked field.
  it('charts a quarterback keeper to the quarterback', () => {
    const play = statPlayFromFacts(
      facts({
        play_type: 'run',
        ball_changed_hands: 'no',
        snap_taken_by: 'qb',
        ball_ended_with: 'qb',
        yards: 55,
        yards_basis: 'field_landmarks',
        touchdown: true,
      })
    )
    const tally = tallyStatPlays([play], { allowUnverifiedNumbers: true })
    const qb = tally.lines.find((l) => l.positionId === 'qb')
    expect(qb?.offense.carries).toBe(1)
    expect(qb?.offense.rush_yards).toBe(55)
    expect(qb?.offense.rush_td).toBe(1)
  })

  // The same play with the mesh hidden: the team still gets its carry and its
  // 55 yards, and no child gets a line they did not earn.
  it('counts an unattributed carry for the team and for no player', () => {
    const play = statPlayFromFacts(
      facts({
        play_type: 'run',
        ball_changed_hands: 'cannot_tell',
        snap_taken_by: 'qb',
        ball_ended_with: 'rb',
        yards: 55,
        touchdown: true,
      })
    )
    const tally = tallyStatPlays([play], { allowUnverifiedNumbers: true })
    expect(tally.team.offense.carries).toBe(1)
    expect(tally.team.offense.rush_yards).toBe(55)
    expect(tally.team.offense.rush_td).toBe(1)
    expect(tally.lines.every((l) => l.offense.carries === 0)).toBe(true)
    expect(tally.team.pendingQuestions).toBeGreaterThan(0)
  })
})
