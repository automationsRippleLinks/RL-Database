/**
 * The single mirror of backend/app/models/enums.py.
 *
 * Every label map here is keyed on the ACTUAL database value, not a prettified
 * variant. That matters: the Streamlit app keyed its tier labels on "mid_tier"
 * while the enum value is "mid-tier", so that tier rendered as a raw string. Keep
 * the keys wire-exact and put the prettifying only in the value.
 */
import type {
  CampaignStatus,
  IngestSource,
  Month,
  OrgType,
  PitchRequirement,
  Platform,
  SearchScope,
  Tier,
} from '@/types/api';

/**
 * TierChoices.NA is the empty string, which cannot round-trip through a select
 * option value or a URL search param. The UI uses this sentinel and translates
 * back to "" at the API boundary (see toWireTier / fromWireTier).
 */
export const TIER_NA_SENTINEL = '__na__';

export const PLATFORMS: Platform[] = [
  'instagram',
  'youtube',
  'linkedin',
  'facebook',
  'others',
  'NA',
];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  others: 'Others',
  NA: 'Unspecified',
};

export const TIERS: Tier[] = ['nano', 'micro', 'mid-tier', 'macro', 'mega', 'celeb', ''];

export const TIER_LABELS: Record<Tier, string> = {
  nano: 'Nano',
  micro: 'Micro',
  'mid-tier': 'Mid-tier',
  macro: 'Macro',
  mega: 'Mega',
  celeb: 'Celebrity',
  '': 'Unspecified',
};

/** Rough follower bands, shown as a hint next to the tier filter. */
export const TIER_HINTS: Record<Tier, string> = {
  nano: '< 10K',
  micro: '10K – 100K',
  'mid-tier': '100K – 500K',
  macro: '500K – 1M',
  mega: '1M +',
  celeb: 'Public figure',
  '': '—',
};

export const CAMPAIGN_STATUSES: CampaignStatus[] = ['wip', 'completed', 'on hold', 'scrapped'];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  completed: 'Completed',
  'on hold': 'On hold',
  scrapped: 'Scrapped',
  wip: 'In progress',
};

export const MONTHS: Month[] = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export const MONTH_LABELS: Record<Month, string> = {
  january: 'January',
  february: 'February',
  march: 'March',
  april: 'April',
  may: 'May',
  june: 'June',
  july: 'July',
  august: 'August',
  september: 'September',
  october: 'October',
  november: 'November',
  december: 'December',
};

export const ORG_TYPES: OrgType[] = [
  'Brand_Core',
  'Brand_Other',
  'Agency',
  'Retainer_Account',
  'NA',
];

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  Brand_Core: 'Brand — core',
  Brand_Other: 'Brand — other',
  Agency: 'Agency',
  Retainer_Account: 'Retainer account',
  NA: 'Unspecified',
};

export const PITCH_REQUIREMENTS: PitchRequirement[] = [
  'list',
  'plan',
  'list_and_plan',
  'content_buckets',
  'content_buckets_and_list',
  'media_plan',
  'production',
  'demographics_data',
  'NA',
];

export const PITCH_REQUIREMENT_LABELS: Record<PitchRequirement, string> = {
  list: 'List',
  plan: 'Plan',
  list_and_plan: 'List and plan',
  content_buckets: 'Content buckets',
  media_plan: 'Media plan',
  production: 'Production',
  content_buckets_and_list: 'Content buckets and list',
  demographics_data: 'Demographics / data',
  NA: 'Unspecified',
};

export const SCOPE_LABELS: Record<SearchScope, string> = {
  creators: 'Creators',
  brands: 'Brands',
  campaigns: 'Campaigns',
  pitches: 'Pitches',
};

export const SCOPES: SearchScope[] = ['creators', 'brands', 'campaigns', 'pitches'];

export const INGEST_SOURCE_LABELS: Record<IngestSource, string> = {
  pitch_master: 'Pitch master',
  campaign_master: 'Campaign master',
  pitch_creator: 'Pitch — creator rows',
  campaign_creator: 'Campaign — creator rows',
  brands: 'Brand Data'
};

// ─────────────────────────────────────────────────────────────────────────────
// Tier sentinel translation
// ─────────────────────────────────────────────────────────────────────────────

export function toWireTier(value: string): Tier {
  return (value === TIER_NA_SENTINEL ? '' : value) as Tier;
}

export function fromWireTier(tier: Tier): string {
  return tier === '' ? TIER_NA_SENTINEL : tier;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw-sheet vocabularies used by the JSON upload validator.
//
// backend/app/services/parser.py maps messy spreadsheet strings onto the enums
// above, and anything it doesn't recognise silently becomes NA. These maps let
// the upload UI warn about that data loss BEFORE the rows are sent, which is
// otherwise completely invisible.
// ─────────────────────────────────────────────────────────────────────────────

/** parser.py:19-24 */
export const RAW_ORG_TYPE_VALUES = [
  'brand - core',
  'brand - other',
  'agency',
  'retainer account',
] as const;

/** parser.py:28-37 */
export const RAW_REQUIREMENT_VALUES = [
  'list',
  'plan',
  'list and plan',
  'content buckets',
  'media plan',
  'production',
  'content buckets and list',
  'demographics/data',
] as const;

/** parser.py:41-50 */
export const RAW_PLATFORM_VALUES = [
  'instagram',
  'yt',
  'insta + yt',
  'others',
  'insta + others',
  'linkedin',
  'yt & linkedin',
  'ig & linkedin',
] as const;

/** parser.py lowercases and trims before lookup, so compare the same way. */
export function isKnownRawValue(value: string, vocabulary: readonly string[]): boolean {
  return vocabulary.includes(value.toLowerCase().trim());
}
