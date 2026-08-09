import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/client';

/**
 * Shared QueryClient. Reads are cached so the last-successful data shows while
 * offline; mutations never retry blindly. Auth/permission errors never retry —
 * retrying a 401/403 just churns.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60, // keep for an hour for offline reads
      retry: (failureCount, error) => {
        if (error instanceof ApiError && [401, 403, 404, 429].includes(error.status)) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: { retry: false },
  },
});
