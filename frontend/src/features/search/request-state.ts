/**
 * Derives each scope's search request from the URL.
 *
 * All four builders live together so the param vocabulary stays consistent and
 * non-colliding: shared keys (`q`, `page`, `size`, `sort`) are reused across
 * scopes, and entity-specific filters get a short prefix so switching tabs can't
 * accidentally reinterpret one entity's filter as another's.
 */
import { useMemo } from 'react';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { toWireTier } from '@/lib/enums';
import type {
  BrandSearchRequest,
  BrandSort,
  CampaignInvolvement,
  CampaignSearchRequest,
  CampaignSort,
  CampaignStatus,
  CreatorSearchRequest,
  CreatorSort,
  Month,
  OrgType,
  PitchRequirement,
  PitchSearchRequest,
  PitchSort,
  Platform,
} from '@/types/api';

export const DEFAULT_PAGE_SIZE = 50;

/** Sort vocabularies, kept identical to the ones the Streamlit app established. */
export const CREATOR_SORTS: { value: CreatorSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'followers_desc', label: 'Followers — high to low' },
  { value: 'followers_asc', label: 'Followers — low to high' },
  { value: 'avg_views_desc', label: 'Avg views — high to low' },
  { value: 'avg_views_asc', label: 'Avg views — low to high' },
  { value: 'name_asc', label: 'Name — A to Z' },
  { value: 'name_desc', label: 'Name — Z to A' },
];

export const BRAND_SORTS: { value: BrandSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'campaigns_desc', label: 'Most campaigns' },
  { value: 'pitches_desc', label: 'Most pitches' },
  { value: 'recent_desc', label: 'Most recent activity' },
  { value: 'name_asc', label: 'Name — A to Z' },
  { value: 'name_desc', label: 'Name — Z to A' },
];

export const CAMPAIGN_SORTS: { value: CampaignSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'start_date_desc', label: 'Newest first' },
  { value: 'start_date_asc', label: 'Oldest first' },
  { value: 'creators_desc', label: 'Most creators' },
  { value: 'code_asc', label: 'Code — ascending' },
  { value: 'code_desc', label: 'Code — descending' },
];

export const PITCH_SORTS: { value: PitchSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc', label: 'Oldest first' },
  { value: 'creators_desc', label: 'Most creators' },
  { value: 'code_asc', label: 'Code — ascending' },
  { value: 'code_desc', label: 'Code — descending' },
];

function usePaging() {
  const url = useUrlSearchState();
  return {
    page: Math.max(1, url.getNumber('page', 1) ?? 1),
    page_size: url.getNumber('size', DEFAULT_PAGE_SIZE) ?? DEFAULT_PAGE_SIZE,
  };
}

/** The text box is shared by every scope, so `q` is a shared param. */
export function useQueryText(): string {
  return useUrlSearchState().getString('q');
}

export function useCreatorRequest(): CreatorSearchRequest {
  const url = useUrlSearchState();
  const paging = usePaging();
  const text = url.getString('q');

  return useMemo(
    () => ({
      text: text.trim() || null,
      platforms: url.getList('platform') as Platform[],
      // The tier sentinel exists because TierChoices.NA is "" and an empty string
      // cannot survive a URL param or a select option value.
      tiers: url.getList('tier').map(toWireTier),
      genders: url.getList('gender'),
      categories: url.getList('category'),
      languages: url.getList('language'),
      cities: url.getList('city'),
      has_email: url.getBool('has_email'),
      has_phone: url.getBool('has_phone'),
      // Inverted on purpose. This filter defaults to ON, and setParams drops
      // `false` from the URL, so the only encodable state is the non-default
      // one: `no_contact=1` means the box was unticked.
      has_contact: !url.getBool('no_contact'),
      campaign_involvement:
        (url.getString('in_campaign') as CampaignInvolvement) || null,
      min_followers: url.getNumber('min_followers'),
      max_followers: url.getNumber('max_followers'),
      min_avg_views: url.getNumber('min_views'),
      max_avg_views: url.getNumber('max_views'),
      sort: (url.getString('sort', 'relevance') as CreatorSort) || 'relevance',
      ...paging,
    }),
    [url, paging, text],
  );
}

export function useBrandRequest(): BrandSearchRequest {
  const url = useUrlSearchState();
  const paging = usePaging();
  const text = url.getString('q');

  return useMemo(
    () => ({
      text: text.trim() || null,
      org_types: url.getList('b_org') as OrgType[],
      platforms: url.getList('b_platform') as Platform[],
      has_company: url.getBool('has_company'),
      has_gstin: url.getBool('has_gstin'),
      min_campaigns: url.getNumber('min_campaigns'),
      min_pitches: url.getNumber('min_pitches'),
      sort: (url.getString('sort', 'relevance') as BrandSort) || 'relevance',
      ...paging,
    }),
    [url, paging, text],
  );
}

export function useCampaignRequest(): CampaignSearchRequest {
  const url = useUrlSearchState();
  const paging = usePaging();
  const text = url.getString('q');

  return useMemo(
    () => ({
      text: text.trim() || null,
      statuses: url.getList('status') as CampaignStatus[],
      report_statuses: url.getList('report_status') as CampaignStatus[],
      months: url.getList('month') as Month[],
      years: url.getList('year').map(Number).filter(Number.isFinite),
      managers: url.getList('manager'),
      brand_ids: url.getList('brand_id').map(Number).filter(Number.isFinite),
      start_date_from: url.getString('start_from') || null,
      start_date_to: url.getString('start_to') || null,
      sort: (url.getString('sort', 'relevance') as CampaignSort) || 'relevance',
      ...paging,
    }),
    [url, paging, text],
  );
}

export function usePitchRequest(): PitchSearchRequest {
  const url = useUrlSearchState();
  const paging = usePaging();
  const text = url.getString('q');

  const convertedRaw = url.getString('converted');

  return useMemo(
    () => ({
      text: text.trim() || null,
      org_types: url.getList('p_org') as OrgType[],
      requirements: url.getList('requirement') as PitchRequirement[],
      platforms: url.getList('p_platform') as Platform[],
      sales_leads: url.getList('sales_lead'),
      list_leads: url.getList('list_lead'),
      brand_ids: url.getList('p_brand_id').map(Number).filter(Number.isFinite),
      created_from: url.getString('created_from') || null,
      created_to: url.getString('created_to') || null,
      converted: convertedRaw === '' ? null : convertedRaw === '1',
      sort: (url.getString('sort', 'relevance') as PitchSort) || 'relevance',
      ...paging,
    }),
    [url, paging, text, convertedRaw],
  );
}

/** Param keys owned by each scope, so "reset filters" can clear precisely. */
export const SCOPE_FILTER_KEYS: Record<string, string[]> = {
  creators: [
    'platform', 'tier', 'gender', 'category', 'language', 'city',
    'has_email', 'has_phone', 'no_contact', 'in_campaign',
    'min_followers', 'max_followers', 'min_views', 'max_views',
  ],
  brands: ['b_org', 'b_platform', 'has_company', 'has_gstin', 'min_campaigns', 'min_pitches'],
  campaigns: ['status', 'report_status', 'month', 'year', 'manager', 'brand_id', 'start_from', 'start_to'],
  pitches: [
    'p_org', 'requirement', 'p_platform', 'sales_lead', 'list_lead', 'p_brand_id',
    'created_from', 'created_to', 'converted',
  ],
};

/**
 * Filters whose resting state isn't "off". Without this a default-on filter
 * would pin the "N active" badge at 1 forever and make "reset" look broken.
 */
const FILTER_DEFAULTS: Record<string, Record<string, unknown>> = {
  creators: { has_contact: true },
};

/** How many filters are active, for the "N active" badge on the filter panel. */
export function countActiveFilters(request: object, scope?: string): number {
  const defaults: Record<string, unknown> = scope ? (FILTER_DEFAULTS[scope] ?? {}) : {};
  let count = 0;
  for (const [key, value] of Object.entries(request)) {
    if (['text', 'sort', 'page', 'page_size'].includes(key)) continue;
    if (key in defaults) count += value === defaults[key] ? 0 : 1;
    else if (Array.isArray(value)) count += value.length ? 1 : 0;
    else if (typeof value === 'boolean') count += value ? 1 : 0;
    else if (value !== null && value !== undefined && value !== '') count += 1;
  }
  return count;
}
