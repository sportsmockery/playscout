import { createEmbedding } from '@/lib/ai/providers/openai'
import { createClient } from '@/lib/supabase/server'
import type { PositionAnalysisResult } from './schemas'

export async function saveToTeamMemory(
  teamId: string,
  result: PositionAnalysisResult,
  context: { moduleKey: string; playerName?: string; videoTitle?: string; playLabel?: string }
) {
  try {
    const content = buildMemorySummary(result, context)
    const embedding = await createEmbedding(content)
    const supabase = await createClient()

    await supabase.from('team_memory').insert({
      team_id: teamId,
      memory_type: context.moduleKey,
      title: `${context.moduleKey}${context.playerName ? ` — ${context.playerName}` : ''}${context.videoTitle ? ` — ${context.videoTitle}` : ''} — ${new Date().toLocaleDateString()}`,
      content,
      source: 'video_analysis',
      embedding: JSON.stringify(embedding),
      confidence: result.confidence,
    })
  } catch (err) {
    console.error('saveToTeamMemory failed (non-blocking):', err)
  }
}

function buildMemorySummary(
  result: PositionAnalysisResult,
  context: { moduleKey: string; playerName?: string; playLabel?: string }
): string {
  const lines = [
    `[${context.moduleKey}] ${context.playerName ?? 'Team'} — Overall: ${result.overall_score}/100`,
    `Summary: ${result.summary}`,
    `Strengths: ${result.strengths.join(', ')}`,
    `Weaknesses: ${result.weaknesses.join(', ')}`,
    `Recommended drills: ${result.drills.join(', ')}`,
    `Confidence: ${result.confidence}`,
  ]
  if (context.playLabel) lines.push(`Play context: ${context.playLabel}`)
  return lines.join('\n')
}

export async function getRelevantMemory(teamId: string, question: string, limit = 5) {
  try {
    const embedding = await createEmbedding(question)
    const supabase = await createClient()

    const { data } = await supabase.rpc('match_team_memory', {
      query_embedding: JSON.stringify(embedding),
      match_team_id: teamId,
      match_threshold: 0.72,
      match_count: limit,
    })
    return data ?? []
  } catch (err) {
    console.error('getRelevantMemory failed:', err)
    return []
  }
}
