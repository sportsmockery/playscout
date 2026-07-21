import { describe, it, expect } from 'vitest'
import { getRoute, MODEL_ROUTES, type AIJobType } from './model-router'

const ALL_JOB_TYPES: AIJobType[] = [
  'frame_observation', 'sequence_analysis', 'assignment_grading', 'mistake_detection',
  'tendency_update', 'report_generation', 'quick_question', 'deep_analysis',
  'practice_plan', 'game_strategy', 'football_knowledge',
]

describe('getRoute', () => {
  it('has a route for every declared AIJobType — no job type silently falls through', () => {
    for (const jobType of ALL_JOB_TYPES) {
      const route = getRoute(jobType)
      expect(route, `missing route for ${jobType}`).toBeDefined()
      expect(route.provider).toBeTruthy()
      expect(route.model).toBeTruthy()
    }
  })

  it('routes vision-heavy jobs (frame_observation, assignment_grading) to google', () => {
    expect(getRoute('frame_observation').provider).toBe('google')
    expect(getRoute('assignment_grading').provider).toBe('google')
  })

  it('routes reasoning jobs (deep_analysis, practice_plan) to anthropic', () => {
    expect(getRoute('deep_analysis').provider).toBe('anthropic')
    expect(getRoute('practice_plan').provider).toBe('anthropic')
  })

  it('routes football_knowledge to perplexity', () => {
    expect(getRoute('football_knowledge').provider).toBe('perplexity')
  })

  it('MODEL_ROUTES and getRoute agree — getRoute is not silently overriding the table', () => {
    for (const jobType of ALL_JOB_TYPES) {
      expect(getRoute(jobType)).toEqual(MODEL_ROUTES[jobType])
    }
  })
})
