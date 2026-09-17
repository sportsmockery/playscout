import { describe, it, expect } from 'vitest'
import { reconcileReadings, parseVerification, type VerifiedPlay } from './stat-verify'
import { tallyStatPlays, type RawStatPlay } from './stat-lines'

/** The real clip: a 50-yard touchdown that two reads described three ways. */
const chartedAsRun = (over: Partial<RawStatPlay> = {}): RawStatPlay => ({
  play_index: 1,
  possession: 'offense',
  play_type: 'run',
  result: 'touchdown',
  yards: 55,
  yards_basis: 'field_landmarks',
  credits: [
    { stat: 'rush', position: 'rb', yards: 55, touchdown: true, identification_confidence: 0.2 },
  ],
  ...over,
})

const chartedAsPass = (over: Partial<RawStatPlay> = {}): RawStatPlay => ({
  play_index: 1,
  possession: 'offense',
  play_type: 'pass',
  result: 'touchdown',
  yards: 50,
  yards_basis: 'field_landmarks',
  credits: [
    { stat: 'pass_complete', position: 'qb', yards: 50, touchdown: true, identification_confidence: 0.2 },
    { stat: 'reception', position: 'wr_left', yards: 50, touchdown: true, identification_confidence: 0.9 },
  ],
  ...over,
})

const verified = (over: Partial<VerifiedPlay> = {}): VerifiedPlay => ({
  play_index: 1,
  play_type: 'run',
  ball_changed_hands: 'no',
  ball_ended_with: 'qb',
  thrown_by: null,
  yards: 50,
  confidence: 0.8,
  ...over,
})

describe('the two reads must agree before anything is counted', () => {
  it('counts nothing when they disagree about run versus pass', () => {
    // This is the exact production failure: one read said a rushing
    // touchdown, the next said a passing touchdown, both at high confidence.
    const { plays, disputes, agreement } = reconcileReadings(
      [chartedAsPass()],
      [verified({ play_type: 'run' })]
    )

    expect(plays[0].credits).toEqual([])
    expect(disputes[0]).toContain('one read of the film says this was a pass')
    expect(agreement).toBeLessThan(100)

    // And nothing reaches the box score.
    const { team } = tallyStatPlays(plays)
    expect(team.offense.pass_attempts).toBe(0)
    expect(team.offense.carries).toBe(0)
  })

  it('asks who carried it when they agree on a run but not on the runner', () => {
    // Same yardage on both reads, so the only thing in dispute is the runner.
    const { plays, disputes } = reconcileReadings(
      [chartedAsRun()],
      [verified({ ball_ended_with: 'qb', yards: 55 })]
    )

    // The play is known, so it is not discarded — only the player is opened up.
    expect(disputes).toHaveLength(0)
    const rush = plays[0].credits![0]
    expect(rush.unresolved).toBe(true)
    // Both the "who ended with it" and the "was there a handoff" checks catch
    // this one disagreement, and the handoff question is the more useful of
    // the two to put in front of a coach.
    expect(rush.candidates).toEqual(expect.arrayContaining(['qb', 'rb']))
    expect(rush.question).toContain('Who carried the ball')

    const { team } = tallyStatPlays(plays)
    expect(team.offense.carries).toBe(0)
    expect(team.pendingQuestions).toBeGreaterThan(0)
  })

  it('catches a handoff one read saw and the other did not', () => {
    // Charted as a back's carry (so, a handoff); the check saw the ball never
    // leave the player who took the snap.
    const { plays } = reconcileReadings(
      [chartedAsRun()],
      [verified({ ball_changed_hands: 'no', ball_ended_with: null })]
    )
    const rush = plays[0].credits![0]
    expect(rush.unresolved).toBe(true)
    expect(rush.candidates).toContain('qb')
    expect(rush.question).toContain('did the quarterback keep it')
  })

  it('lets a corroborated play through untouched', () => {
    const { plays, disputes, agreement } = reconcileReadings(
      [chartedAsRun({ yards: 50, credits: [
        { stat: 'rush', position: 'qb', yards: 50, touchdown: true, identification_confidence: 0.3 },
      ] })],
      [verified({ ball_ended_with: 'qb', ball_changed_hands: 'no', yards: 50 })]
    )

    expect(disputes).toHaveLength(0)
    expect(plays[0].credits![0].unresolved).toBeFalsy()
    expect(agreement).toBe(100)

    const { team } = tallyStatPlays(plays)
    expect(team.offense.carries).toBe(1)
    expect(team.offense.rush_yards).toBe(50)
    expect(team.offense.rush_td).toBe(1)
  })
})

describe('yardage neither read can confirm', () => {
  it('drops a measurement the two reads disagree about', () => {
    // 55 and 50 are two estimates, not a measurement.
    const { plays, disputes } = reconcileReadings(
      [chartedAsRun({ credits: [
        { stat: 'rush', position: 'qb', yards: 55, touchdown: true, identification_confidence: 0.3 },
      ] })],
      [verified({ ball_ended_with: 'qb', yards: 50 })]
    )

    expect(disputes.join(' ')).toContain('55 and 50 yards')
    expect(plays[0].yards).toBeNull()

    // The carry still counts — only the yardage is withheld.
    const { team } = tallyStatPlays(plays)
    expect(team.offense.carries).toBe(1)
    expect(team.offense.rush_yards).toBe(0)
    expect(team.unmeasured.rush).toBe(1)
  })

  it('accepts a small difference between two readings', () => {
    const { plays, disputes } = reconcileReadings(
      [chartedAsRun({ yards: 50, credits: [
        { stat: 'rush', position: 'qb', yards: 50, touchdown: true, identification_confidence: 0.3 },
      ] })],
      [verified({ ball_ended_with: 'qb', yards: 52 })]
    )
    expect(disputes).toHaveLength(0)
    expect(plays[0].yards).toBe(50)
  })
})

describe('a verification that says nothing claims nothing', () => {
  it('discards a play the second read never saw', () => {
    const { plays, disputes } = reconcileReadings([chartedAsRun()], [])
    expect(plays[0].credits).toEqual([])
    expect(disputes[0]).toContain('did not find a play here')
  })

  it('reports zero agreement when there was nothing to check', () => {
    const { agreement } = reconcileReadings(
      [chartedAsRun({ play_type: 'unclear', yards: null, credits: [] })],
      [verified({ play_type: 'cannot_tell', ball_ended_with: null, yards: null })]
    )
    expect(agreement).toBe(0)
  })

  it('leaves the charted read alone where the check abstains', () => {
    const { plays, disputes } = reconcileReadings(
      [chartedAsRun()],
      [verified({ play_type: 'cannot_tell', ball_ended_with: null, ball_changed_hands: 'cannot_tell', yards: null })]
    )
    expect(disputes).toHaveLength(0)
    expect(plays[0].credits![0].unresolved).toBeFalsy()
  })

  it('survives an unparseable verification rather than failing the analysis', () => {
    expect(parseVerification('not json')).toEqual([])
    expect(parseVerification('{"plays":[{"play_index":1}]}')).toHaveLength(1)
  })
})
