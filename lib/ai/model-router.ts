export type AIJobType =
  | 'frame_observation'
  | 'sequence_analysis'
  | 'assignment_grading'
  | 'mistake_detection'
  | 'tendency_update'
  | 'report_generation'
  | 'quick_question'
  | 'deep_analysis'
  | 'practice_plan'
  | 'game_strategy'
  | 'football_knowledge'

export interface AIRoute { provider: string; model: string }

export const MODEL_ROUTES: Record<AIJobType, AIRoute> = {
  frame_observation:   { provider: 'google',    model: 'gemini-2.5-pro' },
  sequence_analysis:   { provider: 'google',    model: 'gemini-2.5-pro' },
  assignment_grading:  { provider: 'google',    model: 'gemini-2.5-pro' },
  mistake_detection:   { provider: 'google',    model: 'gemini-2.5-pro' },
  tendency_update:     { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  report_generation:   { provider: 'anthropic', model: 'claude-opus-4-5' },
  quick_question:      { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  deep_analysis:       { provider: 'anthropic', model: 'claude-opus-4-5' },
  practice_plan:       { provider: 'anthropic', model: 'claude-opus-4-5' },
  game_strategy:       { provider: 'anthropic', model: 'claude-opus-4-5' },
  football_knowledge:  { provider: 'perplexity', model: 'sonar-pro' },
}

export function getRoute(jobType: AIJobType): AIRoute {
  return MODEL_ROUTES[jobType]
}
