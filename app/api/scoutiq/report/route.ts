import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'
import { guardAIRequest } from '@/lib/ai/guard'
import { getRoute } from '@/lib/ai/model-router'
import { callClaude } from '@/lib/ai/providers/anthropic'
import { recordUsage } from '@/lib/ai/record-usage'
import { getPlayersByTeam, getPlaybooksByTeam, getPlaybookPlays } from '@/lib/db/queries'
import { aggregateScoutReport, type ScoutClipEvidence } from '@/lib/intelligence/scoutiq-aggregate'
import { buildScoutIQGamePlanPrompt, type ScoutIQGamePlan } from '@/lib/intelligence/modules/scoutiq-gameplan'
import { applyDrillSafetyFilter } from '@/lib/intelligence/safety'

export const runtime = 'nodejs'
export const maxDuration = 300

function buildRosterSummary(players: Awaited<ReturnType<typeof getPlayersByTeam>>): string {
  if (!players.length) return '(no roster on file)'
  const byPosition = players
    .filter((p) => p.primary_position)
    .map((p) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() + (p.primary_position ? ` (${p.primary_position})` : ''))
  return `Roster (${players.length} players): ${byPosition.slice(0, 25).join(', ')}${players.length > 25 ? '...' : ''}`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { teamId, opponentId } = body as { teamId?: string; opponentId?: string }
    if (!teamId || !opponentId) {
      return NextResponse.json({ error: 'teamId and opponentId are required.' }, { status: 400 })
    }

    const access = await requireTeamMember(teamId, { writeRoles: WRITE_ROLES })
    if (access.error) return access.error

    const blocked = await guardAIRequest(supabase, user.id, teamId)
    if (blocked) return blocked

    const { data: opponent, error: oppErr } = await supabase
      .from('opponents')
      .select('id, name, age_group, team_id')
      .eq('id', opponentId)
      .single()
    if (oppErr || !opponent || opponent.team_id !== teamId) {
      return NextResponse.json({ error: 'Opponent not found for this team.' }, { status: 404 })
    }

    const { data: opponentVideos } = await supabase
      .from('videos')
      .select('id')
      .eq('team_id', teamId)
      .eq('opponent_id', opponentId)
      .eq('film_type', 'opponent')
    const videoIds = (opponentVideos ?? []).map((v) => v.id)

    if (!videoIds.length) {
      return NextResponse.json(
        { error: `No opponent film uploaded for ${opponent.name} yet. Upload and scout at least one clip first.` },
        { status: 400 }
      )
    }

    const { data: scoutResults } = await supabase
      .from('position_analysis_results')
      .select('video_id, evidence')
      .eq('module_key', 'SCOUTIQ')
      .in('video_id', videoIds)

    if (!scoutResults?.length) {
      return NextResponse.json(
        { error: `No SCOUTIQ analysis has been run on ${opponent.name}'s film yet. Run SCOUTIQ on each clip first.` },
        { status: 400 }
      )
    }

    const clips: ScoutClipEvidence[] = scoutResults.map((r) => (r.evidence as ScoutClipEvidence) ?? {})
    const aggregated = aggregateScoutReport(clips)
    const basedOnVideoIds = [...new Set(scoutResults.map((r) => r.video_id))]

    const [{ data: team }, players, playbooks] = await Promise.all([
      supabase.from('teams').select('name, age_group, offensive_style, defensive_style, game_type').eq('id', teamId).single(),
      getPlayersByTeam(teamId),
      getPlaybooksByTeam(teamId),
    ])

    let ownPlaybookSummary = '(no playbook on file)'
    if (playbooks.length) {
      const latest = playbooks[0]
      const plays = await getPlaybookPlays(latest.id)
      const playNames = plays.map((p) => p.play_name).filter(Boolean).slice(0, 20)
      ownPlaybookSummary = `Playbook "${latest.title}": ${playNames.join(', ') || `${plays.length} plays on file`}`
    }

    const systemPrompt = buildScoutIQGamePlanPrompt({
      opponentName: opponent.name,
      opponentAgeGroup: opponent.age_group,
      teamName: team?.name,
      teamAgeGroup: team?.age_group,
      teamOffensiveStyle: team?.offensive_style,
      teamDefensiveStyle: team?.defensive_style,
      gameType: team?.game_type,
      aggregated,
      ownRosterSummary: buildRosterSummary(players),
      ownPlaybookSummary,
    })

    const route = getRoute('game_strategy')
    const result = await callClaude(route.model, systemPrompt, [
      { role: 'user', content: 'Generate the game plan now, following the JSON schema exactly.' },
    ], 3000)

    await recordUsage(supabase, {
      teamId, userId: user.id, jobType: 'game_strategy',
      provider: route.provider, model: route.model,
      inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
    })

    let gamePlan: ScoutIQGamePlan
    try {
      const cleaned = result.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
      gamePlan = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: `Invalid JSON from model: ${result.text.slice(0, 300)}` }, { status: 500 })
    }

    // Belt-and-suspenders drill safety filter on the practice recommendations.
    gamePlan.practice_week_focus = applyDrillSafetyFilter(gamePlan.practice_week_focus ?? [], team?.game_type).drills

    const { data: saved, error: saveErr } = await supabase
      .from('scout_reports')
      .insert({
        team_id: teamId,
        opponent_id: opponentId,
        based_on_video_ids: basedOnVideoIds,
        offensive_tendencies: aggregated.offensive_tendencies,
        defensive_tendencies: aggregated.defensive_tendencies,
        formations: aggregated.formations,
        target_players: aggregated.target_players,
        situational_tells: aggregated.situational_tells,
        game_plan: gamePlan,
        evidence_sufficiency: aggregated.evidence_sufficiency,
        summary: gamePlan.summary,
        model_provider: route.provider,
        model_name: route.model,
      })
      .select()
      .single()

    if (saveErr) {
      console.error('scout_reports save error:', saveErr)
      return NextResponse.json({ error: `Game plan generated but could not be saved: ${saveErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ scoutReport: saved })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ScoutIQ report generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
