import { apiRequest } from './client';
import type { TeamSettingsInput } from './types';
import type {
  Team,
  Video,
  Player,
  Opponent,
  PlaySequence,
  AnalysisResult,
  AnalysisBatch,
  ActiveBatch,
  VideoFolder,
  UserRole,
  Playbook,
  HudlConnection,
  HudlImportJob,
  TeamTendencyRow,
  MistakeEventRow,
  MistakeCategoryRollup,
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
export const getFilm = (
  teamId: string,
  opts?: { filmType?: 'self' | 'opponent'; folderId?: string; cursor?: string },
) => {
  const p = new URLSearchParams({ teamId });
  if (opts?.filmType) p.set('filmType', opts.filmType);
  // 'none' means "not in any folder" — a real filter, not an absent one.
  if (opts?.folderId) p.set('folderId', opts.folderId);
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
  /** Team context the device knows. The server still loads the team row and
   *  the roster itself — this never widens what the model is allowed to claim. */
  team?: Record<string, unknown>;
  /** 'scrimmage' forbids claiming any jersey number at all (pinnies). */
  filmConditions?: 'game' | 'scrimmage';
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

// ── Batch analysis (Mode 3) ──────────────────────────────────────────────────
// These reuse the web routes unchanged. lib/supabase/server.ts attaches the
// Bearer token this client already sends, and requireTeamMember runs the same
// membership check either way — so a batch queued from a phone is the same row,
// drained by the same Railway worker, as one queued from the browser.

export interface QueueBatchInput {
  teamId: string;
  moduleKey: string;
  videoIds?: string[];
  folderIds?: string[];
  playerId?: string;
  title?: string;
  context?: Record<string, unknown>;
}
export const queueBatch = (input: QueueBatchInput) =>
  apiRequest<{ batchId: string; queued: number }>('/api/analysis/batches', {
    method: 'POST',
    body: input,
  });

export const getBatches = (teamId: string, opts?: { moduleKey?: string; limit?: number }) => {
  const p = new URLSearchParams({ teamId });
  if (opts?.moduleKey) p.set('moduleKey', opts.moduleKey);
  if (opts?.limit) p.set('limit', String(opts.limit));
  return apiRequest<{ batches: AnalysisBatch[] }>(`/api/analysis/batches?${p.toString()}`);
};

export const getBatch = (batchId: string) =>
  apiRequest<{ batch: AnalysisBatch }>(`/api/analysis/batches/${encodeURIComponent(batchId)}`);

export const cancelBatch = (batchId: string) =>
  apiRequest<{ ok: true }>(`/api/analysis/batches/${encodeURIComponent(batchId)}`, {
    method: 'DELETE',
  });

/** Every in-flight batch across all this coach's teams — backs the dock. */
export const getActiveBatches = () =>
  apiRequest<{ batches: ActiveBatch[] }>('/api/analysis/active');

/**
 * Pokes the queue so a batch starts moving while the coach is watching, rather
 * than waiting on the Railway worker's poll. Both claim jobs the same atomic
 * way, so poking never double-analyzes a clip. Slow by design — it drains up
 * to three clips before responding.
 */
export const runBatchQueue = (teamId: string) =>
  apiRequest<{ processed: number }>('/api/analysis/run', {
    method: 'POST',
    body: { teamId },
    timeoutMs: 240_000,
  });

// ── Film from a link ─────────────────────────────────────────────────────────

/**
 * Registers film hosted somewhere else. The file is never copied into our
 * bucket — the coach's host stays the source of truth.
 *
 * URL validation is deliberately left to the server rather than duplicated
 * here: lib/video/remote-source.ts is the single validator shared by the web
 * client, this route and the worker, and a second copy on the phone would drift
 * out of step with it. Its refusals are already written as coach sentences
 * ("that's a watch page, paste the file link"), so surfacing the server's
 * message is better copy than anything a local guess would produce.
 */
export const createVideoFromLink = (input: {
  teamId: string;
  url: string;
  title?: string;
  opponentId?: string;
}) => apiRequest<{ videoId: string }>('/api/videos/from-link', { method: 'POST', body: input });

// ── Opponents ────────────────────────────────────────────────────────────────

export const createOpponent = (input: {
  teamId: string;
  name: string;
  ageGroup?: string;
  nextGameDate?: string;
  notes?: string;
  jerseyColor?: string;
}) => apiRequest<{ opponent: Opponent }>('/api/opponents', { method: 'POST', body: input });

/** Jersey colour decides which side ScoutIQ grades, so it is worth correcting
 *  from the sideline while looking at the film. */
export const updateOpponentJersey = (input: {
  teamId: string;
  opponentId: string;
  jerseyColor: string;
}) => apiRequest<{ opponent: Opponent }>('/api/opponents', { method: 'PATCH', body: input });

// ── Film folders ─────────────────────────────────────────────────────────────
// Folders are analysis targets, not just tidying: a whole folder can be queued
// as one film session.

export const getFolders = (teamId: string) =>
  apiRequest<{ folders: VideoFolder[] }>(`/api/film-folders?teamId=${encodeURIComponent(teamId)}`);

export const createFolder = (input: { teamId: string; name: string; description?: string }) =>
  apiRequest<{ folder: VideoFolder }>('/api/film-folders', { method: 'POST', body: input });

/** folderId null moves film OUT of every folder. Deleting a folder never
 *  deletes film (ON DELETE SET NULL), and neither does this. */
export const moveVideosToFolder = (input: {
  teamId: string;
  videoIds: string[];
  folderId: string | null;
}) => apiRequest<{ moved: number }>('/api/videos/move', { method: 'POST', body: input });

// ── Teams ────────────────────────────────────────────────────────────────────

export type { TeamSettingsInput } from './types';

/** The organization is resolved server-side — a client that could name one
 *  could move a team into somebody else's. */
export const createTeam = (input: TeamSettingsInput) =>
  apiRequest<{ team: Team }>('/api/mobile/teams', { method: 'POST', body: input });

export const updateTeamSettings = (teamId: string, input: TeamSettingsInput) =>
  apiRequest<{ team: Team }>('/api/mobile/teams', {
    method: 'PATCH',
    body: { teamId, ...input },
  });

// ── Team intelligence ────────────────────────────────────────────────────────

export interface TeamIntelligenceResponse {
  tendencies: TeamTendencyRow[];
  mistakes: MistakeEventRow[];
  mistakeRollup: MistakeCategoryRollup[];
  analyses: { id: string; module_key: string | null; overall_score: number | null; summary: string | null; created_at: string }[];
}

export const getTeamIntelligence = (teamId: string) =>
  apiRequest<TeamIntelligenceResponse>(
    `/api/mobile/intelligence?teamId=${encodeURIComponent(teamId)}`,
  );

// ── Admin ────────────────────────────────────────────────────────────────────
// These reuse the web admin routes unchanged: requireAdmin() builds its client
// through lib/supabase/server.ts, which attaches the Bearer token this client
// sends, so the same org-admin check gates both surfaces.

export interface OrgMember {
  id: string;
  userId: string;
  role: UserRole;
  email: string;
  lastSignInAt: string | null;
  isSelf: boolean;
  allTeams: boolean;
  teamIds: string[];
}

export const getOrgMembers = () =>
  apiRequest<{ members: OrgMember[]; teams: { id: string; name: string }[] }>('/api/admin/members');

/** Returns a temporary password when a brand-new account was created for the
 *  invitee — it is shown once and never stored, so it must reach the admin. */
export const addOrgMember = (input: { email: string; role: UserRole }) =>
  apiRequest<{ ok: true; userId: string; email: string; role: string; tempPassword?: string }>(
    '/api/admin/members',
    { method: 'POST', body: input },
  );

export const updateMemberRole = (input: { userId: string; role: UserRole }) =>
  apiRequest<{ ok: true }>('/api/admin/members', { method: 'PATCH', body: input });

export const removeOrgMember = (userId: string) =>
  apiRequest<{ ok: true }>('/api/admin/members', { method: 'DELETE', body: { userId } });

/** allTeams true grants every team, present and future; otherwise teamIds is
 *  the exact set — it replaces, it does not add. */
export const setMemberTeamAccess = (input: {
  userId: string;
  allTeams: boolean;
  teamIds: string[];
}) => apiRequest<{ ok: true }>('/api/admin/team-access', { method: 'PUT', body: input });

export interface UsageResponse {
  windowDays: number;
  organizationName: string | null;
  totalCost: number;
  totalCalls: number;
  cacheHits: number;
  cacheHitRate: number;
  byJobType: { jobType: string; calls: number; cost: number }[];
  byDay: { day: string; cost: number }[];
}

export const getUsage = () => apiRequest<UsageResponse>('/api/mobile/usage');

// ── Hudl ─────────────────────────────────────────────────────────────────────
// The coach's own account, their own film, at their explicit instruction. The
// password is sent once over TLS, sealed server-side with HUDL_CREDENTIAL_KEY,
// and never stored on the device or returned by any of these calls.

export const getHudlConnection = (teamId: string) =>
  apiRequest<HudlConnection>(`/api/integrations/hudl?teamId=${encodeURIComponent(teamId)}`);

export const connectHudl = (input: { teamId: string; email: string; password: string }) =>
  apiRequest<{ connected: true; email: string }>('/api/integrations/hudl', {
    method: 'POST',
    body: input,
    // Sign-in drives a real browser on the worker, so it is slow by nature.
    timeoutMs: 120_000,
  });

export const disconnectHudl = (teamId: string) =>
  apiRequest<{ ok: true }>(`/api/integrations/hudl?teamId=${encodeURIComponent(teamId)}`, {
    method: 'DELETE',
  });

export const getHudlImports = (teamId: string) =>
  apiRequest<{ jobs: HudlImportJob[] }>(
    `/api/integrations/hudl/import?teamId=${encodeURIComponent(teamId)}`,
  );

export const startHudlImport = (input: {
  teamId: string;
  url: string;
  title?: string;
  folderId?: string;
  opponentId?: string;
}) => apiRequest<{ jobId: string }>('/api/integrations/hudl/import', { method: 'POST', body: input });

export const cancelHudlImport = (input: { teamId: string; jobId: string }) =>
  apiRequest<{ ok: true }>(
    `/api/integrations/hudl/import?teamId=${encodeURIComponent(input.teamId)}&jobId=${encodeURIComponent(input.jobId)}`,
    { method: 'DELETE' },
  );

// ── PlaybookIQ ───────────────────────────────────────────────────────────────

export const getPlaybooks = (teamId: string) =>
  apiRequest<{ playbooks: Playbook[] }>(
    `/api/mobile/playbooks?teamId=${encodeURIComponent(teamId)}`,
  );

/** File types the server accepts. Checked here too so a coach learns before
 *  pushing a 20MB file up a hotspot, not after. */
export const PLAYBOOK_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
] as const;

/**
 * Uploads the book itself. Multipart, so it goes through apiRequest's `form`
 * path — text extraction happens server-side on the way in.
 */
export const uploadPlaybook = (input: {
  teamId: string;
  title: string;
  uri: string;
  name: string;
  mimeType: string;
}) => {
  const form = new FormData();
  form.append('teamId', input.teamId);
  form.append('title', input.title);
  // React Native's FormData takes this shape for a file; the cast is the
  // standard RN workaround for a DOM-typed FormData signature.
  form.append('file', {
    uri: input.uri,
    name: input.name,
    type: input.mimeType,
  } as unknown as Blob);
  return apiRequest<{ playbook: { id: string } }>('/api/playbookiq/upload', {
    method: 'POST',
    form,
    timeoutMs: 180_000,
  });
};

export const analyzePlaybook = (input: {
  playbookId: string;
  teamName?: string;
  ageGroup?: string;
  offensiveStyle?: string;
  defensiveStyle?: string;
}) =>
  apiRequest<{ analysis: unknown }>('/api/playbookiq/analyze', {
    method: 'POST',
    body: input,
    timeoutMs: 240_000,
  });

export const deletePlaybook = (playbookId: string) =>
  apiRequest<{ ok: true }>(`/api/playbookiq/${encodeURIComponent(playbookId)}`, {
    method: 'DELETE',
  });
