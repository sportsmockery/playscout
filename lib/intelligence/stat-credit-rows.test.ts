import { describe, it, expect } from 'vitest'
import {
  statCreditFromRow,
  applyCreditPatch,
  positionIsValidForSide,
  retally,
  type StatCreditRow,
} from './stat-credit-rows'
import { tallyStatPlays, type RawStatPlay } from './stat-lines'

const row = (over: Partial<StatCreditRow> = {}): StatCreditRow => ({
  id: 'c1',
  play_index: 1,
  side: 'offense',
  stat: 'rush',
  position_id: 'rb',
  position_label: 'Running Back',
  position_detail: null,
  role_on_play: null,
  // Postgres numerics come back as strings through PostgREST.
  yards: '55',
  yards_basis: 'field_landmarks',
  touchdown: true,
  mistake_category: null,
  penalty_type: null,
  player_id: null,
  jersey_number: null,
  number_verified: false,
  identified_by: 'position',
  number_rejected_reason: null,
  identifier: 'Running Back',
  note: 'Took the handoff on an off-tackle run to the right.',
  evidence: { timestamps: [2.4], frames: [] },
  resolution_status: 'confirmed',
  question: null,
  candidates: null,
  ...over,
})

describe('reading the ledger back', () => {
  it('rebuilds a credit the tally can count', () => {
    const credit = statCreditFromRow(row())
    expect(credit.yards).toBe(55)
    expect(credit.stat).toBe('rush')
    expect(credit.side).toBe('offense')
    expect(credit.evidenceTimestamps).toEqual([2.4])

    const { team } = retally([credit])
    expect(team.offense.carries).toBe(1)
    expect(team.offense.rush_yards).toBe(55)
    expect(team.offense.rush_td).toBe(1)
  })

  it('round-trips: a charted credit re-read from the ledger totals the same', () => {
    const play: RawStatPlay = {
      play_index: 1,
      possession: 'offense',
      play_type: 'run',
      result: 'touchdown',
      yards: 55,
      yards_basis: 'field_landmarks',
      credits: [
        { stat: 'rush', position: 'rb', yards: 55, touchdown: true, identification_confidence: 0.2 },
      ],
    }
    const charted = tallyStatPlays([play])
    const reread = retally([statCreditFromRow(row())])
    expect(reread.team.offense).toEqual(charted.team.offense)
  })

  it('treats an unreadable yardage as unmeasured, not as zero', () => {
    const credit = statCreditFromRow(row({ yards: null, yards_basis: 'not_determinable' }))
    const { team } = retally([credit])
    expect(team.offense.carries).toBe(1)
    expect(team.offense.rush_yards).toBe(0)
    expect(team.unmeasured.rush).toBe(1)
  })
})

describe('correcting a credit', () => {
  it('moves the carry to the quarterback and re-totals under him', () => {
    // The real case: a 55-yard quarterback keeper charted as a running back.
    const corrected = applyCreditPatch(statCreditFromRow(row()), { position_id: 'qb' })!
    expect(corrected.positionId).toBe('qb')
    expect(corrected.identifier).toBe('QB')

    const { lines } = retally([corrected])
    expect(lines).toHaveLength(1)
    expect(lines[0].positionId).toBe('qb')
    expect(lines[0].offense.rush_yards).toBe(55)
  })

  it('drops a jersey number when the stat moves to another player', () => {
    // The number was read for the player the model thought it saw. Carrying it
    // onto the corrected row would put the wrong name on the stat.
    const numbered = statCreditFromRow(
      row({ jersey_number: '30', number_verified: true, identified_by: 'roster', player_id: 'p1' })
    )
    const corrected = applyCreditPatch(numbered, { position_id: 'qb' })!
    expect(corrected.jerseyNumber).toBeNull()
    expect(corrected.playerId).toBeNull()
    expect(corrected.numberVerified).toBe(false)
    expect(corrected.identifiedBy).toBe('position')
    expect(corrected.numberRejectedReason).toContain('a coach moved this stat')
  })

  it("treats a coach's yardage as fact, not an estimate", () => {
    const corrected = applyCreditPatch(statCreditFromRow(row()), { yards: 12 })!
    expect(corrected.yards).toBe(12)
    expect(corrected.yardsBasis).toBe('coach_breakdown')

    const { team } = retally([corrected])
    expect(team.offense.rush_yards).toBe(12)
    expect(team.unmeasured.rush).toBe(0)
  })

  it('records a cleared yardage as unmeasured rather than as no gain', () => {
    const corrected = applyCreditPatch(statCreditFromRow(row()), { yards: null })!
    expect(corrected.yards).toBeNull()
    const { team } = retally([corrected])
    expect(team.offense.carries).toBe(1)
    expect(team.unmeasured.rush).toBe(1)
  })

  it('takes a touchdown back off the board', () => {
    const corrected = applyCreditPatch(statCreditFromRow(row()), { touchdown: false })!
    expect(retally([corrected]).team.offense.rush_td).toBe(0)
  })

  it('removes a stat that never happened', () => {
    expect(applyCreditPatch(statCreditFromRow(row()), { remove: true })).toBeNull()
    expect(retally([]).team.offense.carries).toBe(0)
  })

  it('leaves everything else alone', () => {
    const before = statCreditFromRow(row())
    const after = applyCreditPatch(before, { position_id: 'qb' })!
    expect(after.stat).toBe(before.stat)
    expect(after.playIndex).toBe(before.playIndex)
    expect(after.note).toBe(before.note)
    expect(after.evidenceTimestamps).toEqual(before.evidenceTimestamps)
  })
})

describe('a stat the film could not attribute', () => {
  const unresolved = () =>
    statCreditFromRow(
      row({
        resolution_status: 'unresolved',
        question: 'Who carried the ball on this play?',
        candidates: ['qb', 'rb'],
      })
    )

  it('lands on no player until someone answers, but the team still ran it', () => {
    const { lines, team } = retally([unresolved()])
    expect(lines).toHaveLength(0)
    expect(team.offense.carries).toBe(1)
    expect(team.offense.rush_yards).toBe(55)
    expect(team.pendingQuestions).toBe(1)
  })

  it('says so on the sheet rather than hiding the gap', () => {
    const { warnings } = retally([unresolved()])
    expect(warnings.join(' ')).toContain("on nobody's line yet")
    expect(warnings.join(' ')).toContain('moves onto a player')
  })

  it('becomes a real stat the moment the coach names the player', () => {
    const answered = applyCreditPatch(unresolved(), { position_id: 'qb' })!
    expect(answered.resolutionStatus).toBe('coach_entered')
    expect(answered.question).toBeNull()
    expect(answered.candidates).toBeNull()

    const { lines, team } = retally([answered])
    expect(team.pendingQuestions).toBe(0)
    expect(lines[0].positionId).toBe('qb')
    expect(lines[0].offense.rush_yards).toBe(55)
    expect(lines[0].offense.rush_td).toBe(1)
  })

  it('still counts when the coach confirms the position the model had parked', () => {
    // Answering "yes, it was the running back" is an answer, not a no-op —
    // the credit has to start counting either way.
    const answered = applyCreditPatch(unresolved(), { position_id: 'rb' })!
    expect(answered.resolutionStatus).toBe('coach_entered')
    expect(retally([answered]).team.offense.carries).toBe(1)
  })

  it('leaves a confirmed credit alone when its position is corrected', () => {
    // A correction to something the film DID see is not an answer to a
    // question, and must not be relabelled as coach-entered.
    const corrected = applyCreditPatch(statCreditFromRow(row()), { position_id: 'qb' })!
    expect(corrected.resolutionStatus).toBe('confirmed')
  })

  it('keeps the rest of the sheet countable around it', () => {
    const { team, lines } = retally([
      statCreditFromRow(row({ id: 'a' })),
      unresolved(),
    ])
    // Two carries for the team; one of them on a player's line, the other
    // waiting for a name.
    expect(team.offense.carries).toBe(2)
    expect(team.offense.rush_yards).toBe(110)
    expect(team.pendingQuestions).toBe(1)
    expect(lines).toHaveLength(1)
    expect(lines[0].offense.carries).toBe(1)
  })
})

describe('a position cannot cross the line of scrimmage', () => {
  it('refuses a defensive position for an offensive stat', () => {
    // The box score renders the two sides from the credit's own side, so this
    // correction would make the stat disappear from both tables.
    expect(positionIsValidForSide('cb_left', 'offense')).toBe(false)
    expect(positionIsValidForSide('qb', 'offense')).toBe(true)
  })

  it('refuses an offensive position for a defensive stat', () => {
    expect(positionIsValidForSide('rb', 'defense')).toBe(false)
    expect(positionIsValidForSide('lb_middle', 'defense')).toBe(true)
  })
})
