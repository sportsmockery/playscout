import { NextRequest, NextResponse } from 'next/server'
import { analyzePosition } from '@/lib/intelligence/analyze-position'
import { saveAnalysisResult } from '@/lib/intelligence/save-analysis'
import { PositionAnalysisInputSchema } from '@/lib/intelligence/schemas'
import { getVideoFramesBase64 } from '@/lib/intelligence/get-frames'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'
import { guardAIRequest } from '@/lib/ai/guard'

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

    // Explicit app-layer check before any paid AI work or frame access —
    // RLS's insert-role policy only fires at the final save, by which point
    // the (costly) analysis has already run against another team's film.
    const access = await requireTeamMember(input.teamId, { writeRoles: WRITE_ROLES })
    if (access.error) return access.error

    const blocked = await guardAIRequest(supabase, user.id, input.teamId)
    if (blocked) return blocked

    // Read level/age_group/game_type from the team row server-side so grading
    // calibration (youth → varsity) and the flag safety gate don't depend on the
    // client remembering to send them. Server value wins.
    const { data: teamRow } = await supabase
      .from('teams').select('game_type, level, age_group').eq('id', input.teamId).maybeSingle()
    const tr = teamRow as { game_type?: string; level?: string; age_group?: string } | null
    if (tr) {
      input.team = {
        ...(input.team ?? {}),
        ...(tr.game_type ? { game_type: tr.game_type as 'flag' | 'tackle' | 'rookie_tackle' } : {}),
        ...(tr.level ? { level: tr.level } : {}),
        ...(tr.age_group ? { age_group: tr.age_group } : {}),
      }
    }

    let frames = input.frames
    if (!frames.length && input.videoId) {
      frames = await getVideoFramesBase64(input.videoId, supabase)
    }
    if (!frames.length) {
      return NextResponse.json(
        { error: 'No film frames available yet. Has this video finished processing?' },
        { status: 400 }
      )
    }

    const result = await analyzePosition({ ...input, frames }, user.id, supabase)

    // Result row + MISTAKEIQ mistakes + TEAMIQ tendencies + team memory.
    // Shared with the background batch runner so both paths persist alike.
    const analysisId = await saveAnalysisResult(supabase, input, result)

    return NextResponse.json({ result, analysisId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
