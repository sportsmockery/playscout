import { describe, it, expect } from 'vitest'
import { parsePossessionCheck, settledPossession, buildPossessionFactBlock, MIN_POSSESSION_CONFIDENCE } from './possession-check'
import { aggregateScoutReport } from './scoutiq-aggregate'

const raw = (over: Record<string, unknown> = {}) => ({
  play_kind: 'scrimmage', offense: 'other', offense_jersey: 'white', defense_jersey: 'black',
  how_determined: 'white over the ball', confidence: 0.9,
  ball_carrier_team: 'other', ball_carrier_position: 'tailback', ball_carrier_number: '', ...over,
})

describe('possession check', () => {
  it('settles possession only on a confident scrimmage play', () => {
    expect(settledPossession(parsePossessionCheck(raw()))).toBe('defense')
    expect(settledPossession(parsePossessionCheck(raw({ offense: 'scouted' })))).toBe('offense')
    expect(settledPossession(parsePossessionCheck(raw({ play_kind: 'kickoff' })))).toBeNull()
    expect(settledPossession(parsePossessionCheck(raw({ confidence: MIN_POSSESSION_CONFIDENCE - 0.01 })))).toBeNull()
    expect(settledPossession(parsePossessionCheck(raw({ offense: 'black team' })))).toBeNull()
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
