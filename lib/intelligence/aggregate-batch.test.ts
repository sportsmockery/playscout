import { describe, it, expect } from 'vitest'
import { aggregateBatch, type BatchClipResult } from './aggregate-batch'
import { parseBatchSummary } from './batch-summary'
import type { PlayerGrade } from './schemas'

const clip = (over: Partial<BatchClipResult> = {}): BatchClipResult => ({
  analysisId: 'a1',
  videoId: 'v1',
  videoTitle: 'Clip 1',
  overallScore: 75,
  summary: 'Solid rep.',
  strengths: [],
  weaknesses: [],
  drills: [],
  ...over,
})

const pg = (over: Partial<PlayerGrade> = {}): PlayerGrade => ({
  identifier: '#54',
  jersey_number: '54',
  position: 'LG',
  role_on_play: 'combo to backer',
  execution: 80,
  difficulty: 3,
  impact: 'moderate',
  note: 'sealed it',
  identification_confidence: 0.9,
  grade: 80,
  ...over,
})

describe('aggregateBatch', () => {
  it('averages scores and names the best and weakest clips', () => {
    const agg = aggregateBatch([
      clip({ videoTitle: 'A', overallScore: 90 }),
      clip({ videoTitle: 'B', overallScore: 70 }),
      clip({ videoTitle: 'C', overallScore: 80 }),
    ])
    expect(agg.clipsAnalyzed).toBe(3)
    expect(agg.averageScore).toBe(80)
    expect(agg.bestClip).toEqual({ videoTitle: 'A', score: 90 })
    expect(agg.worstClip).toEqual({ videoTitle: 'B', score: 70 })
  })

  it('ignores unscored clips when averaging rather than treating them as zero', () => {
    const agg = aggregateBatch([clip({ overallScore: 80 }), clip({ overallScore: null })])
    expect(agg.averageScore).toBe(80)
    expect(agg.clipsAnalyzed).toBe(2)
  })

  it('counts how many clips each recurring point appears in', () => {
    const agg = aggregateBatch([
      clip({ weaknesses: ['Pad level rises out of the stance'] }),
      clip({ weaknesses: ['Pad level rises out of the stance on the backside'] }),
      clip({ weaknesses: ['Late off the snap'] }),
    ])
    const padLevel = agg.recurringWeaknesses.find((w) => w.text.startsWith('Pad level'))
    expect(padLevel?.clips).toBe(2)
    expect(agg.recurringWeaknesses.find((w) => w.text === 'Late off the snap')?.clips).toBe(1)
  })

  it('counts one clip repeating itself only once', () => {
    const agg = aggregateBatch([clip({ weaknesses: ['Slow off the ball', 'slow off the ball!'] })])
    expect(agg.recurringWeaknesses[0].clips).toBe(1)
  })

  it('rolls a player up across clips by roster id, jersey, then description', () => {
    const agg = aggregateBatch([
      clip({ playerGrades: [pg({ grade: 90 }), pg({ identifier: 'left tackle', jersey_number: null, position: 'LT', grade: 60 })] }),
      clip({ playerGrades: [pg({ grade: 70 }), pg({ identifier: 'left tackle', jersey_number: null, position: 'LT', grade: 80 })] }),
    ])
    const fiftyFour = agg.playerRollup.find((p) => p.jerseyNumber === '54')
    expect(fiftyFour?.reps).toBe(2)
    expect(fiftyFour?.averageGrade).toBe(80)
    expect(fiftyFour?.bestGrade).toBe(90)
    expect(fiftyFour?.worstGrade).toBe(70)

    const tackle = agg.playerRollup.find((p) => p.identifier === 'left tackle')
    expect(tackle?.reps).toBe(2)
    expect(tackle?.averageGrade).toBe(70)
  })

  it('keeps two same-jersey players apart when a roster id disambiguates them', () => {
    const agg = aggregateBatch([
      clip({
        playerGrades: [
          pg({ player_id: 'offense-kid', grade: 90 }),
          pg({ player_id: 'defense-kid', grade: 50 }),
        ],
      }),
    ])
    expect(agg.playerRollup).toHaveLength(2)
  })

  it('reports a trend only once a player has enough reps to have one', () => {
    const few = aggregateBatch([clip({ playerGrades: [pg({ grade: 60 })] }), clip({ playerGrades: [pg({ grade: 90 })] })])
    expect(few.playerRollup[0].trend).toBeNull()

    const many = aggregateBatch([
      clip({ playerGrades: [pg({ grade: 60 })] }),
      clip({ playerGrades: [pg({ grade: 60 })] }),
      clip({ playerGrades: [pg({ grade: 80 })] }),
      clip({ playerGrades: [pg({ grade: 80 })] }),
    ])
    expect(many.playerRollup[0].trend).toBe(20)
  })

  it('counts mistakes by category and keeps the worst severity seen', () => {
    const agg = aggregateBatch([
      clip({ mistakes: [{ title: 'a', category: 'missed_block', severity: 'minor' }] }),
      clip({
        mistakes: [
          { title: 'b', category: 'missed_block', severity: 'game_changing' },
          { title: 'c', category: 'bad_pursuit_angle', severity: 'moderate' },
        ],
      }),
    ])
    expect(agg.mistakeRollup[0]).toEqual({ category: 'missed_block', count: 2, worstSeverity: 'game_changing' })
  })

  it('handles an empty batch without dividing by zero', () => {
    const agg = aggregateBatch([])
    expect(agg.averageScore).toBeNull()
    expect(agg.bestClip).toBeNull()
    expect(agg.playerRollup).toEqual([])
  })
})

describe('parseBatchSummary', () => {
  const valid = {
    headline: 'Backside cutoffs are the problem.',
    cumulative_summary: 'In 7 of 11 clips the backside guard lost his fit.',
    what_repeats: [{ pattern: 'Backside guard late', clips_seen: 7, why_it_matters: 'kills the cutback' }],
    per_video: [{ video_id: 'v1', comment: 'Frame 6: guard beaten inside.' }],
    priorities: [{ title: 'Fix the combo', why: 'seen in 7 clips', fix: 'hip-to-hip landmark drill' }],
    practice_focus: ['Combo-block fit progression, cue "eyes to the backer"'],
    evidence_note: '11 clips, sideline film, numbers unreadable on the far hash.',
  }

  it('parses a clean JSON response', () => {
    expect(parseBatchSummary(JSON.stringify(valid)).headline).toBe(valid.headline)
  })

  it('tolerates a markdown fence the model added anyway', () => {
    expect(parseBatchSummary('```json\n' + JSON.stringify(valid) + '\n```').per_video).toHaveLength(1)
  })

  it('rejects malformed JSON rather than half-rendering a report', () => {
    expect(() => parseBatchSummary('not json at all')).toThrow(/Invalid JSON/)
  })

  it('rejects a valid-JSON-but-wrong-shape response', () => {
    expect(() => parseBatchSummary(JSON.stringify({ headline: 'only this' }))).toThrow(/Malformed/)
  })
})
