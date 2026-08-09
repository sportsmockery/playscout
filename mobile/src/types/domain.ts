/**
 * Client mirror of the PlayScout server types (lib/db/types.ts +
 * lib/intelligence/schemas.ts). Kept intentionally narrow to what the mobile
 * app reads. The server remains the source of truth; these are read models.
 */

export type UserRole = 'owner' | 'admin' | 'coach' | 'analyst' | 'viewer';
export type SideOfBall = 'offense' | 'defense' | 'both' | 'special_teams';
export type VideoStatus =
  | 'uploaded'
  | 'processing'
  | 'partially_ready'
  | 'ready_for_review'
  | 'analysis_complete'
  | 'failed';
export type UploadStatus = 'created' | 'uploading' | 'uploaded' | 'failed' | 'cancelled';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying';
export type MistakeSeverity = 'minor' | 'moderate' | 'major' | 'game_changing';
export type GameType = 'flag' | 'tackle' | 'rookie_tackle';
export type FilmType = 'self' | 'opponent';

export type LevelTier =
  | 'youth_early'
  | 'youth'
  | 'youth_older'
  | 'middle_school'
  | 'jv'
  | 'varsity'
  | 'unknown';

/** Modules the server actually runs today. WRIQ/DLIQ/LBIQ/DBIQ/PracticeIQ are
 * intentionally excluded — they must not appear as complete features. */
export const SUPPORTED_MODULES = [
  'QBIQ',
  'RBIQ',
  'OLIQ',
  'TEAMIQ',
  'MISTAKEIQ',
  'SCOUTIQ',
  'PLAYBOOKIQ',
] as const;
export type ModuleKey = (typeof SUPPORTED_MODULES)[number];

export interface Team {
  id: string;
  organization_id?: string;
  name: string;
  age_group?: string | null;
  season?: string | null;
  league?: string | null;
  level?: string | null;
  state?: string | null;
  offensive_style?: string | null;
  defensive_style?: string | null;
  game_type?: GameType | null;
  notes?: string | null;
  created_at: string;
}

export interface Opponent {
  id: string;
  team_id: string;
  name: string;
  age_group?: string | null;
  next_game_date?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  team_id: string;
  first_name?: string | null;
  last_name?: string | null;
  jersey_number?: number | null;
  primary_position?: string | null;
  secondary_position?: string | null;
  side_of_ball?: SideOfBall | null;
  grade_level?: string | null;
  status?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface Video {
  id: string;
  team_id: string;
  title: string;
  thumbnail_path?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
  film_type?: FilmType;
  opponent_id?: string | null;
  status?: VideoStatus | null;
  processing_status?: string | null;
  error_message?: string | null;
  created_at: string;
  /** Aggregated in the mobile API layer. */
  play_count?: number;
  confirmed_play_count?: number;
  latest_analysis_at?: string | null;
}

export interface PlaySequence {
  id: string;
  video_id: string;
  team_id: string;
  sequence_number: number;
  start_time_seconds?: number;
  end_time_seconds?: number;
  down?: number;
  distance?: number;
  yard_line?: string;
  result?: string;
  coach_label?: string;
  ai_summary?: string;
  confidence?: number;
  created_at: string;
}

export interface HeadContactFlag {
  flagged: boolean;
  note: string;
}

export interface Tendency {
  tendency_type?: string;
  label?: string;
  description?: string;
  rate?: number | null;
  confidence: number;
  sample_size: number;
}

export interface MistakeItem {
  title: string;
  severity: MistakeSeverity;
  category?: string;
  description?: string;
  likely_impact?: string;
  correction?: string;
  drill?: string;
  evidence_frames?: number[];
  confidence?: number;
}

/** The `evidence` JSONB blob attached to a saved analysis. */
export interface AnalysisEvidence {
  confidence?: number;
  plays_observed?: number;
  head_contact_flag?: HeadContactFlag;
  frames?: number[];
  offensive_tendencies?: Tendency[];
  defensive_tendencies?: Tendency[];
  formations?: { name: string; side?: string; note?: string }[];
  situational_tells?: { situation: string; tell: string; confidence?: number }[];
  attack_points?: string[];
  target_players?: { identifier: string; reason: string; confidence: number; evidence_frames?: number[] }[];
  mistakes?: MistakeItem[];
}

export interface AnalysisResult {
  id: string;
  team_id: string;
  player_id?: string | null;
  video_id?: string | null;
  play_sequence_id?: string | null;
  module_key?: string | null;
  overall_score?: number | null;
  position_scores?: Record<string, number | null> | null;
  reasoning?: Record<string, string> | null;
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  drills?: string[] | null;
  summary?: string | null;
  frames_analyzed?: number | null;
  evidence?: AnalysisEvidence | null;
  edited_at?: string | null;
  created_at: string;
  /** Joined display fields when present. */
  player?: { first_name?: string | null; last_name?: string | null; primary_position?: string | null } | null;
  team?: { name?: string } | null;
}

export interface Membership {
  organization_id: string;
  role: UserRole;
  all_teams?: boolean;
}
