import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api/endpoints';

export const qk = {
  bootstrap: ['bootstrap'] as const,
  home: (teamId: string) => ['home', teamId] as const,
  film: (teamId: string, filmType?: string, folderId?: string) =>
    ['film', teamId, filmType ?? 'all', folderId ?? 'all'] as const,
  filmDetail: (videoId: string) => ['film', 'detail', videoId] as const,
  videoStatus: (videoId: string) => ['video', 'status', videoId] as const,
  analyses: (teamId: string, moduleKey?: string) => ['analyses', teamId, moduleKey ?? 'all'] as const,
  analysis: (analysisId: string) => ['analysis', analysisId] as const,
  roster: (teamId: string) => ['roster', teamId] as const,
  opponents: (teamId: string) => ['opponents', teamId] as const,
  frames: (videoId: string) => ['frames', videoId] as const,
  folders: (teamId: string) => ['folders', teamId] as const,
  intelligence: (teamId: string) => ['intelligence', teamId] as const,
  playbooks: (teamId: string) => ['playbooks', teamId] as const,
  hudlConnection: (teamId: string) => ['hudl', 'connection', teamId] as const,
  hudlImports: (teamId: string) => ['hudl', 'imports', teamId] as const,
  orgMembers: ['admin', 'members'] as const,
  usage: ['admin', 'usage'] as const,
  batches: (teamId: string, moduleKey?: string) => ['batches', teamId, moduleKey ?? 'all'] as const,
  batch: (batchId: string) => ['batch', batchId] as const,
  activeBatches: ['batches', 'active'] as const,
};

/** A batch still doing work — the only state worth re-polling for. */
function batchIsLive(b: { status: string; summary_status?: string }): boolean {
  return (
    b.status === 'queued' ||
    b.status === 'running' ||
    b.summary_status === 'pending' ||
    b.summary_status === 'running'
  );
}

export function useBootstrap() {
  return useQuery({ queryKey: qk.bootstrap, queryFn: api.getBootstrap });
}

export function useHome(teamId: string | null) {
  return useQuery({
    queryKey: qk.home(teamId ?? ''),
    queryFn: () => api.getHome(teamId as string),
    enabled: !!teamId,
  });
}

export function useFolders(teamId: string | null) {
  return useQuery({
    queryKey: qk.folders(teamId ?? ''),
    queryFn: () => api.getFolders(teamId as string),
    enabled: !!teamId,
  });
}

export function useFilm(teamId: string | null, filmType?: 'self' | 'opponent', folderId?: string) {
  return useInfiniteQuery({
    // folderId is part of the key: without it, switching folders would serve
    // the previous folder's cached pages under a new filter.
    queryKey: qk.film(teamId ?? '', filmType, folderId),
    queryFn: ({ pageParam }) =>
      api.getFilm(teamId as string, { filmType, folderId, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!teamId,
  });
}

export function useFilmDetail(videoId: string) {
  return useQuery({ queryKey: qk.filmDetail(videoId), queryFn: () => api.getFilmDetail(videoId) });
}

/**
 * Polls a video's processing status ONLY while it is active. Once terminal
 * (ready/complete/failed) polling stops — never poll completed jobs.
 */
export function useVideoStatus(videoId: string, active: boolean) {
  return useQuery({
    queryKey: qk.videoStatus(videoId),
    queryFn: () => api.getVideoStatus(videoId),
    enabled: active,
    refetchInterval: (query) => {
      const s = query.state.data?.videoStatus;
      if (s === 'processing' || s === 'uploaded' || s === 'partially_ready') return 5000;
      return false;
    },
  });
}

export function useAnalyses(teamId: string | null, moduleKey?: string) {
  return useInfiniteQuery({
    queryKey: qk.analyses(teamId ?? '', moduleKey),
    queryFn: ({ pageParam }) => api.getAnalyses(teamId as string, { moduleKey, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!teamId,
  });
}

export function useAnalysis(analysisId: string) {
  return useQuery({ queryKey: qk.analysis(analysisId), queryFn: () => api.getAnalysis(analysisId) });
}

export function useRoster(teamId: string | null) {
  return useQuery({
    queryKey: qk.roster(teamId ?? ''),
    queryFn: () => api.getRoster(teamId as string),
    enabled: !!teamId,
  });
}

export function useOpponents(teamId: string | null) {
  return useQuery({
    queryKey: qk.opponents(teamId ?? ''),
    queryFn: () => api.getOpponents(teamId as string),
    enabled: !!teamId,
  });
}

export function useVideoFrames(videoId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.frames(videoId),
    queryFn: () => api.getVideoFrames(videoId),
    enabled,
    staleTime: 1000 * 60 * 30,
  });
}

// ── Batch analysis ──────────────────────────────────────────────────────────
// Polling follows the same rule as video processing: poll only while something
// is actually running, then stop. A coach's phone is on a hotspot at a field.

export function useBatches(teamId: string | null, moduleKey?: string) {
  return useQuery({
    queryKey: qk.batches(teamId ?? '', moduleKey),
    queryFn: () => api.getBatches(teamId as string, { moduleKey }),
    enabled: !!teamId,
    refetchInterval: (q) =>
      (q.state.data?.batches ?? []).some(batchIsLive) ? 5_000 : false,
  });
}

export function useBatch(batchId: string) {
  return useQuery({
    queryKey: qk.batch(batchId),
    queryFn: () => api.getBatch(batchId),
    enabled: !!batchId,
    refetchInterval: (q) => (q.state.data?.batch && batchIsLive(q.state.data.batch) ? 4_000 : false),
  });
}

export function useActiveBatches(enabled: boolean) {
  return useQuery({
    queryKey: qk.activeBatches,
    queryFn: api.getActiveBatches,
    enabled,
    refetchInterval: (q) =>
      (q.state.data?.batches ?? []).some(batchIsLive) ? 6_000 : 30_000,
  });
}

export function useTeamIntelligence(teamId: string | null) {
  return useQuery({
    queryKey: qk.intelligence(teamId ?? ''),
    queryFn: () => api.getTeamIntelligence(teamId as string),
    enabled: !!teamId,
  });
}

// ── Admin ───────────────────────────────────────────────────────────────────

export function useOrgMembers(enabled: boolean) {
  return useQuery({ queryKey: qk.orgMembers, queryFn: api.getOrgMembers, enabled });
}

export function useUsage(enabled: boolean) {
  return useQuery({ queryKey: qk.usage, queryFn: api.getUsage, enabled });
}

// ── Hudl ────────────────────────────────────────────────────────────────────

export function useHudlConnection(teamId: string | null) {
  return useQuery({
    queryKey: qk.hudlConnection(teamId ?? ''),
    queryFn: () => api.getHudlConnection(teamId as string),
    enabled: !!teamId,
  });
}

export function useHudlImports(teamId: string | null) {
  return useQuery({
    queryKey: qk.hudlImports(teamId ?? ''),
    queryFn: () => api.getHudlImports(teamId as string),
    enabled: !!teamId,
    // An import pulls clips serially with a delay to avoid getting the coach's
    // own Hudl account flagged, so it is slow — poll while one is live, stop
    // the moment none is.
    refetchInterval: (q) =>
      (q.state.data?.jobs ?? []).some((j) => j.status === 'queued' || j.status === 'running')
        ? 6_000
        : false,
  });
}

export function usePlaybooks(teamId: string | null) {
  return useQuery({
    queryKey: qk.playbooks(teamId ?? ''),
    queryFn: () => api.getPlaybooks(teamId as string),
    enabled: !!teamId,
  });
}
