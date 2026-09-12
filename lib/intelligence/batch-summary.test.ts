import { describe, it, expect } from 'vitest'
import { buildBatchSummaryPrompt } from './batch-summary'
import type { BatchAggregate, BatchClipResult } from './aggregate-batch'

const AGGREGATE: BatchAggregate = {
  clipsAnalyzed: 2,
  averageScore: 59,
  bestClip: null,
  worstClip: null,
  playsObserved: 2,
  recurringStrengths: [],
  recurringWeaknesses: [],
  topDrills: [],
  playerRollup: [],
  mistakeRollup: [],
}

const CLIPS: BatchClipResult[] = [
  {
    analysisId: 'a1',
    videoId: 'v1',
    videoTitle: 'Clip 1',
    overallScore: 59,
    summary: 'Play-side end sealed inside on a perimeter run.',
    strengths: [],
    weaknesses: ['soft edge'],
    drills: [],
  },
]

function build(moduleKey: string) {
  return buildBatchSummaryPrompt({
    moduleKey,
    teamName: 'Tinley Park Bulldogs',
    opponentName: 'Homewood Wildcats',
    clips: CLIPS,
    aggregate: AGGREGATE,
  })
}

describe('buildBatchSummaryPrompt — who the report is for', () => {
  // The bug: this prompt is shared by every module, and every OTHER module
  // grades the reader's own team. So it named the coach's team at the top of a
  // page of findings about somebody else, and described its own output fields
  // as "what to fix first" and "drills for this week". The model did as asked
  // and produced a plan to improve the team the coach is about to play.
  it('tells a scouting report the film is the opponent and the reader is not', () => {
    const prompt = build('SCOUTIQ')
    expect(prompt).toContain('SCOUTING REPORT ON AN OPPONENT')
    expect(prompt).toContain('Homewood Wildcats — every finding below describes THEM')
    expect(prompt).toContain('coaching staff of Tinley Park Bulldogs')
  })

  it('forbids coaching the opponent outright, rather than hoping framing carries it', () => {
    const prompt = build('SCOUTIQ')
    expect(prompt).toContain('NEVER write a coaching correction for Homewood Wildcats')
    expect(prompt).toContain('scouting them, not coaching them')
  })

  it('turns the recommendation fields into actions for OUR team', () => {
    const prompt = build('SCOUTIQ')
    expect(prompt).toContain('how Tinley Park Bulldogs attacks them first')
    // The own-team phrasings must be gone, not merely outweighed.
    expect(prompt).not.toContain('"title": "what to fix first"')
    expect(prompt).not.toContain('drills for this week, each naming the weakness it fixes')
  })

  it('leaves every other module grading the coach’s own team, as before', () => {
    const prompt = build('RANKERIQ')
    expect(prompt).toContain('what to fix first')
    expect(prompt).toContain('drills for this week')
    expect(prompt).not.toContain('SCOUTING REPORT ON AN OPPONENT')
    expect(prompt).not.toContain('attacks them first')
  })

  it('still reads sensibly when the opponent was never named', () => {
    const prompt = buildBatchSummaryPrompt({
      moduleKey: 'SCOUTIQ',
      teamName: 'Tinley Park Bulldogs',
      clips: CLIPS,
      aggregate: AGGREGATE,
    })
    expect(prompt).toContain('the opponent')
    expect(prompt).not.toContain('undefined')
    expect(prompt).not.toContain('null')
  })
})
