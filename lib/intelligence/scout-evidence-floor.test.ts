import { describe, it, expect } from 'vitest'
import { MIN_TENDENCY_CLIPS, splitByEvidence } from './modules/scoutiq-gameplan'
import { buildScoutIQGamePlanPrompt } from './modules/scoutiq-gameplan'
import type { AggregatedScoutReport } from './scoutiq-aggregate'
import { aggregateDefensiveSnaps } from './aggregate-defense'

/**
 * The second half of the failure a coach reported on a real 113-clip report.
 *
 * Counting was one half — fixed by the weakness vocabulary. This is the other:
 * even with perfect counts, nothing STOPPED a 2-clip observation becoming the
 * headline recommendation. The prompt asked the model to weigh the evidence,
 * it faithfully wrote "only a handful of patterns appeared in more than one
 * clip", and then built the whole plan out of 2-clip items regardless.
 *
 * A model told to weigh evidence weighs it and still uses what it has. The
 * only thing that keeps thin evidence out of a plan is not handing it over as
 * plan material.
 */
const point = (p: string, clips: number) => ({ point: p, category: 'dropback_pass' as const, clips })

describe('the evidence floor', () => {
  it('splits at three clips', () => {
    const { repeated, singleLooks } = splitByEvidence([
      point('Soft corners', 5), point('Lost contain', 3),
      point('Slow safety', 2), point('Bad angle', 1),
    ] as AggregatedScoutReport['attack_points'])
    expect(repeated.map((r) => r.clips)).toEqual([5, 3])
    expect(singleLooks.map((r) => r.clips)).toEqual([2, 1])
    expect(MIN_TENDENCY_CLIPS).toBe(3)
  })

  it('puts thin points under a heading that forbids planning on them', () => {
    const aggregated = {
      attack_points: [point('Soft corners', 5), point('One-off blitz look', 2)],
      offensive_tendencies: [], defensive_tendencies: [], formations: [],
      situational_tells: [], target_players: [], explosive_plays: [],
      defensive_profile: aggregateDefensiveSnaps([]),
      evidence_sufficiency: {
        clips_analyzed: 113, defensive_clips: 47, plays_observed: 150,
        unconfirmed_subject_clips: 0,
      },
    } as unknown as AggregatedScoutReport

    const prompt = buildScoutIQGamePlanPrompt({
      opponentName: 'LWE',
      teamName: 'Carter Andrew',
      teamLevel: 'High School',
      aggregated,
    })

    // The 5-clip point is offered as plan material; the 2-clip one is not.
    const repeatedIdx = prompt.indexOf('REPEATED')
    const singleIdx = prompt.indexOf('SINGLE LOOKS')
    expect(repeatedIdx).toBeGreaterThan(-1)
    expect(singleIdx).toBeGreaterThan(repeatedIdx)
    expect(prompt.indexOf('Soft corners')).toBeGreaterThan(repeatedIdx)
    expect(prompt.indexOf('Soft corners')).toBeLessThan(singleIdx)
    expect(prompt.indexOf('One-off blitz look')).toBeGreaterThan(singleIdx)

    expect(prompt).toContain('Build the plan out of these and nothing else')
    expect(prompt).toContain('must NOT become')
    // The denominator a coach needs to judge "5 of 47" for themselves.
    expect(prompt).toContain('of 47 clip')
  })

  it('tells the model to refuse a plan when nothing repeated', () => {
    const aggregated = {
      attack_points: [point('One-off blitz look', 2), point('Another one-off', 1)],
      offensive_tendencies: [], defensive_tendencies: [], formations: [],
      situational_tells: [], target_players: [], explosive_plays: [],
      defensive_profile: aggregateDefensiveSnaps([]),
      evidence_sufficiency: {
        clips_analyzed: 113, defensive_clips: 47, plays_observed: 150,
        unconfirmed_subject_clips: 0,
      },
    } as unknown as AggregatedScoutReport

    const prompt = buildScoutIQGamePlanPrompt({
      opponentName: 'LWE',
      teamName: 'Carter Andrew',
      teamLevel: 'High School',
      aggregated,
    })

    expect(prompt).toContain('nothing repeated across enough clips to plan around')
    expect(prompt).toContain('does not yet support a game plan')
  })
})
