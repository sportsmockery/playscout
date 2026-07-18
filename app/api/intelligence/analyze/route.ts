import { NextRequest, NextResponse } from 'next/server'
import { analyzePosition } from '@/lib/intelligence/analyze-position'
import { saveToTeamMemory } from '@/lib/intelligence/memory'
import { PositionAnalysisInputSchema } from '@/lib/intelligence/schemas'
import { getVideoFramesBase64 } from '@/lib/intelligence/get-frames'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const input = PositionAnalysisInputSchema.parse(body)

    let frames = input.frames
    if (!frames.length && input.videoId) {
      frames = await getVideoFramesBase64(input.videoId)
    }
    if (!frames.length) {
      return NextResponse.json(
        { error: 'No film frames available yet. Has this video finished processing?' },
        { status: 400 }
      )
    }

    const result = await analyzePosition({ ...input, frames })

    // Save to DB
    const { data: saved, error } = await supabase
      .from('position_analysis_results')
      .insert({
        team_id: input.teamId,
        player_id: input.playerId ?? null,
        video_id: input.videoId ?? null,
        play_sequence_id: input.playSequenceId ?? null,
        module_key: input.moduleKey,
        overall_score: result.overall_score,
        position_scores: result.position_scores,
        reasoning: result.reasoning,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        drills: result.drills,
        summary: result.summary,
        frames_analyzed: result.framesAnalyzed,
        evidence: { frames: result.evidence_frames, confidence: result.confidence },
        model_provider: 'google',
        model_name: result.model,
      })
      .select()
      .single()

    if (error) {
      // The AI call already succeeded and cost real money, but if we can't
      // persist the result we must not tell the client it worked — a report
      // that silently vanishes on next page load is worse than a clear
      // failure the coach can retry.
      console.error('DB save error:', error)
      return NextResponse.json(
        { error: `Analysis completed but could not be saved: ${error.message}` },
        { status: 500 }
      )
    }

    // Save to team memory (async, non-blocking)
    saveToTeamMemory(input.teamId, result, {
      moduleKey: input.moduleKey,
      playerName: input.player?.name,
      videoTitle: undefined,
      playLabel: input.playSequence?.coach_label,
    }).catch(console.error)

    return NextResponse.json({ result, analysisId: saved?.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
