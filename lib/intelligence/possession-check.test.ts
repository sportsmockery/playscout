import { describe, it, expect } from 'vitest'
import {
  parsePossessionCheck as parseWith, settledPossession, buildPossessionFactBlock, buildPossessionCheckPrompt,
  primaryColour, sideFromColours, MIN_POSSESSION_CONFIDENCE,
} from './possession-check'
import { aggregateScoutReport } from './scoutiq-aggregate'

const WARRIORS = 'black jerseys with orange numbers (the Knights, the other team, wear white jerseys)'
const parsePossessionCheck = (raw: unknown) => parseWith(raw, WARRIORS)
const raw = (over: Record<string, unknown> = {}) => ({
  play_kind: 'scrimmage', offense_jersey: 'white', defense_jersey: 'black with orange numbers',
  how_determined: 'white over the ball', confidence: 0.9,
  ball_carrier_side: 'offense', ball_carrier_position: 'tailback', ball_carrier_number: '', ...over,
})

describe('possession check', () => {
  it('settles possession only on a confident scrimmage play', () => {
    expect(settledPossession(parsePossessionCheck(raw()))).toBe('defense')
    expect(settledPossession(parsePossessionCheck(raw({ offense_jersey: 'Black', defense_jersey: 'white' })))).toBe('offense')
    expect(settledPossession(parsePossessionCheck(raw({ play_kind: 'kickoff' })))).toBeNull()
    expect(settledPossession(parsePossessionCheck(raw({ confidence: MIN_POSSESSION_CONFIDENCE - 0.01 })))).toBeNull()
    expect(settledPossession(parsePossessionCheck(raw({ offense_jersey: 'unclear' })))).toBeNull()
  })

  it('decides the team in code from colours, never from the model naming a team', () => {
    expect(primaryColour(WARRIORS)).toBe('black')
    expect(primaryColour('Gray jerseys')).toBe('grey')
    expect(sideFromColours('black with orange numbers', 'white', WARRIORS)).toBe('scouted')
    expect(sideFromColours('white', 'black', WARRIORS)).toBe('other')
    expect(sideFromColours('black', 'black', WARRIORS)).toBe('unclear')
    expect(sideFromColours('red', 'white', WARRIORS)).toBe('unclear')
    // The prompt itself never names a team or a team's colour.
    expect(buildPossessionCheckPrompt()).not.toMatch(/scouted|Warriors|Knights/i)
  })

  it('maps the ball carrier through possession: a returner or interceptor is on the other side', () => {
    expect(parsePossessionCheck(raw())?.ball_carrier?.team).toBe('other')
    expect(parsePossessionCheck(raw({ ball_carrier_side: 'defense' }))?.ball_carrier?.team).toBe('scouted')
    expect(parsePossessionCheck(raw({ offense_jersey: 'unclear', ball_carrier_side: 'offense' }))?.ball_carrier?.team).toBe('unclear')
  })

  it('keeps only the digits of a jersey number, and nothing when none was given', () => {
    expect(parsePossessionCheck(raw({ ball_carrier_number: '#22' }))?.ball_carrier?.jersey_number).toBe('22')
    expect(parsePossessionCheck(raw())?.ball_carrier?.jersey_number).toBe('')
  })

  it('tells the main read which side the scouted team is on', () => {
    const block = buildPossessionFactBlock(parsePossessionCheck(raw())!, 'Warriors')
    expect(block).toContain('Warriors are on DEFENSE')
    expect(block).toContain('opponent_possession to "defense"')
    expect(buildPossessionFactBlock(parsePossessionCheck(raw({ play_kind: 'punt' }))!, 'Warriors')).toBe('')
  })
})

describe('ball carriers in the report', () => {
  it('groups by legible number, else by pre-snap spot, scouted team only', () => {
    const clip = (label: string, team: string, position: string, jersey_number = '') => ({
      clip_label: label, opponent_possession: 'offense' as const,
      possession_check: { ball_carrier: { team, position, jersey_number } },
    })
    const report = aggregateScoutReport([
      clip('Clip 40', 'scouted', 'tailback', '22'),
      clip('Clip 41', 'scouted', 'Tailback', '22'),
      clip('Clip 44', 'scouted', 'fullback'),
      clip('Clip 45', 'other', 'tailback', '5'),
    ])
    expect(report.offense.ball_carriers).toEqual([
      { identifier: '#22 (tailback)', carries: 2, clip_labels: ['Clip 40', 'Clip 41'] },
      { identifier: 'fullback', carries: 1, clip_labels: ['Clip 44'] },
    ])
  })
})

describe('touchdowns and coach tags in the report', () => {
  const snap = (result: string, gain = 40) => ({ result, gain_yards: gain, play_type: 'power', formation: 'double_wing' })
  const offenseClip = (label: string, touchdown: string | undefined, extra: Record<string, unknown> = {}) => ({
    clip_label: label,
    opponent_possession: 'offense' as const,
    offensive_snaps: [snap('touchdown')] as never,
    possession_check: touchdown === undefined ? undefined : { play_kind: 'scrimmage', offense: 'scouted', touchdown },
    ...extra,
  })

  it('counts a touchdown only when the possession check also saw it', () => {
    const report = aggregateScoutReport([
      offenseClip('Clip 35', 'unclear'),
      offenseClip('Clip 36', 'no'),
      offenseClip('Clip 53', 'yes'),
    ])
    const tds = report.offense.explosive_plays.filter((p) => p.result === 'touchdown').map((p) => p.clip)
    expect(tds).toEqual(['Clip 53'])
    // The long gain itself still counts as an explosive play.
    expect(report.offense.explosive_plays).toHaveLength(3)
  })

  it('keeps touchdowns on clips scouted before the check existed', () => {
    const report = aggregateScoutReport([offenseClip('Clip 35', undefined)])
    expect(report.offense.explosive_plays[0].result).toBe('touchdown')
  })

  it('charts no scrimmage snap from a kickoff', () => {
    const report = aggregateScoutReport([
      offenseClip('Clip 65', 'yes', { possession_check: { play_kind: 'kickoff', offense: 'scouted', touchdown: 'yes' } }),
    ])
    expect(report.offense.explosive_plays).toHaveLength(0)
  })

  it("lets the coach's tag override the model's possession read", () => {
    const report = aggregateScoutReport([
      offenseClip('Clip 41', 'no', {
        coach_side: 'defense',
        possession_check: {
          play_kind: 'scrimmage', offense: 'scouted', touchdown: 'no',
          ball_carrier: { team: 'scouted', position: 'tailback', jersey_number: '20' },
        },
      }),
    ])
    expect(report.evidence_sufficiency.offensive_clips).toBe(0)
    expect(report.evidence_sufficiency.defensive_clips).toBe(1)
    expect(report.offense.explosive_plays).toHaveLength(0)
    // The carrier was the other team's tailback, so he is not on their list.
    expect(report.offense.ball_carriers).toEqual([])
  })
})

describe('passes the main read filed as runs', () => {
  const runClip = (pass: Record<string, string> | undefined) => ({
    clip_label: 'Clip 36',
    opponent_possession: 'offense' as const,
    offensive_snaps: [{ play_type: 'outside_run', result: 'gain', gain_yards: 12, ball_carrier: 'rb' }] as never,
    possession_check: { play_kind: 'scrimmage', offense: 'scouted', touchdown: 'no', pass },
  })

  it('turns a run into a pass when the check saw the ball thrown', () => {
    const report = aggregateScoutReport([runClip({ thrown: 'yes', result: 'complete' })])
    expect(report.offense.profile.runPass).toEqual({ readable: 1, runs: 0, passes: 1 })
    expect(report.offense.explosive_plays[0]).toMatchObject({ play_type: 'play_action_pass', gain: 12 })
  })

  it('records an incompletion with no gain', () => {
    const report = aggregateScoutReport([runClip({ thrown: 'yes', result: 'incomplete' })])
    expect(report.offense.profile.runPass.passes).toBe(1)
    expect(report.offense.explosive_plays).toHaveLength(0)
  })

  it('leaves the run alone when no throw was seen', () => {
    const report = aggregateScoutReport([runClip({ thrown: 'no', result: 'unclear' })])
    expect(report.offense.profile.runPass).toEqual({ readable: 1, runs: 1, passes: 0 })
  })

  it('reads the throw out of the model answer and tells the main read', () => {
    const check = parseWith({ ...raw({ offense_jersey: 'black', defense_jersey: 'white' }), ball_thrown: 'Yes', pass_result: 'complete' }, WARRIORS)!
    expect(check.pass).toEqual({ thrown: 'yes', result: 'complete' })
    expect(buildPossessionFactBlock(check, 'Warriors')).toContain('THROWN')
  })
})
