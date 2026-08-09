import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api/endpoints';

export const qk = {
  bootstrap: ['bootstrap'] as const,
  home: (teamId: string) => ['home', teamId] as const,
  film: (teamId: string, filmType?: string) => ['film', teamId, filmType ?? 'all'] as const,
  filmDetail: (videoId: string) => ['film', 'detail', videoId] as const,
  videoStatus: (videoId: string) => ['video', 'status', videoId] as const,
  analyses: (teamId: string, moduleKey?: string) => ['analyses', teamId, moduleKey ?? 'all'] as const,
  analysis: (analysisId: string) => ['analysis', analysisId] as const,
  roster: (teamId: string) => ['roster', teamId] as const,
  opponents: (teamId: string) => ['opponents', teamId] as const,
  frames: (videoId: string) => ['frames', videoId] as const,
};

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

export function useFilm(teamId: string | null, filmType?: 'self' | 'opponent') {
  return useInfiniteQuery({
    queryKey: qk.film(teamId ?? '', filmType),
    queryFn: ({ pageParam }) => api.getFilm(teamId as string, { filmType, cursor: pageParam }),
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
