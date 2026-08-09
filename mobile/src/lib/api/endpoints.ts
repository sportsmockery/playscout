import { apiRequest } from './client';
import type {
  Team,
  Video,
  Player,
  Opponent,
  PlaySequence,
  AnalysisResult,
  UserRole,
} from '@/types/domain';

// ── Bootstrap & home ──────────────────────────────────────────────────────
export interface BootstrapResponse {
  user: { id: string; email: string | null };
  membership: { organization_id: string; organization_name: string | null; role: UserRole | null; all_teams: boolean } | null;
  teams: (Team & { role: UserRole | null })[];
  activeTeamId: string | null;
}
export const getBootstrap = () => apiRequest<BootstrapResponse>('/api/mobile/bootstrap');

export interface HomeResponse {
  team: Team | null;
  role: UserRole;
  nextOpponent: { id: string; name: string; next_game_date: string | null } | null;
  safety: { flagged: boolean; note: string } | null;
  needsAttention: { videoId: string; title: string; kind: 'processing_failed' | 'confirm_plays' }[];
  latestIntelligence: { id: string; module_key: string | null; overall_score: number | null; summary: string | null; created_at: string }[];
  practiceFocus: { id: string; title: string | null; severity: string | null; category: string | null; correction: string | null; created_at: string }[];
  recentFilm: Video[];
}
export const getHome = (teamId: string) =>
  apiRequest<HomeResponse>(`/api/mobile/home?teamId=${encodeURIComponent(teamId)}`);

// ── Film ──────────────────────────────────────────────────────────────────
export interface FilmListResponse {
  videos: Video[];
  nextCursor: string | null;
}
export const getFilm = (teamId: string, opts?: { filmType?: 'self' | 'opponent'; cursor?: string }) => {
  const p = new URLSearchParams({ teamId });
  if (opts?.filmType) p.set('filmType', opts.filmType);
  if (opts?.cursor) p.set('cursor', opts.cursor);
  return apiRequest<FilmListResponse>(`/api/mobile/film?${p.toString()}`);
};

export interface FilmDetailResponse {
  video: Video & { storage_path?: string | null; team_id: string };
  role: UserRole;
  job: { status: string; progress: number | null; current_step: string | null; error_message: string | null } | null;
  plays: PlaySequence[];
  analyses: AnalysisResult[];
}
export const getFilmDetail = (videoId: string) =>
  apiRequest<FilmDetailResponse>(`/api/mobile/film/${encodeURIComponent(videoId)}`);

export interface VideoStatusResponse {
  videoStatus: string | null;
  errorMessage: string | null;
  jobStatus: string | null;
  progress: number | null;
  currentStep: string | null;
}
export const getVideoStatus = (videoId: string) =>
  apiRequest<VideoStatusResponse>(`/api/videos/${encodeURIComponent(videoId)}/status`);

export const retryVideo = (videoId: string) =>
  apiRequest<{ ok: true }>(`/api/videos/${encodeURIComponent(videoId)}/retry`, { method: 'POST' });

export interface FramesResponse {
  frames: { frame_index: number; url: string }[];
}
export const getVideoFrames = (videoId: string) =>
  apiRequest<FramesResponse>(`/api/videos/${encodeURIComponent(videoId)}/frames`);

export const completeUpload = (input: {
  storagePath: string;
  teamId: string;
  title?: string;
  opponentId?: string;
  uploadId?: string;
}) => apiRequest<{ videoId: string }>('/api/videos/complete-upload', { method: 'POST', body: input });

// ── Play sequences ─────────────────────────────────────────────────────────
export const createPlaySequence = (input: {
  videoId: string;
  teamId: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
}) => apiRequest<{ playSequence: PlaySequence }>('/api/play-sequences', { method: 'POST', body: input });

export const updatePlaySequence = (
  playSequenceId: string,
  patch: Partial<Pick<PlaySequence, 'start_time_seconds' | 'end_time_seconds' | 'down' | 'distance' | 'yard_line' | 'result' | 'coach_label'>>,
) =>
  apiRequest<{ playSequence: PlaySequence }>(`/api/play-sequences/${encodeURIComponent(playSequenceId)}`, {
    method: 'PATCH',
    body: patch,
  });

export const deletePlaySequence = (playSequenceId: string) =>
  apiRequest<{ ok: true }>(`/api/play-sequences/${encodeURIComponent(playSequenceId)}`, { method: 'DELETE' });

// ── Analyses ────────────────────────────────────────────────────────────────
export interface AnalysesListResponse {
  analyses: AnalysisResult[];
  nextCursor: string | null;
}
export const getAnalyses = (teamId: string, opts?: { moduleKey?: string; cursor?: string }) => {
  const p = new URLSearchParams({ teamId });
  if (opts?.moduleKey) p.set('moduleKey', opts.moduleKey);
  if (opts?.cursor) p.set('cursor', opts.cursor);
  return apiRequest<AnalysesListResponse>(`/api/mobile/analyses?${p.toString()}`);
};

export const getAnalysis = (analysisId: string) =>
  apiRequest<{ result: AnalysisResult }>(`/api/intelligence/analysis/${encodeURIComponent(analysisId)}`);

export const saveAnalysisCorrection = (
  analysisId: string,
  patch: Partial<Pick<AnalysisResult, 'overall_score' | 'position_scores' | 'strengths' | 'weaknesses' | 'summary' | 'drills'>>,
) =>
  apiRequest<{ result: AnalysisResult }>(`/api/intelligence/analysis/${encodeURIComponent(analysisId)}`, {
    method: 'PATCH',
    body: patch,
  });

export interface RunAnalysisInput {
  moduleKey: string;
  teamId: string;
  videoId?: string;
  playSequenceId?: string;
  playerId?: string;
  opponentId?: string;
  frames?: string[];
  coachNote?: string;
}
export const runAnalysis = (input: RunAnalysisInput) =>
  apiRequest<{ result: AnalysisResult; analysisId: string }>('/api/intelligence/analyze', {
    method: 'POST',
    body: input,
  });

// ── Roster & opponents ───────────────────────────────────────────────────────
export const getRoster = (teamId: string) =>
  apiRequest<{ players: Player[]; role: UserRole }>(`/api/mobile/roster?teamId=${encodeURIComponent(teamId)}`);

export interface OpponentWithMeta extends Opponent {
  film_count: number;
  last_report_at: string | null;
}
export const getOpponents = (teamId: string) =>
  apiRequest<{ opponents: OpponentWithMeta[]; role: UserRole }>(
    `/api/mobile/opponents?teamId=${encodeURIComponent(teamId)}`,
  );

export const generateScoutReport = (teamId: string, opponentId: string) =>
  apiRequest<{ scoutReport: unknown }>('/api/scoutiq/report', { method: 'POST', body: { teamId, opponentId } });

// ── Push tokens & account ────────────────────────────────────────────────────
export const registerPushToken = (input: { token: string; platform: 'ios' | 'android'; deviceName?: string }) =>
  apiRequest<{ ok: true }>('/api/mobile/push-tokens', { method: 'POST', body: input });

export const deletePushToken = (token: string) =>
  apiRequest<{ ok: true }>('/api/mobile/push-tokens', { method: 'DELETE', body: { token } });

export const deleteAccount = () => apiRequest<{ ok: true }>('/api/mobile/account', { method: 'DELETE' });
