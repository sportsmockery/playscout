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
