import { describe, it, expect } from 'vitest'
import {
  reconcileReadings,
  parseVerification,
  flagMeshPointCarries,
  schemeHasQbMesh,
  type VerifiedPlay,
} from './stat-verify'
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

    // The TEAM still ran the ball 55 yards for a touchdown — that much both
    // reads agree on. Only the name waits, so the carry counts here and lands
    // on nobody's line.
    const { team, lines } = tallyStatPlays(plays)
    expect(team.offense.carries).toBe(1)
    expect(team.offense.rush_yards).toBe(55)
    expect(team.offense.rush_td).toBe(1)
    expect(team.pendingQuestions).toBe(1)
    expect(team.unattributedPlays).toBe(1)
    expect(lines).toHaveLength(0)
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
  /** Two reads of one run, differing only in the number. */
  const twoReads = (charted: number, checked: number) =>
    reconcileReadings(
      [chartedAsRun({ yards: charted, credits: [
        { stat: 'rush', position: 'qb', yards: charted, touchdown: true, identification_confidence: 0.3 },
      ] })],
      [verified({ ball_ended_with: 'qb', yards: checked })]
    )

  it('keeps a long gain the two reads rounded to different yard lines', () => {
    // The real case: 55 and 50 on a 55-yard touchdown. Both reads are counting
    // the same painted stripes and rounding the ends differently — that is one
    // measurement, not two guesses. A flat 3-yard tolerance called it a dispute
    // and handed the coach a 55-yard touchdown with 0 yards on it.
    const { plays, disputes } = twoReads(55, 50)
    expect(disputes).toHaveLength(0)
    expect(plays[0].yards).toBe(55)

    const { team } = tallyStatPlays(plays)
    expect(team.offense.rush_yards).toBe(55)
    expect(team.unmeasured.rush).toBe(0)
  })

  it('still drops two readings that cannot be the same run', () => {
    const { plays, disputes } = twoReads(55, 20)
    expect(disputes.join(' ')).toContain('55 and 20 yards')
    expect(plays[0].yards).toBeNull()

    // The carry still counts — only the yardage is withheld.
    const { team } = tallyStatPlays(plays)
    expect(team.offense.carries).toBe(1)
    expect(team.offense.rush_yards).toBe(0)
    expect(team.unmeasured.rush).toBe(1)
  })

  it('holds a short gain to the tight tolerance it deserves', () => {
    // 3 yards apart on a 55-yard run is rounding. On a 4-yard run it is a
    // disagreement about what happened, so the proportional tolerance floors
    // out rather than scaling to nothing.
    expect(twoReads(4, 12).disputes).toHaveLength(1)
    expect(twoReads(4, 6).disputes).toHaveLength(0)
  })

  it('accepts a small difference between two readings', () => {
    const { plays, disputes } = twoReads(50, 52)
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

describe('the mesh point, which agreement cannot settle', () => {
  it('asks the carrier on a mesh-scheme run even when both reads agreed', () => {
    // The production failure this exists for: charting said handoff to the
    // back, the verification said the ball ended with the back, agreement was
    // 100, and the coach's answer was a quarterback keeper. Corroboration
    // cannot reach a fake, because the fake is what both reads are looking at.
    const { plays, agreement } = reconcileReadings(
      [chartedAsRun({ yards: 55 })],
      [verified({ ball_ended_with: 'rb', ball_changed_hands: 'yes', yards: 55 })]
    )
    expect(agreement).toBe(100)
    expect(plays[0].credits![0].unresolved).toBeFalsy()

    const flagged = flagMeshPointCarries(plays, { qbMeshScheme: true })
    const rush = flagged[0].credits![0]
    expect(rush.unresolved).toBe(true)
    expect(rush.candidates).toEqual(['qb', 'rb'])
    expect(rush.question).toContain('quarterback keep')
  })

  it('still counts the play, the yards and the touchdown for the team', () => {
    // A question about who must never read as a denial that the play happened.
    const flagged = flagMeshPointCarries(
      [chartedAsRun({ yards: 55 })],
      { qbMeshScheme: true }
    )
    const { team, lines } = tallyStatPlays(flagged)
    expect(team.offense.carries).toBe(1)
    expect(team.offense.rush_yards).toBe(55)
    expect(team.offense.rush_td).toBe(1)
    expect(team.offensivePlays).toBe(1)
    expect(team.pendingQuestions).toBe(1)
    // And on nobody's line, so no child's season inherits it.
    expect(lines).toHaveLength(0)
  })

  it('asks in both directions, including when it charted the quarterback', () => {
    // The errors we have measured all ran away from the quarterback, but the
    // only clip whose truth we know IS a keeper — that sample cannot show the
    // bias is one-directional, so the question is symmetric.
    const flagged = flagMeshPointCarries(
      [chartedAsRun({ credits: [{ stat: 'rush', position: 'qb', yards: 55, touchdown: true }] })],
      { qbMeshScheme: true }
    )
    const rush = flagged[0].credits![0]
    expect(rush.unresolved).toBe(true)
    expect(rush.candidates).toEqual(['qb', 'rb', 'fb'])
  })

  it('leaves a team that does not run a mesh scheme alone', () => {
    const flagged = flagMeshPointCarries([chartedAsRun()], { qbMeshScheme: false })
    expect(flagged[0].credits![0].unresolved).toBeFalsy()
  })

  it('does not touch a pass, a catch, or a lineman', () => {
    const flagged = flagMeshPointCarries([chartedAsPass()], { qbMeshScheme: true })
    for (const credit of flagged[0].credits!) expect(credit.unresolved).toBeFalsy()

    // A carry credited outside the backfield is a sweep or a reverse, where
    // there is no mesh to be wrong about.
    const sweep = flagMeshPointCarries(
      [chartedAsRun({ credits: [{ stat: 'rush', position: 'wr_right', yards: 12 }] })],
      { qbMeshScheme: true }
    )
    expect(sweep[0].credits![0].unresolved).toBeFalsy()
  })

  it('keeps a reconciliation question rather than overwriting it', () => {
    // A disagreement between the two reads says more than "this is a mesh
    // scheme" does, and it already carries its own candidates.
    const { plays } = reconcileReadings(
      [chartedAsRun({ yards: 55 })],
      [verified({ ball_ended_with: 'qb', yards: 55 })]
    )
    const flagged = flagMeshPointCarries(plays, { qbMeshScheme: true })
    expect(flagged[0].credits![0].question).toContain('Who carried the ball')
  })

  it('reads the coach\'s own words, not a dropdown', () => {
    // The real value from the team this was found on.
    expect(
      schemeHasQbMesh(
        'Veer option, QB reads DE or DT playside and options with FB to handoff up middle, QB keep or pitch (only on unblocked DE, when it is DT no pitch option)'
      )
    ).toBe(true)
    expect(schemeHasQbMesh('Tight double wing')).toBe(true)
    expect(schemeHasQbMesh('Shotgun spread, zone read')).toBe(true)
    expect(schemeHasQbMesh('Wing-T')).toBe(true)

    // A drop-back team has no mesh, and should never be asked about one.
    expect(schemeHasQbMesh('Pro style, under center, power run and play action')).toBe(false)
    expect(schemeHasQbMesh('Air raid — four verticals, mesh concept')).toBe(true) // passing "mesh" is a false positive we accept: a question beats a wrong name
    expect(schemeHasQbMesh(null)).toBe(false)
    expect(schemeHasQbMesh('')).toBe(false)
  })
})
