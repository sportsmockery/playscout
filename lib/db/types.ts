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
  offensive_style?: string | null; defensive_style?: string | null
  home_jersey_color?: string | null; away_jersey_color?: string | null
  notes?: string | null; created_at: string
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
  edited_by?: string | null; edited_at?: string | null; original_result?: Json | null
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

export interface Playbook {
  id: string
  team_id: string
  uploaded_by?: string | null
  title: string
  file_type: 'pdf' | 'pptx' | 'docx' | 'image'
  storage_path?: string | null
  page_count?: number | null
  extracted_text?: string | null
  pages_status?: 'not_started' | 'queued' | 'processing' | 'ready' | 'failed'
  pages_error?: string | null
  created_at: string
}

export interface PlaybookPlayAssignment {
  position: string
  assignment: string
}

export interface PlaybookPlay {
  id: string
  playbook_id: string
  team_id: string
  page_number: number
  play_name?: string | null
  formation?: string | null
  image_path?: string | null
  blocking_summary?: string | null
  assignments: PlaybookPlayAssignment[]
  confidence?: number | null
  created_at: string
  edited_by?: string | null
  edited_at?: string | null
  original_play?: Json | null
  page_type?: 'live_play' | 'formation_reference'
}

export interface PlaybookAnalysis {
  id: string
  playbook_id: string
  team_id: string
  overall_score?: number | null
  complexity_score?: number | null
  age_appropriate?: boolean | null
  strengths?: string[] | null
  weaknesses?: string[] | null
  qbiq_notes?: string | null
  oliq_notes?: string | null
  teamiq_notes?: string | null
  mistakeiq_notes?: string | null
  upgrade_recommendations?: PlaybookRecommendation[] | null
  plays_to_keep?: string[] | null
  plays_to_remove?: string[] | null
  install_order?: PlaybookInstallStep[] | null
  summary?: string | null
  model_provider?: string | null
  model_name?: string | null
  created_at: string
  covered_play_ids?: string[] | null
}

export interface PlaybookRecommendation {
  title: string
  reason: string
  priority: 'high' | 'medium' | 'low'
  module: 'QBIQ' | 'OLIQ' | 'TeamIQ' | 'MistakeIQ' | 'General'
}

export interface PlaybookInstallStep {
  week: number
  play: string
  reason: string
}

export interface OutputCorrection {
  id: string
  team_id: string
  result_id: string
  result_type: 'position_analysis_result' | 'playbook_play'
  field: string
  ai_value: Json | null
  corrected_value: Json | null
  ai_confidence: number | null
  model: string | null
  prompt_version: string | null
  corrected_by: string | null
  created_at: string
}
