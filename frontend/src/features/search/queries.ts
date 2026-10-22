/**
 * TanStack Query wiring for search.
 *
 * Three things make this feel live rather than merely fast:
 *  - the `signal` goes into fetch, so a superseded keystroke's request is aborted
 *    instead of racing the current one;
 *  - `placeholderData: keepPreviousData` keeps the old rows on screen while the
 *    next page or query loads, so the table dims rather than blanking;
 *  - the request object is the query key, so identical filter states are cache
 *    hits and typing backwards is instant.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { detailApi, facetsApi, searchApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/query-client';
import type {
  BrandSearchRequest,
  CampaignSearchRequest,
  CreatorSearchRequest,
  PitchSearchRequest,
  SearchScope,
} from '@/types/api';


/** Below this, a global/typeahead query matches so much that it's just noise. */
export const MIN_GLOBAL_QUERY_LENGTH = 2;

export function useCreatorSearch(request: CreatorSearchRequest) {
  return useQuery({
    queryKey: queryKeys.scopedSearch('creators', request),
    queryFn: ({ signal }) => searchApi.creators(request, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useBrandSearch(request: BrandSearchRequest) {
  return useQuery({
    queryKey: queryKeys.scopedSearch('brands', request),
    queryFn: ({ signal }) => searchApi.brands(request, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useCampaignSearch(request: CampaignSearchRequest) {
  return useQuery({
    queryKey: queryKeys.scopedSearch('campaigns', request),
    queryFn: ({ signal }) => searchApi.campaigns(request, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function usePitchSearch(request: PitchSearchRequest) {
  return useQuery({
    queryKey: queryKeys.scopedSearch('pitches', request),
    queryFn: ({ signal }) => searchApi.pitches(request, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useGlobalSearch(query: string, limit = 5) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.globalSearch(`${trimmed}::${limit}`),
    queryFn: ({ signal }) => searchApi.global(trimmed, limit, { signal }),
    enabled: trimmed.length >= MIN_GLOBAL_QUERY_LENGTH,
    placeholderData: keepPreviousData,
  });
}

export function useSuggestions(query: string, enabled = true) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.suggest(trimmed),
    queryFn: ({ signal }) => searchApi.suggest(trimmed, 8, { signal }),
    enabled: enabled && trimmed.length >= MIN_GLOBAL_QUERY_LENGTH,
    // Suggestions are cheap and disposable; don't keep stale ones around long.
    staleTime: 15_000,
  });
}

// ─── facets ──────────────────────────────────────────────────────────────────
//
// Filter vocabularies change only when data is ingested, so they're cached hard.

const FACET_STALE_TIME = 10 * 60_000;

export function useCreatorFacets() {
  return useQuery({
    queryKey: queryKeys.facets('creators'),
    queryFn: ({ signal }) => facetsApi.creators({ signal }),
    staleTime: FACET_STALE_TIME,
  });
}

export function useBrandFacets() {
  return useQuery({
    queryKey: queryKeys.facets('brands'),
    queryFn: ({ signal }) => facetsApi.brands({ signal }),
    staleTime: FACET_STALE_TIME,
  });
}

export function useCampaignFacets() {
  return useQuery({
    queryKey: queryKeys.facets('campaigns'),
    queryFn: ({ signal }) => facetsApi.campaigns({ signal }),
    staleTime: FACET_STALE_TIME,
  });
}

export function usePitchFacets() {
  return useQuery({
    queryKey: queryKeys.facets('pitches'),
    queryFn: ({ signal }) => facetsApi.pitches({ signal }),
    staleTime: FACET_STALE_TIME,
  });
}

// ─── detail ──────────────────────────────────────────────────────────────────

export function useCreatorDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.creatorDetail(id ?? ''),
    queryFn: ({ signal }) => detailApi.creator(id!, { signal }),
    enabled: Boolean(id),
  });
}

export function useBrandDetail(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.brandDetail(String(id ?? '')),
    queryFn: ({ signal }) => detailApi.brand(id!, { signal }),
    enabled: id !== undefined,
  });
}

export function useCampaignDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.campaignDetail(id ?? ''),
    queryFn: ({ signal }) => detailApi.campaign(id!, { signal }),
    enabled: Boolean(id),
  });
}

export function usePitchDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pitchDetail(id ?? ''),
    queryFn: ({ signal }) => detailApi.pitch(id!, { signal }),
    enabled: Boolean(id),
  });
}

/** Route path for a hit of a given type — used by the omnibox and global results. */
export function detailPath(scope: SearchScope, id: string): string {
  switch (scope) {
    case 'creators':
      return `/creators/${id}`;
    case 'brands':
      // Suggestion.id carries brand.id stringified for this type.
      return `/brands/${id}`;
    case 'campaigns':
      return `/campaigns/${id}`;
    case 'pitches':
      return `/pitches/${id}`;
  }
}
