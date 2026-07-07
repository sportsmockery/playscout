import { createClient } from '@/lib/supabase/server'
import type { Team, Player, Video, PositionAnalysisResult, TeamTendency, MistakeEvent, Playbook, PlaybookAnalysis } from './types'

// Alias for server component compatibility
export const createServerClient = createClient

export async function getTeamById(teamId: string): Promise<Team | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('teams').select('*').eq('id', teamId).single()
  return data
}

export async function getTeams(userId: string): Promise<Team[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('teams')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getRecentAnalyses(userId: string, limit = 5): Promise<PositionAnalysisResult[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('position_analysis_results')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getTeamsByOrg(organizationId: string): Promise<Team[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('teams').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })
  return data ?? []
}

export async function getPlayersByTeam(teamId: string): Promise<Player[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('players').select('*').eq('team_id', teamId).order('jersey_number')
  return data ?? []
}

export async function getVideosByTeam(teamId: string): Promise<Video[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('videos').select('*').eq('team_id', teamId).order('created_at', { ascending: false })
  return data ?? []
}

export async function getVideoById(videoId: string): Promise<Video | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('videos').select('*').eq('id', videoId).single()
  return data
}

export async function getRecentAnalysis(teamId: string, limit = 10): Promise<PositionAnalysisResult[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('position_analysis_results')
    .select('*, players(first_name, last_name, primary_position)')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getTeamTendencies(teamId: string): Promise<TeamTendency[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('team_tendencies')
    .select('*')
    .eq('team_id', teamId)
    .order('confidence', { ascending: false })
  return data ?? []
}

export async function getRecentMistakes(teamId: string, limit = 20): Promise<MistakeEvent[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('mistake_events')
    .select('*')
    .eq('team_id', teamId)
    .in('severity', ['moderate', 'major', 'game_changing'])
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getTeamContext(teamId: string) {
  const [team, recentAnalysis, tendencies, mistakes] = await Promise.all([
    getTeamById(teamId),
    getRecentAnalysis(teamId, 10),
    getTeamTendencies(teamId),
    getRecentMistakes(teamId, 20),
  ])
  return { team, recentAnalysis, tendencies, mistakes }
}

export async function getUserOrganization(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('organization_members')
    .select('*, organizations(*)')
    .eq('user_id', userId)
    .single()
  return data
}

export async function getPlaybooksByTeam(teamId: string): Promise<Playbook[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('playbooks')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getPlaybookAnalyses(playbookId: string): Promise<PlaybookAnalysis[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('playbook_analyses')
    .select('*')
    .eq('playbook_id', playbookId)
    .order('created_at', { ascending: false })
  return data ?? []
}
