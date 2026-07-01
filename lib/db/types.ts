export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'owner' | 'admin' | 'coach' | 'analyst' | 'viewer'
export type SideOfBall = 'offense' | 'defense' | 'both' | 'special_teams'
export type VideoStatus = 'uploaded' | 'processing' | 'partially_ready' | 'ready_for_review' | 'analysis_complete' | 'failed'
export type UploadStatus = 'created' | 'uploading' | 'uploaded' | 'failed' | 'cancelled'
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying'
export type MistakeSeverity = 'minor' | 'moderate' | 'major' | 'game_changing'

export interface Organization { id: string; name: string; created_by: string | null; created_at: string }
export interface OrganizationMember { id: string; organization_id: string; user_id: string; role: UserRole; created_at: string }

export interface Team {
  id: string; organization_id?: string; name: string; age_group?: string | null
  season?: string | null; league?: string | null; level?: string | null; state?: string | null
  offensive_style?: string | null; defensive_style?: string | null; notes?: string | null; created_at: string
}

export interface Player {
  id: string; team_id: string; first_name?: string | null; last_name?: string | null
  jersey_number?: number | null; primary_position?: string | null; secondary_position?: string | null
  side_of_ball?: SideOfBall | null; grade_level?: string | null; status?: string | null
  strengths?: string | null; weaknesses?: string | null; notes?: string | null; created_at: string
}

export interface Video {
  id: string; team_id: string; uploaded_by?: string | null; title: string
  source_type?: 'upload' | 'hudl_link' | 'external_url'; source_url?: string | null
  storage_path?: string | null; thumbnail_path?: string | null; duration_seconds?: number | null
  file_size?: number | null; mime_type?: string | null
  status?: VideoStatus | null; processing_status?: string | null; error_message?: string | null; created_at: string
}

export interface PlaySequence {
  id: string; video_id: string; team_id: string; sequence_number: number
  start_time_seconds?: number; end_time_seconds?: number
  down?: number; distance?: number; yard_line?: string
  result?: string; coach_label?: string; ai_summary?: string; confidence?: number; created_at: string
}

export interface PositionAnalysisResult {
  id: string; team_id: string; player_id?: string | null; video_id?: string | null
  play_sequence_id?: string | null; module_key?: string | null; module_type?: string | null; overall_score?: number | null
  position_scores?: Json | null; reasoning?: Json | null; strengths?: string[] | null
  weaknesses?: string[] | null; drills?: string[] | null; summary?: string | null
  frames_analyzed?: number | null; evidence?: Json | null; model_provider?: string | null; model_name?: string | null; created_at: string
}

export interface MistakeEvent {
  id: string; play_sequence_id?: string; team_id: string
  severity?: MistakeSeverity; category?: string; title?: string
  description?: string; likely_impact?: string; correction?: string
  evidence?: Json; confidence?: number; created_at: string
}

export interface TeamTendency {
  id: string; team_id: string; tendency_type?: string | null; tendency_key?: string | null; label?: string | null
  value?: Json | null; sample_size?: number; confidence?: number | null; updated_at?: string
}

export interface TeamMemory {
  id: string; team_id: string; memory_type?: string; title?: string
  content?: string; source?: string; confidence?: number; created_at: string
}
