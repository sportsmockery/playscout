import { describe, it, expect } from 'vitest'
import { classifyIntentHeuristic } from './classify-intent'

describe('classifyIntentHeuristic', () => {
  it('classifies team-specific questions', () => {
    expect(classifyIntentHeuristic('What are our biggest weaknesses on defense?')).toBe('team_specific')
    expect(classifyIntentHeuristic('How is my team doing on tackling?')).toBe('team_specific')
  })

  it('classifies rules/compliance questions', () => {
    expect(classifyIntentHeuristic('Can my 10U team do a kickoff?')).toBe('rules_compliance')
    expect(classifyIntentHeuristic('Is the Oklahoma drill allowed at youth level?')).toBe('rules_compliance')
  })

  it('classifies practice-plan questions', () => {
    expect(classifyIntentHeuristic('Build me a 90-minute practice plan for Tuesday')).toBe('practice_plan')
  })

  it('classifies game-strategy questions', () => {
    expect(classifyIntentHeuristic('What should the game plan be against this week\'s opponent?')).toBe('game_strategy')
  })

  it('returns null for general scheme questions with no team/rules/practice signal', () => {
    expect(classifyIntentHeuristic('How do I attack a 5-3 defense at 10U?')).toBeNull()
  })

  it('prioritizes team-specific over other signals when both are present', () => {
    expect(classifyIntentHeuristic('What practice drills fix our tackling weaknesses?')).toBe('team_specific')
  })
})
