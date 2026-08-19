import { describe, it, expect } from 'vitest'
import { resolvePlayerIdentity, rankPlayerGrades, MIN_NUMBER_CONFIDENCE } from './player-grades'
import { normalizeRoleLabel, aggregateBatch, type BatchClipResult } from './aggregate-batch'
import type { PlayerGrade } from './schemas'

const roster = [
  { id: 'p-54', jersey_number: 54, first_name: 'Andre', last_name: 'Guard' },
  { id: 'p-7', jersey_number: 7, first_name: 'Bo', last_name: 'Back' },
]

/** A well-evidenced number: cited frame, high confidence, on the roster. */
const legible = (over: Partial<PlayerGrade> = {}): PlayerGrade => ({
  identifier: '#54',
  jersey_number: '54',
  jersey_number_frame: 6,
  position: 'LG',
  role_on_play: 'combo to backer',
  execution: 85,
  difficulty: 3,
  impact: 'moderate',
  note: 'Frame 6: #54 sealed the 3-tech.',
  identification_confidence: 0.9,
  ...over,
})

describe('resolvePlayerIdentity — the fabricated-number gates', () => {
  it('keeps a number that cited a frame, is confident, and is on the roster', () => {
    const id = resolvePlayerIdentity(legible(), roster)
    expect(id.jerseyNumber).toBe('54')
    expect(id.playerId).toBe('p-54')
    expect(id.identifier).toBe('#54 A. Guard')
    expect(id.numberRejectedReason).toBeNull()
  })

  it('rejects a number with no frame behind it — the fabrication signature', () => {
    const id = resolvePlayerIdentity(legible({ jersey_number_frame: null }), roster)
    expect(id.jerseyNumber).toBeNull()
    expect(id.identifier).toBe('LG')
    expect(id.numberRejectedReason).toMatch(/no frame/i)
  })

  it('rejects a number the model itself was unsure of', () => {
    const id = resolvePlayerIdentity(
      legible({ identification_confidence: MIN_NUMBER_CONFIDENCE - 0.01 }),
      roster
    )
    expect(id.jerseyNumber).toBeNull()
    expect(id.numberRejectedReason).toMatch(/legible/i)
  })

  it('rejects a number nobody on the roster wears — the QB #30 case', () => {
    const id = resolvePlayerIdentity(
      legible({ identifier: '#30', jersey_number: '30', position: 'QB' }),
      roster
    )
    expect(id.jerseyNumber).toBeNull()
    expect(id.identifier).toBe('QB')
    expect(id.numberRejectedReason).toMatch(/no #30 on this roster/i)
  })

  it('still trusts a well-evidenced number when the team has no roster on file', () => {
    const id = resolvePlayerIdentity(legible({ jersey_number: '30', identifier: '#30' }), [])
    expect(id.jerseyNumber).toBe('30')
  })

  it('keeps a roster-valid but duplicated number without attributing it to a player', () => {
    const dupes = [
      { id: 'a', jersey_number: 22 },
      { id: 'b', jersey_number: 22 },
    ]
    const id = resolvePlayerIdentity(legible({ jersey_number: '22', identifier: '#22' }), dupes)
    expect(id.jerseyNumber).toBe('22')
    expect(id.playerId).toBeNull()
  })

  it('falls back to the descriptive label when there is no number at all', () => {
    const id = resolvePlayerIdentity(
      legible({ identifier: 'backside safety near the hash', jersey_number: null, jersey_number_frame: null }),
      roster
    )
    expect(id.identifier).toBe('backside safety near the hash')
    expect(id.numberRejectedReason).toBeNull()
  })
})

describe('rankPlayerGrades — a rejected number leaves no trace', () => {
  it('scrubs the discarded number out of the coach-facing note', () => {
    const [only] = rankPlayerGrades(
      [legible({ identifier: '#30', jersey_number: '30', position: 'QB', note: 'Frame 4: #30 held the safety.' })],
      roster
    )
    expect(only.note).not.toContain('#30')
    expect(only.note).toContain('QB')
    expect(only.jersey_number).toBeNull()
    expect(only.number_rejected_reason).toBeTruthy()
  })

  it('leaves a verified number in the note untouched', () => {
    const [only] = rankPlayerGrades([legible()], roster)
    expect(only.note).toContain('#54')
  })
})

describe('normalizeRoleLabel — one player, one row', () => {
  it('collapses the phrasings that fragmented the rollup', () => {
    for (const label of ['Right Guard', 'right guard (white jersey)', 'Pulling Right Guard', 'RG', '#85 Right Guard']) {
      expect(normalizeRoleLabel(label)).toBe('right guard')
    }
  })

  it('takes the primary role from a compound label', () => {
    expect(normalizeRoleLabel('Fullback / Lead Blocker')).toBe('fullback')
  })

  it('maps position codes and synonyms to one spot', () => {
    expect(normalizeRoleLabel('TB')).toBe('running back')
    expect(normalizeRoleLabel('Tailback')).toBe('running back')
    expect(normalizeRoleLabel('QB')).toBe('quarterback')
  })

  it('keeps left and right apart — those are different players', () => {
    expect(normalizeRoleLabel('LT')).not.toBe(normalizeRoleLabel('RT'))
  })
})

describe('aggregateBatch — rollup identity after hardening', () => {
  const clip = (grades: PlayerGrade[]): BatchClipResult => ({
    analysisId: 'a', videoId: 'v', videoTitle: 'clip',
    overallScore: 75, summary: null, strengths: [], weaknesses: [], drills: [],
    playerGrades: grades,
  })

  it('merges one player described three ways into a single row', () => {
    const agg = aggregateBatch([
      clip([{ ...legible({ position: 'Right Guard', jersey_number: null }), grade: 80, identifier: 'Right Guard' }]),
      clip([{ ...legible({ position: 'RG', jersey_number: null }), grade: 70, identifier: 'RG' }]),
      clip([{ ...legible({ position: 'Pulling Right Guard', jersey_number: null }), grade: 60, identifier: 'Pulling Right Guard (white jersey)' }]),
    ])
    expect(agg.playerRollup).toHaveLength(1)
    expect(agg.playerRollup[0].reps).toBe(3)
    expect(agg.playerRollup[0].averageGrade).toBe(70)
    expect(agg.playerRollup[0].identifiedBy).toBe('role')
    expect(agg.playerRollup[0].identifier).toBe('Right Guard')
  })

  it('marks a roster-matched row as a real player, not a role', () => {
    const agg = aggregateBatch([
      clip([{ ...legible(), grade: 80, player_id: 'p-54', jersey_number: '54' }]),
    ])
    expect(agg.playerRollup[0].identifiedBy).toBe('roster')
  })
})
