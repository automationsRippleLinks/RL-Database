import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Search results are cheap to refetch and the backend caches them in Redis,
      // but within 30s of typing the same query the cache should just answer.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry an expired session or a "you can't do this" — retrying a 401
        // just delays the redirect, and a 403 will never succeed. 429 especially:
        // retrying a rate-limited endpoint is what got us rate-limited.
        if (error instanceof ApiError) {
          if (error.status === 401 || error.status === 403 || error.status === 429) return false;
          if (error.status >= 400 && error.status < 500) return false;
        }
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

/** Query keys in one place so invalidation can't drift from the fetchers. */
export const queryKeys = {
  session: ['session'] as const,
  facets: (scope: string) => ['facets', scope] as const,
  globalSearch: (query: string) => ['search', 'global', query] as const,
  suggest: (query: string) => ['search', 'suggest', query] as const,
  scopedSearch: (scope: string, request: unknown) => ['search', scope, request] as const,
  creatorDetail: (id: string) => ['creator', id] as const,
  brandDetail: (name: string) => ['brand', name] as const,
  campaignDetail: (id: string) => ['campaign', id] as const,
  pitchDetail: (id: string) => ['pitch', id] as const,
  taxonomy: (kind: string) => ['taxonomy', kind] as const,
  /** Under 'analytics' so one invalidate refreshes every dashboard number after an edit. */
  creatorSummary: (request: unknown) => ['analytics', 'creators', 'summary', request] as const,
  ingestSources: ['ingest', 'sources'] as const,
  ingestJobs: ['ingest', 'jobs'] as const,
  ingestJob: (jobId: string) => ['ingest', 'job', jobId] as const,
};
