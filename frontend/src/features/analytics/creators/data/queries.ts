/**
 * The dashboard's data, from the real API. Two reads and one reuse:
 *  - useCreatorSummary: every number, bar and heatmap cell (the database counts them);
 *  - useMissingCreators: the table, from the normal creator search plus the `missing` filter;
 *  - useCreatorDetail (reused from search): the drawer, so it stays open after a save even
 *    when the creator no longer belongs in the filtered list.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { analyticsApi, searchApi, taxonomyApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/query-client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { CreatorSearchRequest, CreatorSummaryRequest, Platform, TaxonomyKind } from '@/types/api';
import type { ScopeState } from '../calculations/filters';
import { apiSort } from '../calculations/sort';
import { PAGE_SIZE } from '../rules/config';
import type { State } from '../state';

export function summaryRequest(scope: ScopeState): CreatorSummaryRequest {
  return { platforms: scope.plat as Platform[], categories: scope.cat, languages: scope.lang, is_active: true };
}

export function useCreatorSummary(scope: ScopeState) {
  const request = summaryRequest(scope);
  return useQuery({
    queryKey: queryKeys.creatorSummary(request),
    queryFn: ({ signal }) => analyticsApi.creatorSummary(request, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** A complete creator-search request: every unused filter is switched off. */
export function tableRequest(state: Pick<State, 'plat' | 'cat' | 'lang' | 'field' | 'sort'>, text: string, page: number, pageSize = PAGE_SIZE): CreatorSearchRequest {
  return {
    text: text.trim() || null,
    platforms: state.plat as Platform[],
    tiers: [],
    genders: [],
    categories: state.cat,
    languages: state.lang,
    cities: [],
    has_email: false,
    has_phone: false,
    has_contact: false,
    campaign_involvement: null,
    brand_ids: [],
    tags: [],
    min_followers: null,
    max_followers: null,
    min_avg_views: null,
    max_avg_views: null,
    has_package: false,
    min_package_cost: null,
    max_package_cost: null,
    // With no field picked, the table is every creator missing at least one detail.
    missing: state.field ?? 'any',
    is_active: true,
    sort: apiSort(state.sort),
    page,
    page_size: pageSize,
  };
}

export function useMissingCreators(state: State) {
  // The text box updates instantly; only the request waits for a pause in typing.
  const text = useDebouncedValue(state.q, 300);
  const request = tableRequest(state, text, state.page);
  return useQuery({
    queryKey: queryKeys.scopedSearch('creators', request),
    queryFn: ({ signal }) => searchApi.creators(request, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** Category or language names with their ids: the edit form sends ids. Read-only, cached for a while. */
export function useTerms(kind: TaxonomyKind) {
  return useQuery({
    queryKey: queryKeys.taxonomy(kind),
    queryFn: ({ signal }) => taxonomyApi.list(kind, { signal }),
    staleTime: 10 * 60_000,
  });
}
