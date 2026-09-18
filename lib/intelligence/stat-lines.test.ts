import { describe, it, expect } from 'vitest'
import {
  tallyStatPlays,
  aggregateStatCredits,
  type RawStatPlay,
} from './stat-lines'
import { normalizeStatPosition } from './positions'

/** A completed 12-yard pass, measured off the field. */
const completion: RawStatPlay = {
  play_index: 1,
  possession: 'offense',
  offensive_formation: 'trips_spread',
  defensive_front: 'four_four',
  play_type: 'pass',
  result: 'gain',
  yards: 12,
  yards_basis: 'field_landmarks',
  credits: [
    { stat: 'pass_complete', position: 'qb', yards: 12, touchdown: false, identification_confidence: 0.2 },
    { stat: 'reception', position: 'wr_right', yards: 12, touchdown: false, identification_confidence: 0.2 },
  ],
}

function play(over: Partial<RawStatPlay>): RawStatPlay {
  return { ...completion, credits: [], ...over }
}

describe('the model reports observations; the box score is counted here', () => {
  it('counts a completion on the thrower and a catch on the receiver', () => {
    const { lines, team } = tallyStatPlays([completion])

    const qb = lines.find((l) => l.positionId === 'qb')!
    expect(qb.offense.pass_attempts).toBe(1)
    expect(qb.offense.pass_completions).toBe(1)
    expect(qb.offense.pass_yards).toBe(12)

    const wr = lines.find((l) => l.positionId === 'wr_right')!
    expect(wr.offense.receptions).toBe(1)
    expect(wr.offense.receiving_yards).toBe(12)
    // A catch is a target too — otherwise catch rate is uncomputable.
    expect(wr.offense.targets).toBe(1)

    expect(team.completionPct).toBe(100)
    expect(team.totalYards).toBe(12)
  })

  it('adds carries across plays into one line per position', () => {
    const carries = [4, -2, 9].map((yards, i) =>
      play({
        play_index: i + 1,
        play_type: 'run',
        yards,
        credits: [{ stat: 'rush', position: 'rb', yards, touchdown: false, identification_confidence: 0.1 }],
      })
    )

    const { lines, team } = tallyStatPlays(carries)
    expect(lines).toHaveLength(1)
    expect(lines[0].offense.carries).toBe(3)
    expect(lines[0].offense.rush_yards).toBe(11)
    expect(lines[0].playsCredited).toBe(3)
    expect(team.yardsPerCarry).toBe(3.7)
  })

  it('credits a touchdown to both the passer and the receiver', () => {
    const { team } = tallyStatPlays([
      play({
        result: 'touchdown',
        credits: [
          { stat: 'pass_complete', position: 'qb', yards: 20, touchdown: true, identification_confidence: 0.2 },
          { stat: 'reception', position: 'te_left', yards: 20, touchdown: true, identification_confidence: 0.2 },
        ],
      }),
    ])
    expect(team.offense.pass_td).toBe(1)
    expect(team.offense.receiving_td).toBe(1)
  })

  it('scores a sack as a rushing loss, per NFHS/NCAA — not as a pass attempt', () => {
    const { lines, team } = tallyStatPlays([
      play({
        play_type: 'sack',
        yards: -7,
        credits: [{ stat: 'sack_taken', position: 'qb', yards: -7, touchdown: false, identification_confidence: 0.3 }],
      }),
    ])
    const qb = lines[0]
    expect(qb.offense.carries).toBe(1)
    expect(qb.offense.rush_yards).toBe(-7)
    expect(team.offense.pass_attempts).toBe(0)
  })

  it('counts an interception against the thrower as an attempt', () => {
    const { team } = tallyStatPlays([
      play({
        result: 'interception',
        credits: [{ stat: 'pass_intercepted', position: 'qb', touchdown: false, identification_confidence: 0.2 }],
      }),
    ])
    expect(team.offense.pass_attempts).toBe(1)
    expect(team.offense.interceptions_thrown).toBe(1)
    expect(team.offense.pass_completions).toBe(0)
  })

  it('separates solo and assisted tackles and totals both', () => {
    const { lines, team } = tallyStatPlays([
      play({
        possession: 'defense',
        credits: [
          { stat: 'tackle', position: 'lb_middle', touchdown: false, identification_confidence: 0.2 },
          { stat: 'forced_fumble', position: 'lb_middle', touchdown: false, identification_confidence: 0.2 },
        ],
      }),
      play({
        play_index: 2,
        possession: 'defense',
        credits: [
          { stat: 'assisted_tackle', position: 'lb_middle', touchdown: false, identification_confidence: 0.2 },
          { stat: 'assisted_tackle', position: 'ss', touchdown: false, identification_confidence: 0.2 },
        ],
      }),
    ])

    const mike = lines.find((l) => l.positionId === 'lb_middle')!
    expect(mike.defense.tackles).toBe(1)
    expect(mike.defense.assisted_tackles).toBe(1)
    expect(mike.defense.total_tackles).toBe(2)
    expect(mike.defense.forced_fumbles).toBe(1)
    expect(team.defense.total_tackles).toBe(3)
  })

  it('counts a defensive mistake with its category', () => {
    const { lines } = tallyStatPlays([
      play({
        possession: 'defense',
        credits: [
          {
            stat: 'mistake',
            position: 'cb_left',
            mistake_category: 'coverage_bust',
            touchdown: false,
            identification_confidence: 0.2,
          },
        ],
      }),
    ])
    expect(lines[0].defense.mistakes).toBe(1)
  })
})

describe('yardage is only counted when it could actually be measured', () => {
  it('counts the carry but not the yards when the film cannot measure it', () => {
    const { lines, team, warnings } = tallyStatPlays([
      play({
        yards: null,
        yards_basis: 'not_determinable',
        credits: [{ stat: 'rush', position: 'rb', yards: 8, touchdown: false, identification_confidence: 0.1 }],
      }),
      play({
        play_index: 2,
        yards: 6,
        yards_basis: 'field_landmarks',
        credits: [{ stat: 'rush', position: 'rb', yards: 6, touchdown: false, identification_confidence: 0.1 }],
      }),
    ])

    expect(lines[0].offense.carries).toBe(2)
    expect(lines[0].offense.rush_yards).toBe(6)
    expect(lines[0].unmeasured.rush).toBe(1)
    // The average is over the carry we could measure — not 6/2.
    expect(team.yardsPerCarry).toBe(6)
    expect(warnings.join(' ')).toContain('no measurable yardage')
  })

  it("takes the staff's tagged gain over the film read, and says it did", () => {
    const { team, warnings } = tallyStatPlays(
      [
        play({
          credits: [{ stat: 'rush', position: 'rb', yards: 15, touchdown: false, identification_confidence: 0.1 }],
        }),
      ],
      { breakdownGain: 4 }
    )
    expect(team.offense.rush_yards).toBe(4)
    expect(warnings.join(' ')).toContain('tagged this play as 4 yards')
  })

  it('leaves a multi-play clip alone — one tagged gain cannot describe several plays', () => {
    const { team } = tallyStatPlays(
      [
        play({
          play_index: 1,
          credits: [{ stat: 'rush', position: 'rb', yards: 5, touchdown: false, identification_confidence: 0.1 }],
        }),
        play({
          play_index: 2,
          credits: [{ stat: 'rush', position: 'fb', yards: 3, touchdown: false, identification_confidence: 0.1 }],
        }),
      ],
      { breakdownGain: 4 }
    )
    expect(team.offense.rush_yards).toBe(8)
  })
})

describe("the other team's stats never reach our sheet", () => {
  it('drops a tackle reported on a play where we had the ball', () => {
    const { lines, warnings } = tallyStatPlays([
      play({
        possession: 'offense',
        credits: [
          { stat: 'rush', position: 'rb', yards: 5, touchdown: false, identification_confidence: 0.1 },
          // Our team is carrying the ball — this tackle was made by the opponent.
          { stat: 'tackle', position: 'lb_middle', touchdown: false, identification_confidence: 0.1 },
        ],
      }),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].positionId).toBe('rb')
    expect(warnings.join(' ')).toContain("wasn't ours")
  })

  it('counts nothing at all on a play whose possession could not be determined', () => {
    const { lines, warnings } = tallyStatPlays([
      play({
        possession: 'unclear',
        credits: [{ stat: 'rush', position: 'rb', yards: 5, touchdown: false, identification_confidence: 0.1 }],
      }),
    ])
    expect(lines).toHaveLength(0)
    expect(warnings.join(' ')).toContain('could not be assigned')
  })

  it("falls back to the coach's declared side when the model could not tell", () => {
    const { lines } = tallyStatPlays(
      [
        play({
          possession: 'unclear',
          credits: [{ stat: 'rush', position: 'rb', yards: 5, touchdown: false, identification_confidence: 0.1 }],
        }),
      ],
      { declaredSide: 'offense' }
    )
    expect(lines).toHaveLength(1)
  })

  it('re-files a credit whose position belongs to the other unit', () => {
    const { lines } = tallyStatPlays([
      play({
        possession: 'defense',
        credits: [
          // A tackle credited to a position that only exists on offense.
          { stat: 'tackle', position: 'lt', touchdown: false, identification_confidence: 0.1 },
        ],
      }),
    ])
    expect(lines[0].positionId).toBe('other_defense')
    expect(lines[0].defense.tackles).toBe(1)
  })
})

describe('identity: the position is the subject, the number is the exception', () => {
  const roster = [{ id: 'p1', jersey_number: '22', first_name: 'Carter', last_name: 'Burhans' }]

  const numbered = (over: Record<string, unknown> = {}) =>
    play({
      credits: [
        {
          stat: 'rush',
          position: 'rb',
          yards: 5,
          touchdown: false,
          jersey_number: '22',
          jersey_number_frame: 4,
          identification_confidence: 0.9,
          ...over,
        },
      ],
    })

  it('credits a verified number to the roster player', () => {
    const { lines } = tallyStatPlays([numbered()], { roster })
    expect(lines[0].playerId).toBe('p1')
    expect(lines[0].identifiedBy).toBe('roster')
    expect(lines[0].identifier).toContain('#22')
  })

  it('keeps a number the film showed even with no roster, marked unverified', () => {
    // The coach's instruction: use the number when the tracker can see it, the
    // position when it cannot. With no roster there is no name to attach and
    // nothing to catch a misread, so the number is shown with that caveat
    // rather than thrown away.
    const { lines, warnings } = tallyStatPlays([numbered()])
    expect(lines[0].jerseyNumber).toBe('22')
    expect(lines[0].identifiedBy).toBe('number')
    expect(lines[0].numberVerified).toBe(false)
    expect(lines[0].playerId).toBeNull()
    expect(warnings.join(' ')).toContain('no roster to check it against')
  })

  it('still refuses an unverified number the film did not actually show', () => {
    // No frame cited and low confidence are the gates that separate a number
    // the camera showed from one the model supplied — those never relax.
    const noFrame = tallyStatPlays([numbered({ jersey_number_frame: null })])
    expect(noFrame.lines[0].identifiedBy).toBe('position')

    const illegible = tallyStatPlays([numbered({ identification_confidence: 0.4 })])
    expect(illegible.lines[0].identifiedBy).toBe('position')
  })

  it('abandons an unverified number that turns up at positions too far apart', () => {
    // Observed in production on the grading side: one number stuck onto half
    // the roster. A back who also lines up in the slot is one child; a number
    // that is a tackle on one play and a receiver on the next is two.
    const wander = tallyStatPlays([
      play({
        play_index: 1,
        credits: [
          { stat: 'rush', position: 'rb', yards: 4, touchdown: false, jersey_number: '55', jersey_number_frame: 2, identification_confidence: 0.9 },
        ],
      }),
      play({
        play_index: 2,
        credits: [
          { stat: 'reception', position: 'lt', yards: 4, touchdown: false, jersey_number: '55', jersey_number_frame: 5, identification_confidence: 0.9 },
        ],
      }),
    ])
    expect(wander.lines.every((l) => l.jerseyNumber === null)).toBe(true)
    expect(wander.warnings.join(' ')).toContain('#55 was read at positions too far apart')
  })

  it('keeps an unverified number that moves within one position group', () => {
    const shifted = tallyStatPlays([
      play({
        play_index: 1,
        credits: [
          { stat: 'rush', position: 'rb', yards: 4, touchdown: false, jersey_number: '22', jersey_number_frame: 2, identification_confidence: 0.9 },
        ],
      }),
      play({
        play_index: 2,
        credits: [
          { stat: 'rush', position: 'wingback_left', yards: 6, touchdown: false, jersey_number: '22', jersey_number_frame: 5, identification_confidence: 0.9 },
        ],
      }),
    ])
    expect(shifted.lines).toHaveLength(1)
    expect(shifted.lines[0].jerseyNumber).toBe('22')
    expect(shifted.lines[0].offense.carries).toBe(2)
  })

  it('refuses a number the model never cited a frame for', () => {
    const { lines } = tallyStatPlays([numbered({ jersey_number_frame: null })], { roster })
    expect(lines[0].identifiedBy).toBe('position')
  })

  it('refuses a number that is not on the roster', () => {
    const { lines } = tallyStatPlays([numbered({ jersey_number: '98' })], { roster })
    expect(lines[0].identifiedBy).toBe('position')
  })

  it('claims no number at all on scrimmage film', () => {
    const { lines } = tallyStatPlays([numbered()], { roster, allowNumbers: false })
    expect(lines[0].identifiedBy).toBe('position')
  })

  it('scrubs a rejected number out of the note, not just the label', () => {
    const { lines, credits } = tallyStatPlays(
      [numbered({ note: '#22 bounced it outside', jersey_number_frame: null })],
      { roster: [], allowNumbers: true }
    )
    expect(lines[0].identifiedBy).toBe('position')
    expect(credits[0].note).not.toContain('#22')
    expect(credits[0].note).toContain('Running Back')
  })

  it('keeps two different positions as two lines', () => {
    const { lines } = tallyStatPlays([
      play({
        credits: [
          { stat: 'rush', position: 'rb', yards: 5, touchdown: false, identification_confidence: 0.1 },
          { stat: 'reception', position: 'fb', yards: 3, touchdown: false, identification_confidence: 0.1 },
        ],
      }),
    ])
    expect(lines).toHaveLength(2)
  })
})

describe('penalties, and what they do to the rest of the play', () => {
  const touchdownRun = (over: Partial<RawStatPlay>) =>
    play({
      play_type: 'run',
      result: 'touchdown',
      yards: 40,
      credits: [
        { stat: 'rush', position: 'rb', yards: 40, touchdown: true, identification_confidence: 0.1 },
        {
          stat: 'penalty',
          position: 'lt',
          penalty_type: 'holding',
          yards: 10,
          touchdown: false,
          identification_confidence: 0.1,
        },
      ],
      ...over,
    })

  it('wipes every stat on a play an accepted penalty called back', () => {
    const { lines, team, warnings } = tallyStatPlays([
      touchdownRun({
        penalty_on: 'us',
        penalty_type: 'holding',
        penalty_enforcement: 'accepted',
        penalty_timing: 'during_play',
        penalty_yards: 10,
      }),
    ])

    // The 40-yard touchdown did not happen.
    expect(team.offense.carries).toBe(0)
    expect(team.offense.rush_yards).toBe(0)
    expect(team.offense.rush_td).toBe(0)
    // The flag that called it back did.
    expect(team.penalties).toBe(1)
    expect(team.penaltyYards).toBe(10)
    expect(team.nullifiedPlays).toBe(1)
    const lt = lines.find((l) => l.positionId === 'lt')!
    expect(lt.penalties).toBe(1)
    expect(warnings.join(' ')).toContain('called back')
  })

  it('leaves the play alone when the penalty was declined, and charges nobody', () => {
    const { team } = tallyStatPlays([
      touchdownRun({
        penalty_on: 'us',
        penalty_enforcement: 'declined',
        penalty_timing: 'during_play',
        penalty_yards: 10,
      }),
    ])
    expect(team.offense.rush_yards).toBe(40)
    expect(team.offense.rush_td).toBe(1)
    // A declined flag cost the team nothing, so it is not a team penalty.
    expect(team.penalties).toBe(0)
    expect(team.nullifiedPlays).toBe(0)
  })

  it('keeps the stats on a dead-ball foul, which is enforced on the next snap', () => {
    const { team } = tallyStatPlays([
      touchdownRun({
        penalty_on: 'us',
        penalty_type: 'unsportsmanlike_conduct',
        penalty_enforcement: 'accepted',
        penalty_timing: 'dead_ball',
        penalty_yards: 15,
        credits: [
          { stat: 'rush', position: 'rb', yards: 40, touchdown: true, identification_confidence: 0.1 },
          {
            stat: 'penalty',
            position: 'ss',
            penalty_type: 'unsportsmanlike_conduct',
            yards: 15,
            touchdown: false,
            identification_confidence: 0.1,
          },
        ],
      }),
    ])
    expect(team.offense.rush_td).toBe(1)
    expect(team.penalties).toBe(1)
    expect(team.penaltyYards).toBe(15)
    expect(team.nullifiedPlays).toBe(0)
  })

  it('wipes the play but charges us nothing when the flag was on the other team', () => {
    const { team } = tallyStatPlays([
      touchdownRun({
        penalty_on: 'them',
        penalty_enforcement: 'accepted',
        penalty_timing: 'during_play',
        penalty_yards: 10,
      }),
    ])
    expect(team.offense.carries).toBe(0)
    expect(team.penalties).toBe(0)
    expect(team.nullifiedPlays).toBe(1)
  })

  it('replays the down on offsetting fouls — no stats, no penalty charged', () => {
    const { team } = tallyStatPlays([
      touchdownRun({
        penalty_on: 'offsetting',
        penalty_enforcement: 'offsetting',
        penalty_timing: 'during_play',
        penalty_yards: 10,
      }),
    ])
    expect(team.offense.carries).toBe(0)
    expect(team.penalties).toBe(0)
  })

  it('counts penalty yardage even when the play’s gain could not be measured', () => {
    // Assessed yardage is a rules constant, not something read off the field.
    const { team } = tallyStatPlays([
      play({
        yards: null,
        yards_basis: 'not_determinable',
        penalty_on: 'us',
        penalty_enforcement: 'accepted',
        penalty_timing: 'pre_snap',
        penalty_yards: 5,
        credits: [
          {
            stat: 'penalty',
            position: 'rg',
            penalty_type: 'false_start',
            yards: 5,
            touchdown: false,
            identification_confidence: 0.1,
          },
        ],
      }),
    ])
    expect(team.penalties).toBe(1)
    expect(team.penaltyYards).toBe(5)
  })

  it('charges a defensive penalty to the defender who drew it', () => {
    const { lines, team } = tallyStatPlays([
      play({
        possession: 'defense',
        penalty_on: 'us',
        penalty_enforcement: 'accepted',
        penalty_timing: 'during_play',
        penalty_yards: 15,
        credits: [
          {
            stat: 'penalty',
            position: 'cb_right',
            penalty_type: 'pass_interference',
            yards: 15,
            touchdown: false,
            identification_confidence: 0.1,
          },
        ],
      }),
    ])
    expect(team.penalties).toBe(1)
    expect(lines[0].positionId).toBe('cb_right')
    expect(lines[0].penaltyYards).toBe(15)
  })
})

describe('the model may abstain instead of guessing', () => {
  it('parks a credit it cannot attribute, and counts none of it', () => {
    const { lines, team, credits } = tallyStatPlays([
      play({
        credits: [
          {
            stat: 'rush',
            position: 'rb',
            yards: 55,
            touchdown: true,
            identification_confidence: 0.2,
            unresolved: true,
            question: 'Who carried the ball on this play?',
            candidates: ['qb', 'rb'],
          },
        ],
      }),
    ])

    // Nobody's line — that is the point of abstaining. But the team's own
    // rushing counts it: "unresolved" is a question about who, never a claim
    // that the snap did not happen, and a sheet that answered it by erasing a
    // 55-yard touchdown would be lying in the other direction.
    expect(lines).toHaveLength(0)
    expect(team.offense.carries).toBe(1)
    expect(team.offense.rush_yards).toBe(55)
    expect(team.offense.rush_td).toBe(1)
    expect(team.pendingQuestions).toBe(1)
    expect(team.unattributedPlays).toBe(1)
    // The credit survives so the question can be asked — it is parked, not lost.
    expect(credits[0].resolutionStatus).toBe('unresolved')
    expect(credits[0].candidates).toEqual(['qb', 'rb'])
  })

  it('supplies a question when the model abstained without writing one', () => {
    const { credits } = tallyStatPlays([
      play({
        possession: 'defense',
        credits: [
          { stat: 'tackle', position: 'lb_middle', touchdown: false, identification_confidence: 0.1, unresolved: true },
        ],
      }),
    ])
    expect(credits[0].question).toBe('Who made this tackle?')
  })

  it('normalizes candidate positions into the closed vocabulary', () => {
    const { credits } = tallyStatPlays([
      play({
        credits: [
          {
            stat: 'rush',
            position: 'rb',
            touchdown: false,
            identification_confidence: 0.1,
            unresolved: true,
            candidates: ['quarterback', 'tailback'],
          },
        ],
      }),
    ])
    expect(credits[0].candidates).toEqual(['qb', 'rb'])
  })
})

describe('the sheet reports where it contradicts itself', () => {
  it('flags a catch with no completion behind it', () => {
    const { warnings } = tallyStatPlays([
      play({
        credits: [{ stat: 'reception', position: 'wr_left', yards: 9, touchdown: false, identification_confidence: 0.2 }],
      }),
    ])
    expect(warnings.join(' ')).toContain('completion')
  })

  it('flags receiving yards that do not match passing yards', () => {
    const { warnings } = tallyStatPlays([
      play({
        credits: [
          { stat: 'pass_complete', position: 'qb', yards: 12, touchdown: false, identification_confidence: 0.2 },
          { stat: 'reception', position: 'wr_left', yards: 9, touchdown: false, identification_confidence: 0.2 },
        ],
      }),
    ])
    expect(warnings.join(' ')).toContain('Receiving yards')
  })

  it('stays quiet when the sheet is coherent', () => {
    const { warnings } = tallyStatPlays([completion], {
      roster: [{ id: 'p1', jersey_number: '22' }],
    })
    // The only note is that nothing was identified by number, which is true.
    expect(warnings.filter((w) => !w.includes('by position'))).toHaveLength(0)
  })
})

describe('a whole game is the same arithmetic as one play', () => {
  it('adds every clip into one box score without colliding play indexes', () => {
    const clipA = tallyStatPlays([
      play({
        play_index: 1,
        credits: [{ stat: 'rush', position: 'rb', yards: 6, touchdown: false, identification_confidence: 0.1 }],
      }),
    ])
    const clipB = tallyStatPlays([
      play({
        play_index: 1,
        credits: [{ stat: 'rush', position: 'rb', yards: 4, touchdown: true, identification_confidence: 0.1 }],
      }),
    ])

    const game = aggregateStatCredits([clipA.credits, clipB.credits])
    expect(game.lines).toHaveLength(1)
    expect(game.lines[0].offense.carries).toBe(2)
    expect(game.lines[0].offense.rush_yards).toBe(10)
    expect(game.lines[0].offense.rush_td).toBe(1)
    // Two clips, one play each — two plays, not one.
    expect(game.team.plays).toBe(2)
    expect(game.lines[0].playsCredited).toBe(2)
  })
})

describe('normalizeStatPosition', () => {
  it('maps the synonyms a coach actually types', () => {
    expect(normalizeStatPosition('Tailback')).toBe('rb')
    expect(normalizeStatPosition('HB')).toBe('rb')
    expect(normalizeStatPosition('Nose Guard')).toBe('nose')
    expect(normalizeStatPosition('Mike')).toBe('lb_middle')
  })

  it('keeps left and right apart — they are different players', () => {
    expect(normalizeStatPosition('left guard')).toBe('lg')
    expect(normalizeStatPosition('right guard')).toBe('rg')
    expect(normalizeStatPosition('Right Wingback')).toBe('wingback_right')
    expect(normalizeStatPosition('backside corner')).toBe('cb_left')
  })

  it('resolves a bare "tackle" using the side it was credited on', () => {
    expect(normalizeStatPosition('left tackle', 'offense')).toBe('lt')
    expect(normalizeStatPosition('tackle', 'defense')).toBe('other_defense')
  })

  it('falls back to the side rather than guessing a spot', () => {
    expect(normalizeStatPosition('the big kid', 'defense')).toBe('other_defense')
    expect(normalizeStatPosition('', 'offense')).toBe('other_offense')
    expect(normalizeStatPosition('someone')).toBe('unknown')
  })
})
