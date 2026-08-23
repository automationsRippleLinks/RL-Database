/**
 * The API contract this frontend codes against.
 *
 * IMPORTANT: almost none of these endpoints exist in the backend yet. This file
 * is the authoritative statement of what the frontend needs; PROPOSED_BACKEND_CHANGES.md
 * at the repo root is its prose companion. Field names mirror the SQLModel columns in
 * backend/app/models/ so the backend work stays mechanical.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enum value unions — these mirror backend/app/models/enums.py EXACTLY.
// Note the wire values: tier "mid-tier" is hyphenated, and TierChoices.NA is "".
// ─────────────────────────────────────────────────────────────────────────────

export type Platform = 'instagram' | 'youtube' | 'linkedin' | 'facebook' | 'others' | 'NA';

export type Tier = 'nano' | 'micro' | 'mid-tier' | 'macro' | 'mega' | 'celeb' | '';

export type CampaignStatus = 'completed' | 'on hold' | 'scrapped' | 'wip';

export type Month =
  | 'january'
  | 'february'
  | 'march'
  | 'april'
  | 'may'
  | 'june'
  | 'july'
  | 'august'
  | 'september'
  | 'october'
  | 'november'
  | 'december';

export type OrgType = 'Brand_Core' | 'Brand_Other' | 'Agency' | 'Retainer_Account' | 'NA';

export type PitchRequirement =
  | 'list'
  | 'plan'
  | 'list_and_plan'
  | 'content_buckets'
  | 'media_plan'
  | 'production'
  | 'content_buckets_and_list'
  | 'demographics_data'
  | 'NA';

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  is_verified: boolean;
  auth_provider: 'password' | 'google';
  /** Backend-owned. The ingest UI is gated on can_ingest; the backend's 403 is authoritative. */
  permissions: { can_ingest: boolean };
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** POST /auth/signup → 201 + SessionUser, deliberately WITHOUT a session cookie. */
export interface SignUpRequest {
  name: string;
  email: string;
  password: string;
}

/** POST /auth/verify-email → 200 + SessionUser, and DOES set the session cookies. */
export interface VerifyEmailRequest {
  token: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

/** POST /auth/reset-password → 200 + SessionUser + cookies; revokes other sessions. */
export interface ResetPasswordRequest {
  token: string;
  password: string;
}

/**
 * `code` lets the UI show a specific message instead of a generic failure. The
 * backend sends these in an `X-Error-Code` response header.
 *
 * NOTE: `X-Error-Code` is not CORS-safelisted, so the browser can only read it when
 * the API is same-origin (true in dev via the Vite proxy) or when the backend adds
 * `expose_headers`. Everything here degrades to `detail`/status-based messaging if
 * the header isn't readable — see PROPOSED_BACKEND_CHANGES.md.
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'domain_not_allowed'
  | 'not_verified'
  | 'google_denied'
  | 'google_no_email'
  | 'state_mismatch'
  | 'invalid_token'
  | 'rate_limited'
  | 'unknown';

// ─────────────────────────────────────────────────────────────────────────────
// Search — one envelope shared by all four scopes so one table serves them all
// ─────────────────────────────────────────────────────────────────────────────

export type SearchScope = 'creators' | 'brands' | 'campaigns' | 'pitches';

export interface Paging {
  page: number;
  page_size: number;
}

export interface SearchResponse<Row> extends Paging {
  total: number;
  pages: number;
  rows: Row[];
  /** Server-side timing, surfaced in the results header. Optional. */
  took_ms?: number;
}

export type SortDir = 'asc' | 'desc';

// ── Creators ────────────────────────────────────────────────────────────────

export type CreatorSort =
  | 'relevance'
  | 'followers_desc'
  | 'followers_asc'
  | 'avg_views_desc'
  | 'avg_views_asc'
  | 'name_asc'
  | 'name_desc';

export interface CreatorFilters {
  platforms: Platform[];
  tiers: Tier[];
  genders: string[];
  categories: string[];
  languages: string[];
  cities: string[];
  has_email: boolean;
  has_phone: boolean;
  min_followers: number | null;
  max_followers: number | null;
  min_avg_views: number | null;
  max_avg_views: number | null;
}

export interface CreatorSearchRequest extends CreatorFilters, Paging {
  text: string | null;
  sort: CreatorSort;
}

export interface CreatorRow {
  id: string;
  name: string;
  username: string;
  platform: Platform;
  tier: Tier;
  followers: number | null;
  avg_views: number | null;
  city: string | null;
  gender: string | null;
  categories_raw: string | null;
  languages_raw: string | null;
  email: string | null;
  phone: string | null;
  /**
   * Creator has no profile_url column. The backend should compute this from
   * platform + username; lib/format.ts derives the same value as a fallback so
   * the column works even if the backend omits it.
   */
  profile_url?: string | null;
}

export interface CreatorPitchSummary {
  pitch_id: string;
  pitch_code: string;
  brand: BrandRef | null;
  campaign_name: string;
  platform: Platform[];
  final_cost: number | null;
  brand_cost: number | null;
}

export interface CreatorCampaignSummary {
  campaign_id: string;
  campaign_code: string;
  campaign_name: string;
  brand: BrandRef | null;
  month_name: Month;
  year: number;
  status: CampaignStatus;
  is_dropped: boolean;
  live_date: string | null;
  final_cost: number | null;
  /** Views on whichever platform the deliverable ran on. */
  views: number | null;
  /** Decimal(2dp) serialised as a string to avoid float drift. */
  cpv: string | null;
}

export interface CreatorDetail extends CreatorRow {
  additional_emails: string[];
  additional_phones: string[];
  categories: string[];
  languages: string[];
  pitches: CreatorPitchSummary[];
  campaigns: CreatorCampaignSummary[];
}

// ── Brands ──────────────────────────────────────────────────────────────────
//
// `Brand` is now a real table (backend/app/models/brand.py) and the denormalised
// name columns were dropped: Campaign.brand_name, Pitch.company_name and
// Pitch.billing_company_id are gone, all replaced by `brand_id → brand.id`.
// The hierarchy is Company 1──N Brand 1──N Pitch/Campaign, so a pitch reaches its
// billing company *through* its brand rather than directly.
//
// IMPORTANT: `brand_id` is nullable and nothing populates it yet — the ingest path
// still passes the old `brand_name`/`company_name` kwargs, which SQLModel silently
// drops. So `brand: null` is the common case today, not an edge case, and every
// render site has to degrade gracefully rather than assume a brand is present.

/** Minimal brand reference — enough to name it and link to its detail page. */
export interface BrandRef {
  id: number;
  name: string;
}

export type BrandSort =
  | 'relevance'
  | 'name_asc'
  | 'name_desc'
  | 'campaigns_desc'
  | 'pitches_desc'
  | 'recent_desc';

export interface BrandFilters {
  org_types: OrgType[];
  platforms: Platform[];
  /** Only brands that resolve to a row in the company table (i.e. have a billing entity). */
  has_company: boolean;
  has_gstin: boolean;
  min_campaigns: number | null;
  min_pitches: number | null;
}

export interface BrandSearchRequest extends BrandFilters, Paging {
  text: string | null;
  sort: BrandSort;
}

export interface BrandRow {
  /** brand.id — the row's identity and its route param. */
  id: number;
  name: string;
  /** The brand's own GSTIN. NOT NULL in the DB, but may be the empty string. */
  gstin: string | null;
  /** The owning company, when brand.company_id is set. */
  company: CompanyRef | null;
  pitch_count: number;
  campaign_count: number;
  creator_count: number;
  org_types: OrgType[];
  platforms: Platform[];
  /** ISO date of the most recent campaign start / pitch creation. */
  latest_activity: string | null;
}

export interface CompanyRef {
  id: number;
  name: string;
  gstin: string | null;
}

export interface BrandDetail extends BrandRow {
  total_brand_cost: number | null;
  campaigns: CampaignRow[];
  pitches: PitchRow[];
  /** Highest-spend or most-used creators for this brand. */
  top_creators: CreatorRow[];
}

// ── Campaigns ───────────────────────────────────────────────────────────────

export type CampaignSort =
  | 'relevance'
  | 'start_date_desc'
  | 'start_date_asc'
  | 'code_asc'
  | 'code_desc'
  | 'creators_desc';

export interface CampaignFilters {
  statuses: CampaignStatus[];
  report_statuses: CampaignStatus[];
  months: Month[];
  years: number[];
  managers: string[];
  /** brand.id values — brands are filtered by id now that Brand is a real table. */
  brand_ids: number[];
  start_date_from: string | null;
  start_date_to: string | null;
}

export interface CampaignSearchRequest extends CampaignFilters, Paging {
  text: string | null;
  sort: CampaignSort;
}

export interface CampaignRow {
  id: string;
  campaign_code: string;
  campaign_name: string;
  /** null whenever campaign.brand_id is unset — currently the common case. */
  brand: BrandRef | null;
  manager: string;
  member_names: string[];
  month_name: Month;
  year: number;
  status: CampaignStatus;
  report_status: CampaignStatus;
  start_date: string | null;
  expected_end_date: string | null;
  end_date: string | null;
  report_completion_date: string | null;
  creator_count: number;
  spreadsheet_link: string | null;
  report_link: string | null;
}

/** One CampaignCreatorLink row — the live tracker data, finally visible in a UI. */
export interface CampaignCreatorRow {
  creator_id: string;
  name: string;
  username: string;
  platform: Platform;
  tier: Tier;
  followers: number | null;
  is_dropped: boolean;
  deliverables_raw: string | null;
  expected_views: number | null;
  poc_name: string[];
  initial_cost: number | null;
  final_cost: number | null;
  brand_cost: number | null;
  agency_fee: number | null;
  payment_terms: string | null;
  product_status: string | null;
  content_status: string | null;
  shoot_date: string | null;
  live_date: string | null;
  live_links: string | null;
  script_links: string | null;
  /** Instagram tracker block. */
  ig_reel_views: number | null;
  ig_reel_likes: number | null;
  ig_reel_comments: number | null;
  ig_reel_shares: number | null;
  ig_reel_saves: number | null;
  ig_reel_reach: number | null;
  ig_story_views: number | null;
  ig_story_reach: number | null;
  /** timedelta columns; serialise as ISO-8601 durations or total seconds. */
  ig_avg_watch_time: string | number | null;
  ig_total_watch_time: string | number | null;
  ig_reels_er_perc: string | number | null;
  ig_reels_ir_perc: string | number | null;
  ig_male_perc: string | number | null;
  ig_female_perc: string | number | null;
  /** YouTube tracker block. */
  yt_views: number | null;
  yt_likes: number | null;
  yt_comments: number | null;
  yt_er_perc: string | number | null;
  yt_total_impressions: number | null;
  yt_total_watch_time: string | number | null;
  cpv: string | null;
}

export interface CampaignDetail extends CampaignRow {
  pitch: { id: string; pitch_code: string; brand: BrandRef | null } | null;
  creators: CampaignCreatorRow[];
  /** Server-computed rollup so the UI doesn't re-derive spend from every row. */
  totals: {
    creator_count: number;
    dropped_count: number;
    total_final_cost: number | null;
    total_brand_cost: number | null;
    total_views: number | null;
    avg_cpv: string | null;
  };
}

// ── Pitches ─────────────────────────────────────────────────────────────────

export type PitchSort =
  | 'relevance'
  | 'created_desc'
  | 'created_asc'
  | 'code_asc'
  | 'code_desc'
  | 'creators_desc';

export interface PitchFilters {
  org_types: OrgType[];
  requirements: PitchRequirement[];
  platforms: Platform[];
  sales_leads: string[];
  list_leads: string[];
  /** brand.id values. Replaces the old `companies: string[]` — Pitch.company_name is gone. */
  brand_ids: number[];
  created_from: string | null;
  created_to: string | null;
  /** Narrow to pitches that did / didn't convert into a campaign. */
  converted: boolean | null;
}

export interface PitchSearchRequest extends PitchFilters, Paging {
  text: string | null;
  sort: PitchSort;
}

export interface PitchRow {
  id: string;
  pitch_code: string;
  /** null whenever pitch.brand_id is unset — currently the common case. */
  brand: BrandRef | null;
  campaign_name: string;
  org_type: OrgType;
  requirement: PitchRequirement;
  platform: Platform[];
  sales_lead: string;
  list_lead: string | null;
  creator_count: number;
  /** Whether a Campaign row points at this pitch. */
  converted: boolean;
  spreadsheet_link: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** One PitchCreatorLink row — deliverable counts and costs. */
export interface PitchCreatorRow {
  creator_id: string;
  name: string;
  username: string;
  platform: Platform;
  tier: Tier;
  followers: number | null;
  // Instagram deliverables
  reel_count: number;
  reel_story_count: number;
  video_story_count: number;
  static_carousel_count: number;
  event_store_visit: boolean;
  // YouTube deliverables
  short_form_videos_count: number;
  reshare_short_form_videos_count: number;
  dedicated_video_count: number;
  integrated_video_count: number;
  // rights / boosting
  usage_rights: string | null;
  ad_promo_rights: string | null;
  boosting: string | null;
  payment_terms: string | null;
  // costs
  reel_cost: number;
  reel_story_cost: number;
  video_story_cost: number;
  static_carousel_cost: number;
  short_form_videos_cost: number;
  reshare_short_form_videos_cost: number;
  dedicated_video_cost: number;
  integrated_video_cost: number;
  rights_cost: number;
  boosting_cost: number;
  package_cost: number;
  final_cost: number;
  brand_cost: number;
}

export interface PitchDetail extends PitchRow {
  campaign: { id: string; campaign_code: string; campaign_name: string } | null;
  /**
   * The billing company, resolved through brand → company. Replaces the old
   * `billing_company` on the row: `Pitch.billing_company_id` was dropped, so a pitch
   * only reaches its company via its brand — a join worth doing on the detail
   * endpoint but not on every search row.
   */
  company: CompanyRef | null;
  creators: PitchCreatorRow[];
  totals: {
    creator_count: number;
    total_final_cost: number | null;
    total_brand_cost: number | null;
  };
}

// ── Global search ───────────────────────────────────────────────────────────
//
// Grouped rather than interleaved: relevance is not comparable across entity
// types, and a grouped layout lets each block hand off to its scoped tab.

export interface SearchGroup<Row> {
  total: number;
  /** Capped at the request's `limit`. */
  items: Row[];
}

export interface GlobalSearchResponse {
  query: string;
  took_ms: number;
  groups: {
    creators: SearchGroup<CreatorRow>;
    brands: SearchGroup<BrandRow>;
    campaigns: SearchGroup<CampaignRow>;
    pitches: SearchGroup<PitchRow>;
  };
}

/** Omnibox typeahead. Deliberately cheap and Redis-cached. */
export interface Suggestion {
  type: SearchScope;
  /**
   * Route param for this hit. Stays a string, but the meaning differs by type:
   * creator/campaign/pitch carry their UUID, and `brands` now carries `brand.id`
   * stringified — it used to be the brand name.
   */
  id: string;
  label: string;
  sublabel: string | null;
}

export interface SuggestResponse {
  query: string;
  suggestions: Suggestion[];
}

// ── Facets ──────────────────────────────────────────────────────────────────

export interface CreatorFacets {
  platforms: Platform[];
  tiers: Tier[];
  categories: string[];
  languages: string[];
  cities: string[];
  genders: string[];
  total_creators: number;
}

export interface BrandFacets {
  org_types: OrgType[];
  platforms: Platform[];
  total_brands: number;
}

export interface CampaignFacets {
  statuses: CampaignStatus[];
  report_statuses: CampaignStatus[];
  months: Month[];
  years: number[];
  managers: string[];
  /** id + name, so the filter can submit ids while still showing names. */
  brands: BrandRef[];
  total_campaigns: number;
}

export interface PitchFacets {
  org_types: OrgType[];
  requirements: PitchRequirement[];
  platforms: Platform[];
  sales_leads: string[];
  list_leads: string[];
  /** Was `companies: string[]`; pitches are grouped by brand now. */
  brands: BrandRef[];
  total_pitches: number;
}

export interface FacetsByScope {
  creators: CreatorFacets;
  brands: BrandFacets;
  campaigns: CampaignFacets;
  pitches: PitchFacets;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingestion
// ─────────────────────────────────────────────────────────────────────────────

/** Matches IngestType in backend/app/api/v1/ingest.py. */
export type IngestSource =
  | 'pitch_master'
  | 'campaign_master'
  | 'pitch_creator'
  | 'campaign_creator'
  | 'brands';

export interface IngestSourceInfo {
  source: IngestSource;
  label: string;
  /** pitch_creator and campaign_creator are declared in the enum but unimplemented. */
  apps_script_supported: boolean;
  upload_supported: boolean;
  last_job: IngestJob | null;
  /** Rows currently in the DB from this source, for a before/after sense of scale. */
  row_count: number | null;
}

export type IngestJobStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'partial_success'
  | 'failed';

export interface IngestRowError {
  /** 0-based index into the submitted array. */
  row: number;
  field?: string | null;
  message: string;
  /** Business key when resolvable, so an error is traceable back to the sheet. */
  code?: string | null;
}

export interface IngestJob {
  job_id: string;
  source: IngestSource;
  origin: 'apps_script' | 'upload';
  status: IngestJobStatus;
  dry_run: boolean;
  started_at: string;
  finished_at: string | null;
  started_by: string | null;
  counts: {
    received: number;
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  errors: IngestRowError[];
  message: string | null;
}

export interface IngestJobList {
  jobs: IngestJob[];
}
