import { describe, it, expect } from 'vitest'
import { aggregateBatch, type BatchClipResult } from './aggregate-batch'
import type { PlayerGrade } from './schemas'

const pg = (over: Partial<PlayerGrade> = {}): PlayerGrade => ({
  identifier: 'Right Guard',
  jersey_number: null,
  jersey_number_frame: null,
  position: 'Right Guard',
  role_on_play: 'combo',
  execution: 80,
  difficulty: 3,
  impact: 'moderate',
  note: 'sealed it',
  identification_confidence: 0.8,
  grade: 80,
  ...over,
})

const clip = (grades: PlayerGrade[], over: Partial<BatchClipResult> = {}): BatchClipResult => ({
  analysisId: 'a', videoId: 'v', videoTitle: 'clip',
  overallScore: 75, summary: null, strengths: [], weaknesses: [], drills: [],
  playerGrades: grades,
  ...over,
})

describe('unconfirmed numbers that contradict themselves', () => {
  it('abandons a number seen at six different positions — the #55 case', () => {
    // One number stuck onto the whole offense across a batch is a misread,
    // not a versatile player.
    const roles = ['Right Tackle', 'Fullback', 'Right Guard', 'Left Guard', 'Running Back', 'Center']
    const agg = aggregateBatch(
      roles.map((position) =>
        clip([pg({ jersey_number: '55', identifier: '#55', position, grade: 80 })])
      )
    )

    expect(agg.playerRollup.every((p) => p.jerseyNumber === null)).toBe(true)
    expect(agg.playerRollup.every((p) => p.identifiedBy === 'role')).toBe(true)
    // Six positions become six honest role rows rather than one fictional player.
    expect(agg.playerRollup).toHaveLength(6)
  })

  it('keeps an unconfirmed number that stays at one position', () => {
    const agg = aggregateBatch([
      clip([pg({ jersey_number: '64', identifier: '#64', position: 'Right Guard', grade: 80 })]),
      clip([pg({ jersey_number: '64', identifier: '#64', position: 'RG', grade: 70 })]),
    ])
    expect(agg.playerRollup).toHaveLength(1)
    expect(agg.playerRollup[0].jerseyNumber).toBe('64')
    expect(agg.playerRollup[0].identifiedBy).toBe('number')
    expect(agg.playerRollup[0].reps).toBe(2)
  })

  it('never splits a roster-matched player, who may genuinely play several spots', () => {
    const agg = aggregateBatch([
      clip([pg({ jersey_number: '22', player_id: 'p-22', identifier: '#22', position: 'Fullback', grade: 80 })]),
      clip([pg({ jersey_number: '22', player_id: 'p-22', identifier: '#22', position: 'Right Guard', grade: 60 })]),
    ])
    expect(agg.playerRollup).toHaveLength(1)
    expect(agg.playerRollup[0].identifiedBy).toBe('roster')
    expect(agg.playerRollup[0].reps).toBe(2)
  })

  it('explains why a contradicted number was dropped', () => {
    const agg = aggregateBatch([
      clip([pg({ jersey_number: '30', identifier: '#30', position: 'Quarterback', grade: 80 })]),
      clip([pg({ jersey_number: '30', identifier: '#30', position: 'Left Guard', grade: 60 })]),
    ])
    expect(agg.playerRollup.map((p) => p.identifier).sort()).toEqual(['Left Guard', 'Quarterback'])
  })
})

describe('recurring points across real-world phrasing', () => {
  it('merges the same problem worded differently in each clip', () => {
    const agg = aggregateBatch([
      clip([], { weaknesses: ['Backside guard is late getting off the double team (frame 7)'] }),
      clip([], { weaknesses: ['The backside guard was late off the double team, frame 9'] }),
      clip([], { weaknesses: ['Late backside guard off double teams — frames 4-6'] }),
    ])
    expect(agg.recurringWeaknesses[0].clips).toBe(3)
  })

  it('does not merge genuinely different points', () => {
    const agg = aggregateBatch([
      clip([], { weaknesses: ['High pad level out of the stance'] }),
      clip([], { weaknesses: ['Missed backside cutoff block allowed pursuit'] }),
    ])
    expect(agg.recurringWeaknesses).toHaveLength(2)
    expect(agg.recurringWeaknesses.every((w) => w.clips === 1)).toBe(true)
  })

  it('still counts one clip repeating itself only once', () => {
    const agg = aggregateBatch([
      clip([], { weaknesses: ['Pad level too high at contact', 'Pad level is too high on contact'] }),
    ])
    expect(agg.recurringWeaknesses[0].clips).toBe(1)
  })

  it('prefers the shortest phrasing as the label a coach reads', () => {
    const agg = aggregateBatch([
      clip([], { weaknesses: ['Blocks stall out after initial contact due to a lack of leg drive'] }),
      clip([], { weaknesses: ['Blocks stall after contact — no leg drive'] }),
    ])
    expect(agg.recurringWeaknesses[0].text).toBe('Blocks stall after contact — no leg drive')
    expect(agg.recurringWeaknesses[0].clips).toBe(2)
  })
})
