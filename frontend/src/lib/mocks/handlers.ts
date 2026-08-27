/**
 * In-memory implementation of the whole API contract, used when VITE_USE_MOCKS=true.
 *
 * This exists because the backend currently has no auth, no search and no upload
 * endpoints, so it is the only way to exercise the UI. Filtering/sorting/paging is
 * done for real against the fixtures so live search genuinely behaves like live
 * search — including the latency, which is simulated.
 */
import type {
  BrandDetail,
  BrandFacets,
  BrandRef,
  BrandRow,
  BrandSearchRequest,
  CampaignDetail,
  CampaignFacets,
  CampaignRow,
  CampaignSearchRequest,
  CreatorDetail,
  CreatorFacets,
  CreatorRow,
  CreatorSearchRequest,
  GlobalSearchResponse,
  IngestJob,
  IngestSource,
  IngestSourceInfo,
  OrgType,
  PitchDetail,
  PitchFacets,
  PitchRow,
  PitchSearchRequest,
  Platform,
  ProfileLinkMatch,
  SearchResponse,
  SessionUser,
  SignUpRequest,
  SuggestResponse,
  Suggestion,
  TaxonomyKind,
  TaxonomyList,
  TaxonomyTerm,
  Tier,
} from '@/types/api';
import {
  CATEGORIES,
  CITIES,
  GENDERS,
  LANGUAGES,
  MOCK_BRANDS,
  MOCK_CAMPAIGNS,
  MOCK_CREATORS,
  MOCK_PITCHES,
  PEOPLE,
  mockCampaignCreators,
  mockPitchCreators,
} from './data';
import { MONTHS } from '@/lib/enums';
import { ApiError } from '@/lib/api-client';
import { deriveProfileUrl } from '@/lib/format';
// The mock stands in for a server-side rule the real backend doesn't have yet, so it
// reuses the client's threshold rather than declaring a second source of truth.
import { MIN_PASSWORD_LENGTH } from '@/features/auth/PasswordFields';

/** Simulated server latency, so debouncing and loading states are visible. */
const LATENCY_MS = 180;

function delay<T>(value: T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), LATENCY_MS + Math.random() * 120);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

function norm(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

/** Every whitespace-separated token must match somewhere — same as "fitness mumbai". */
function matchesTokens(haystack: string, text: string | null | undefined): boolean {
  if (!text) return true;
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = haystack.toLowerCase();
  return tokens.every((token) => hay.includes(token));
}

function paginate<Row>(rows: Row[], page: number, pageSize: number, tookMs = 0): SearchResponse<Row> {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * pageSize;
  return {
    total,
    pages,
    page: safePage,
    page_size: pageSize,
    rows: rows.slice(start, start + pageSize),
    took_ms: tookMs || Math.round(4 + Math.random() * 30),
  };
}

function inRange(value: number | null, min: number | null, max: number | null): boolean {
  if (value === null) return min === null;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

function anyOf<T>(selected: T[], value: T | T[]): boolean {
  if (!selected.length) return true;
  const values = Array.isArray(value) ? value : [value];
  return values.some((v) => selected.includes(v));
}

// ─── session ─────────────────────────────────────────────────────────────────

const MOCK_SESSION_KEY = 'rl-mock-session';

const MOCK_USER: SessionUser = {
  id: 1,
  name: 'Ripple Links Admin',
  email: 'admin@ripplelinks.com',
  is_verified: true,
  auth_provider: 'password',
  // Mock mode grants ingest so the panel is reviewable. The real backend owns this.
  permissions: { can_ingest: true },
};

export const mockAuth = {
  async me(signal?: AbortSignal): Promise<SessionUser> {
    const raw = sessionStorage.getItem(MOCK_SESSION_KEY);
    if (!raw) {
      throw new ApiError({ status: 401, detail: 'Not authenticated', path: '/auth/me' });
    }
    return delay(JSON.parse(raw) as SessionUser, signal);
  },

  async login(email: string, password: string): Promise<SessionUser> {
    await delay(null);
    const domain = email.split('@').pop()?.toLowerCase().trim();
    if (domain !== 'ripplelinks.com') {
      throw new ApiError({
        status: 403,
        detail: 'Only @ripplelinks.com accounts can sign in.',
        code: 'domain_not_allowed',
        path: '/auth/login',
      });
    }
    // Lets the login page's inline "resend verification" path be exercised.
    if (email.trim().toLowerCase() === UNVERIFIED_EMAIL) {
      throw new ApiError({
        status: 403,
        detail: 'Account is not verified',
        code: 'not_verified',
        path: '/auth/login',
      });
    }
    if (password.length < 4) {
      throw new ApiError({
        status: 401,
        detail: 'Incorrect email or password.',
        code: 'invalid_credentials',
        path: '/auth/login',
      });
    }
    const user: SessionUser = { ...MOCK_USER, email, name: nameFromEmail(email) };
    sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
    return user;
  },

  /** Stands in for the backend's Google callback having set a cookie. */
  async completeGoogle(): Promise<SessionUser> {
    const user: SessionUser = { ...MOCK_USER, auth_provider: 'google' };
    sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
    return delay(user);
  },

  async logout(): Promise<void> {
    sessionStorage.removeItem(MOCK_SESSION_KEY);
    await delay(null);
  },

  /** 201 + SessionUser but deliberately NO session — the account is unverified. */
  async signup(body: SignUpRequest): Promise<SessionUser> {
    await delay(null);
    requireWorkDomain(body.email, '/auth/signup');
    if (body.email.toLowerCase() === TAKEN_EMAIL) {
      throw new ApiError({ status: 409, detail: 'Email already exists', path: '/auth/signup' });
    }
    return {
      ...MOCK_USER,
      email: body.email,
      name: body.name,
      is_verified: false,
      permissions: { can_ingest: false },
    };
  },

  /** Verifying logs you in, matching the real endpoint's Set-Cookie behaviour. */
  async verifyEmail(token: string): Promise<SessionUser> {
    await delay(null);
    assertTokenUsable(token, '/auth/verify-email');
    const user: SessionUser = { ...MOCK_USER, is_verified: true };
    sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
    return user;
  },

  async resendVerification(email: string): Promise<void> {
    await delay(null);
    maybeRateLimit(email, '/auth/resend-verification');
    // 204 regardless of whether the account exists — no enumeration.
  },

  async forgotPassword(email: string): Promise<void> {
    await delay(null);
    maybeRateLimit(email, '/auth/forgot-password');
  },

  async resetPassword(token: string, password: string): Promise<SessionUser> {
    await delay(null);
    assertTokenUsable(token, '/auth/reset-password');
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ApiError({
        status: 422,
        detail: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        path: '/auth/reset-password',
      });
    }
    const user: SessionUser = { ...MOCK_USER, is_verified: true };
    sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
    return user;
  },
};

/** Mock-only trigger values, so every branch of the real contract is demoable. */
const EXPIRED_TOKEN = 'expired';
const RATE_LIMITED_EMAIL = 'ratelimited@ripplelinks.com';
const TAKEN_EMAIL = 'taken@ripplelinks.com';
const UNVERIFIED_EMAIL = 'unverified@ripplelinks.com';

function requireWorkDomain(email: string, path: string): void {
  const domain = email.split('@').pop()?.toLowerCase().trim();
  if (domain !== 'ripplelinks.com') {
    throw new ApiError({
      status: 403,
      detail: 'Only @ripplelinks.com accounts can sign in.',
      code: 'domain_not_allowed',
      path,
    });
  }
}

function assertTokenUsable(token: string, path: string): void {
  if (!token || token === EXPIRED_TOKEN) {
    throw new ApiError({
      status: 400,
      detail: 'Invalid or expired link',
      code: 'invalid_token',
      path,
    });
  }
}

/** Exercises the 429 + Retry-After path the real endpoints will use. */
function maybeRateLimit(email: string, path: string): void {
  if (email.trim().toLowerCase() === RATE_LIMITED_EMAIL) {
    throw new ApiError({
      status: 429,
      detail: 'Too many requests. Please wait before trying again.',
      code: 'rate_limited',
      path,
      retryAfterSeconds: 45,
    });
  }
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

// ─── brand directory (derived, since "brand" is not a table) ─────────────────

/**
 * Rolls the brand table up with the counts the UI shows. Keyed on `brand.id` now
 * that Brand is a real table — the old version grouped free-text names, which is
 * exactly the ambiguity the FK removed.
 */
function buildBrandDirectory(): BrandRow[] {
  const byId = new Map<number, BrandRow>(
    MOCK_BRANDS.map((brand) => [
      brand.id,
      {
        id: brand.id,
        name: brand.name,
        gstin: brand.gstin,
        company: brand.company,
        pitch_count: 0,
        campaign_count: 0,
        creator_count: 0,
        org_types: [],
        platforms: [],
        latest_activity: null,
      },
    ]),
  );

  for (const pitch of MOCK_PITCHES) {
    const row = pitch.brand ? byId.get(pitch.brand.id) : undefined;
    if (!row) continue;
    row.pitch_count += 1;
    row.creator_count += pitch.creator_count;
    if (!row.org_types.includes(pitch.org_type)) row.org_types.push(pitch.org_type);
    for (const platform of pitch.platform) {
      if (!row.platforms.includes(platform)) row.platforms.push(platform);
    }
    row.latest_activity = maxDate(row.latest_activity, pitch.created_at?.slice(0, 10) ?? null);
  }

  for (const campaign of MOCK_CAMPAIGNS) {
    const row = campaign.brand ? byId.get(campaign.brand.id) : undefined;
    if (!row) continue;
    row.campaign_count += 1;
    row.latest_activity = maxDate(row.latest_activity, campaign.start_date);
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

const BRAND_DIRECTORY = buildBrandDirectory();

/** Only brands actually referenced by data are worth offering as a filter. */
function brandRefFacet(): BrandRef[] {
  return BRAND_DIRECTORY.filter((b) => b.pitch_count > 0 || b.campaign_count > 0)
    .map((b) => ({ id: b.id, name: b.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── creators ────────────────────────────────────────────────────────────────

function creatorHaystack(c: CreatorRow): string {
  return [c.name, c.username, c.city, c.gender, ...c.categories, ...c.languages]
    .filter(Boolean)
    .join(' ');
}

const MOCK_LINK_PLATFORMS: [string, Platform][] = [
  ['instagram.', 'instagram'],
  ['youtube.', 'youtube'],
  ['youtu.be', 'youtube'],
  ['linkedin.', 'linkedin'],
  ['facebook.', 'facebook'],
  ['fb.com', 'facebook'],
];

const MOCK_HANDLE_RE =
  /(?:instagram|youtube|linkedin|facebook)\.[a-z.]+\/(?:in\/|@|channel\/|c\/|user\/)?([^/?#\s\\]+)/i;

/** Mirrors backend/app/services/profile_link.py. Null for ordinary queries. */
function parseMockProfileLink(query: string): ProfileLinkMatch | null {
  const text = query.trim();
  if (!text || /\s/.test(text)) return null;
  if (!/^(?:https?:\/\/|www\.)|\.(?:com|net|org|be|in|co)(?:\/|$)/i.test(text)) return null;

  const low = text.toLowerCase();
  const platform = MOCK_LINK_PLATFORMS.find(([needle]) => low.includes(needle))?.[1] ?? null;
  const match = MOCK_HANDLE_RE.exec(text);
  return {
    detected: true,
    platform,
    username: match ? match[1].replace(/^@/, '').toLowerCase() : null,
  };
}

/**
 * Which mock campaigns a creator "appears on". The fixtures have no campaign
 * link table, so this stands in for one deterministically: about half of
 * creators worked, a slice were only ever dropped, the rest never appeared.
 */
function mockInvolvement(c: CreatorRow): 'worked' | 'never' | 'dropped_only' {
  const n = Number.parseInt(c.id.slice(-4), 16) % 10;
  if (n < 5) return 'worked';
  if (n < 7) return 'dropped_only';
  return 'never';
}

function withProfileUrl(c: CreatorRow): CreatorRow {
  return { ...c, profile_url: deriveProfileUrl(c.platform, c.username) };
}

function filterCreators(req: CreatorSearchRequest): CreatorRow[] {
  const rows = MOCK_CREATORS.filter((c) => {
    if (!matchesTokens(creatorHaystack(c), req.text)) return false;
    if (!anyOf(req.platforms, c.platform)) return false;
    if (!anyOf(req.tiers, c.tier)) return false;
    if (req.genders.length && !req.genders.includes(c.gender ?? '')) return false;
    if (req.cities.length && !req.cities.includes(c.city ?? '')) return false;
    if (req.categories.length && !req.categories.some((w) => c.categories.includes(w))) {
      return false;
    }
    if (req.languages.length && !req.languages.some((w) => c.languages.includes(w))) {
      return false;
    }
    if (req.has_email && !c.email) return false;
    if (req.has_phone && !c.phone) return false;
    if (req.has_contact && !c.email && !c.phone) return false;
    if (req.campaign_involvement && mockInvolvement(c) !== req.campaign_involvement) {
      return false;
    }
    if (!inRange(c.followers, req.min_followers, req.max_followers)) return false;
    if (!inRange(c.avg_views, req.min_avg_views, req.max_avg_views)) return false;
    return true;
  });

  return sortCreators(rows, req.sort, req.text);
}

function sortCreators(rows: CreatorRow[], sort: CreatorSearchRequest['sort'], text: string | null) {
  const out = [...rows];
  switch (sort) {
    case 'followers_desc':
      return out.sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
    case 'followers_asc':
      return out.sort((a, b) => (a.followers ?? 0) - (b.followers ?? 0));
    case 'avg_views_desc':
      return out.sort((a, b) => (b.avg_views ?? 0) - (a.avg_views ?? 0));
    case 'avg_views_asc':
      return out.sort((a, b) => (a.avg_views ?? 0) - (b.avg_views ?? 0));
    case 'name_asc':
      return out.sort((a, b) => a.name.localeCompare(b.name));
    case 'name_desc':
      return out.sort((a, b) => b.name.localeCompare(a.name));
    default:
      // "relevance": prefix hits on name/handle first, then bigger accounts.
      if (!text) return out.sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
      return out.sort((a, b) => relevance(b, text) - relevance(a, text) || (b.followers ?? 0) - (a.followers ?? 0));
  }
}

function relevance(c: CreatorRow, text: string): number {
  const q = text.toLowerCase().trim();
  let score = 0;
  if (norm(c.username).startsWith(q)) score += 100;
  if (norm(c.name).startsWith(q)) score += 80;
  if (norm(c.name).includes(q)) score += 30;
  if (c.categories.some((cat) => norm(cat).includes(q))) score += 15;
  if (norm(c.city).includes(q)) score += 10;
  return score;
}

// ─── brands / campaigns / pitches filtering ──────────────────────────────────

function filterBrands(req: BrandSearchRequest): BrandRow[] {
  const rows = BRAND_DIRECTORY.filter((b) => {
    if (!matchesTokens([b.name, b.company?.name, b.gstin].filter(Boolean).join(' '), req.text)) return false;
    if (req.org_types.length && !req.org_types.some((t) => b.org_types.includes(t))) return false;
    if (req.platforms.length && !req.platforms.some((p) => b.platforms.includes(p))) return false;
    if (req.has_company && b.company === null) return false;
    if (req.has_gstin && !b.gstin) return false;
    if (req.min_campaigns !== null && b.campaign_count < req.min_campaigns) return false;
    if (req.min_pitches !== null && b.pitch_count < req.min_pitches) return false;
    return true;
  });

  const out = [...rows];
  switch (req.sort) {
    case 'name_asc':
      return out.sort((a, b) => a.name.localeCompare(b.name));
    case 'name_desc':
      return out.sort((a, b) => b.name.localeCompare(a.name));
    case 'pitches_desc':
      return out.sort((a, b) => b.pitch_count - a.pitch_count);
    case 'recent_desc':
      return out.sort((a, b) => (b.latest_activity ?? '').localeCompare(a.latest_activity ?? ''));
    case 'campaigns_desc':
      return out.sort((a, b) => b.campaign_count - a.campaign_count);
    default:
      if (!req.text) return out.sort((a, b) => b.campaign_count - a.campaign_count);
      return out.sort(
        (a, b) =>
          Number(norm(b.name).startsWith(norm(req.text))) - Number(norm(a.name).startsWith(norm(req.text))) ||
          b.campaign_count - a.campaign_count,
      );
  }
}

function filterCampaigns(req: CampaignSearchRequest): CampaignRow[] {
  const rows = MOCK_CAMPAIGNS.filter((c) => {
    const hay = [c.campaign_code, c.campaign_name, c.brand?.name, c.manager, ...c.member_names]
      .filter(Boolean)
      .join(' ');
    if (!matchesTokens(hay, req.text)) return false;
    if (!anyOf(req.statuses, c.status)) return false;
    if (!anyOf(req.report_statuses, c.report_status)) return false;
    if (!anyOf(req.months, c.month_name)) return false;
    if (req.years.length && !req.years.includes(c.year)) return false;
    if (req.managers.length && !req.managers.includes(c.manager)) return false;
    if (req.brand_ids.length && !(c.brand && req.brand_ids.includes(c.brand.id))) return false;
    if (req.start_date_from && (c.start_date ?? '') < req.start_date_from) return false;
    if (req.start_date_to && (c.start_date ?? '') > req.start_date_to) return false;
    return true;
  });

  const out = [...rows];
  switch (req.sort) {
    case 'start_date_asc':
      return out.sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));
    case 'code_asc':
      return out.sort((a, b) => a.campaign_code.localeCompare(b.campaign_code));
    case 'code_desc':
      return out.sort((a, b) => b.campaign_code.localeCompare(a.campaign_code));
    case 'creators_desc':
      return out.sort((a, b) => b.creator_count - a.creator_count);
    default:
      return out.sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));
  }
}

function filterPitches(req: PitchSearchRequest): PitchRow[] {
  const rows = MOCK_PITCHES.filter((p) => {
    const hay = [p.pitch_code, p.brand?.name, p.campaign_name, p.sales_lead, p.list_lead]
      .filter(Boolean)
      .join(' ');
    if (!matchesTokens(hay, req.text)) return false;
    if (!anyOf(req.org_types, p.org_type)) return false;
    if (!anyOf(req.requirements, p.requirement)) return false;
    if (!anyOf(req.platforms, p.platform)) return false;
    if (req.sales_leads.length && !req.sales_leads.includes(p.sales_lead)) return false;
    if (req.list_leads.length && !req.list_leads.includes(p.list_lead ?? '')) return false;
    if (req.brand_ids.length && !(p.brand && req.brand_ids.includes(p.brand.id))) return false;
    if (req.created_from && (p.created_at ?? '') < req.created_from) return false;
    if (req.created_to && (p.created_at ?? '') > `${req.created_to}T23:59:59Z`) return false;
    if (req.converted !== null && p.converted !== req.converted) return false;
    return true;
  });

  const out = [...rows];
  switch (req.sort) {
    case 'created_asc':
      return out.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    case 'code_asc':
      return out.sort((a, b) => a.pitch_code.localeCompare(b.pitch_code));
    case 'code_desc':
      return out.sort((a, b) => b.pitch_code.localeCompare(a.pitch_code));
    case 'creators_desc':
      return out.sort((a, b) => b.creator_count - a.creator_count);
    default:
      return out.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }
}

// ─── public mock search surface ──────────────────────────────────────────────

export const mockSearch = {
  creators(req: CreatorSearchRequest, signal?: AbortSignal) {
    const rows = filterCreators(req).map(withProfileUrl);
    return delay(paginate(rows, req.page, req.page_size), signal);
  },
  brands(req: BrandSearchRequest, signal?: AbortSignal) {
    return delay(paginate(filterBrands(req), req.page, req.page_size), signal);
  },
  campaigns(req: CampaignSearchRequest, signal?: AbortSignal) {
    return delay(paginate(filterCampaigns(req), req.page, req.page_size), signal);
  },
  pitches(req: PitchSearchRequest, signal?: AbortSignal) {
    return delay(paginate(filterPitches(req), req.page, req.page_size), signal);
  },

  global(query: string, limit: number, signal?: AbortSignal): Promise<GlobalSearchResponse> {
    const took_ms = Math.round(8 + Math.random() * 40);

    // Mirrors the backend: a pasted profile URL searches creators by handle
    // only, and an unreadable link returns nothing rather than fuzzy matches.
    const link = parseMockProfileLink(query);
    if (link) {
      const hits = link.username
        ? MOCK_CREATORS.filter(
            (c) =>
              c.username === link.username &&
              (link.platform === null || c.platform === link.platform),
          ).map(withProfileUrl)
        : [];
      return delay(
        {
          query,
          took_ms,
          profile_link: link,
          groups: {
            creators: { total: hits.length, items: hits.slice(0, limit) },
            brands: { total: 0, items: [] },
            campaigns: { total: 0, items: [] },
            pitches: { total: 0, items: [] },
          },
        },
        signal,
      );
    }

    const creators = filterCreators({ ...emptyCreatorRequest(), text: query }).map(withProfileUrl);
    const brands = filterBrands({ ...emptyBrandRequest(), text: query });
    const campaigns = filterCampaigns({ ...emptyCampaignRequest(), text: query });
    const pitches = filterPitches({ ...emptyPitchRequest(), text: query });

    return delay(
      {
        query,
        took_ms,
        profile_link: null,
        groups: {
          creators: { total: creators.length, items: creators.slice(0, limit) },
          brands: { total: brands.length, items: brands.slice(0, limit) },
          campaigns: { total: campaigns.length, items: campaigns.slice(0, limit) },
          pitches: { total: pitches.length, items: pitches.slice(0, limit) },
        },
      },
      signal,
    );
  },

  suggest(query: string, limit: number, signal?: AbortSignal): Promise<SuggestResponse> {
    const suggestions: Suggestion[] = [];

    // Without this the grouped results find the creator while the dropdown
    // above them stays empty, which reads as the box being broken.
    const link = parseMockProfileLink(query);
    if (link) {
      const hits = link.username
        ? MOCK_CREATORS.filter(
            (c) =>
              c.username === link.username &&
              (link.platform === null || c.platform === link.platform),
          )
        : [];
      return delay(
        {
          query,
          suggestions: hits.slice(0, limit).map((c) => ({
            type: 'creators' as const,
            id: c.id,
            label: c.name,
            sublabel: `@${c.username} · ${c.platform}`,
          })),
        },
        signal,
      );
    }

    const q = query.toLowerCase();

    for (const c of MOCK_CREATORS) {
      if (norm(c.name).includes(q) || norm(c.username).includes(q)) {
        suggestions.push({
          type: 'creators',
          id: c.id,
          label: c.name,
          sublabel: `@${c.username} · ${c.platform}`,
        });
      }
      if (suggestions.length >= limit) break;
    }
    for (const b of BRAND_DIRECTORY) {
      if (suggestions.length >= limit * 2) break;
      if (norm(b.name).includes(q)) {
        suggestions.push({
          type: 'brands',
          // Stringified brand.id — the route param, not the name, since the FK landed.
          id: String(b.id),
          label: b.name,
          sublabel: `${b.campaign_count} campaigns · ${b.pitch_count} pitches`,
        });
      }
    }
    for (const c of MOCK_CAMPAIGNS) {
      if (suggestions.length >= limit * 3) break;
      if (norm(c.campaign_name).includes(q) || norm(c.campaign_code).includes(q)) {
        suggestions.push({
          type: 'campaigns',
          id: c.id,
          label: c.campaign_name,
          sublabel: `${c.campaign_code} · ${c.brand?.name ?? 'unassigned'}`,
        });
      }
    }
    for (const p of MOCK_PITCHES) {
      if (suggestions.length >= limit * 4) break;
      if (norm(p.campaign_name).includes(q) || norm(p.pitch_code).includes(q)) {
        suggestions.push({
          type: 'pitches',
          id: p.id,
          label: p.campaign_name,
          sublabel: `${p.pitch_code} · ${p.brand?.name ?? 'unassigned'}`,
        });
      }
    }

    return delay({ query, suggestions: suggestions.slice(0, limit) }, signal);
  },
};

export const mockFacets = {
  creators(signal?: AbortSignal): Promise<CreatorFacets> {
    return delay(
      {
        platforms: unique(MOCK_CREATORS.map((c) => c.platform)) as Platform[],
        tiers: unique(MOCK_CREATORS.map((c) => c.tier)) as Tier[],
        categories: [...CATEGORIES].sort(),
        languages: [...LANGUAGES].sort(),
        cities: [...CITIES].sort(),
        genders: [...GENDERS],
        total_creators: MOCK_CREATORS.length,
      },
      signal,
    );
  },
  brands(signal?: AbortSignal): Promise<BrandFacets> {
    return delay(
      {
        org_types: unique(BRAND_DIRECTORY.flatMap((b) => b.org_types)) as OrgType[],
        platforms: unique(BRAND_DIRECTORY.flatMap((b) => b.platforms)) as Platform[],
        total_brands: BRAND_DIRECTORY.length,
      },
      signal,
    );
  },
  campaigns(signal?: AbortSignal): Promise<CampaignFacets> {
    return delay(
      {
        statuses: unique(MOCK_CAMPAIGNS.map((c) => c.status)),
        report_statuses: unique(MOCK_CAMPAIGNS.map((c) => c.report_status)),
        months: MONTHS,
        years: unique(MOCK_CAMPAIGNS.map((c) => c.year)).sort((a, b) => b - a),
        managers: unique(MOCK_CAMPAIGNS.map((c) => c.manager)).sort(),
        brands: brandRefFacet(),
        total_campaigns: MOCK_CAMPAIGNS.length,
      },
      signal,
    );
  },
  pitches(signal?: AbortSignal): Promise<PitchFacets> {
    return delay(
      {
        org_types: unique(MOCK_PITCHES.map((p) => p.org_type)),
        requirements: unique(MOCK_PITCHES.map((p) => p.requirement)),
        platforms: unique(MOCK_PITCHES.flatMap((p) => p.platform)),
        sales_leads: [...PEOPLE].sort(),
        list_leads: [...PEOPLE].sort(),
        brands: brandRefFacet(),
        total_pitches: MOCK_PITCHES.length,
      },
      signal,
    );
  },
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

// ─── detail ──────────────────────────────────────────────────────────────────

export const mockDetail = {
  creator(id: string, signal?: AbortSignal): Promise<CreatorDetail> {
    const base = MOCK_CREATORS.find((c) => c.id === id);
    if (!base) throw new ApiError({ status: 404, detail: 'Creator not found', path: `/creators/${id}` });

    const pitches = MOCK_PITCHES.slice(0, 3).map((p) => ({
      pitch_id: p.id,
      pitch_code: p.pitch_code,
      brand: p.brand,
      campaign_name: p.campaign_name,
      platform: p.platform,
      final_cost: Math.floor((base.followers ?? 10_000) * 0.9),
      brand_cost: Math.floor((base.followers ?? 10_000) * 1.15),
    }));

    const campaigns = MOCK_CAMPAIGNS.slice(0, 4).map((c) => ({
      campaign_id: c.id,
      campaign_code: c.campaign_code,
      campaign_name: c.campaign_name,
      brand: c.brand,
      month_name: c.month_name,
      year: c.year,
      status: c.status,
      is_dropped: false,
      live_date: c.start_date,
      final_cost: Math.floor((base.followers ?? 10_000) * 0.85),
      views: Math.floor((base.followers ?? 10_000) * 0.4),
      cpv: '1.85',
    }));

    return delay(
      {
        ...withProfileUrl(base),
        additional_emails: base.email ? [`work.${base.email}`] : [],
        additional_phones: base.phone ? [base.phone.replace(/\d{2}$/, '11')] : [],
        pitches,
        campaigns,
      },
      signal,
    );
  },

  brand(id: number, signal?: AbortSignal): Promise<BrandDetail> {
    const row = BRAND_DIRECTORY.find((b) => b.id === id);
    if (!row) throw new ApiError({ status: 404, detail: 'Brand not found', path: `/brands/${id}` });
    const campaigns = MOCK_CAMPAIGNS.filter((c) => c.brand?.id === row.id);
    const pitches = MOCK_PITCHES.filter((p) => p.brand?.id === row.id);
    return delay(
      {
        ...row,
        total_brand_cost: campaigns.length * 480_000,
        campaigns,
        pitches,
        top_creators: MOCK_CREATORS.slice(0, 6).map(withProfileUrl),
      },
      signal,
    );
  },

  campaign(id: string, signal?: AbortSignal): Promise<CampaignDetail> {
    const row = MOCK_CAMPAIGNS.find((c) => c.id === id) as
      | (CampaignRow & { _pitchId: string | null; _pitchCode: string | null })
      | undefined;
    if (!row) throw new ApiError({ status: 404, detail: 'Campaign not found', path: `/campaigns/${id}` });

    const creators = mockCampaignCreators(id, row.creator_count);
    const live = creators.filter((c) => !c.is_dropped);
    const totalViews = live.reduce((sum, c) => sum + (c.ig_reel_views ?? 0) + (c.yt_views ?? 0), 0);
    const totalFinal = live.reduce((sum, c) => sum + (c.final_cost ?? 0), 0);

    return delay(
      {
        ...row,
        pitch: row._pitchId
          ? { id: row._pitchId, pitch_code: row._pitchCode ?? '', brand: row.brand }
          : null,
        creators,
        totals: {
          creator_count: creators.length,
          dropped_count: creators.length - live.length,
          total_final_cost: totalFinal,
          total_brand_cost: live.reduce((sum, c) => sum + (c.brand_cost ?? 0), 0),
          total_views: totalViews,
          avg_cpv: totalViews ? (totalFinal / totalViews).toFixed(2) : null,
        },
      },
      signal,
    );
  },

  pitch(id: string, signal?: AbortSignal): Promise<PitchDetail> {
    const row = MOCK_PITCHES.find((p) => p.id === id);
    if (!row) throw new ApiError({ status: 404, detail: 'Pitch not found', path: `/pitches/${id}` });
    const creators = mockPitchCreators(id, row.creator_count);
    const linked = MOCK_CAMPAIGNS.find(
      (c) => (c as CampaignRow & { _pitchId: string | null })._pitchId === id,
    );
    // Pitch.billing_company_id was dropped, so the company comes via brand → company.
    const company = row.brand
      ? (BRAND_DIRECTORY.find((b) => b.id === row.brand!.id)?.company ?? null)
      : null;

    return delay(
      {
        ...row,
        campaign: linked
          ? { id: linked.id, campaign_code: linked.campaign_code, campaign_name: linked.campaign_name }
          : null,
        company,
        creators,
        totals: {
          creator_count: creators.length,
          total_final_cost: creators.reduce((sum, c) => sum + c.final_cost, 0),
          total_brand_cost: creators.reduce((sum, c) => sum + c.brand_cost, 0),
        },
      },
      signal,
    );
  },
};

// ─── ingestion ───────────────────────────────────────────────────────────────

const mockJobs: IngestJob[] = [];
let jobSeq = 1;

function jobId(): string {
  return `job_${String(jobSeq++).padStart(5, '0')}`;
}

export const mockIngest = {
  sources(signal?: AbortSignal): Promise<{ sources: IngestSourceInfo[] }> {
    const last = (source: IngestSource) =>
      mockJobs.filter((j) => j.source === source && !j.dry_run).at(-1) ?? null;
    return delay(
      {
        sources: [
          {
            source: 'pitch_master',
            label: 'Pitch master',
            apps_script_supported: true,
            upload_supported: true,
            last_job: last('pitch_master'),
            row_count: MOCK_PITCHES.length,
          },
          {
            source: 'campaign_master',
            label: 'Campaign master',
            apps_script_supported: true,
            upload_supported: true,
            last_job: last('campaign_master'),
            row_count: MOCK_CAMPAIGNS.length,
          },
          {
            source: 'pitch_creator',
            label: 'Pitch — creator rows',
            apps_script_supported: false,
            upload_supported: false,
            last_job: null,
            row_count: 0,
          },
          {
            source: 'campaign_creator',
            label: 'Campaign — creator rows',
            apps_script_supported: false,
            upload_supported: false,
            last_job: null,
            row_count: 0,
          },
        ],
      },
      signal,
    );
  },

  jobs(signal?: AbortSignal): Promise<{ jobs: IngestJob[] }> {
    return delay({ jobs: [...mockJobs].reverse().slice(0, 20) }, signal);
  },

  job(id: string, signal?: AbortSignal): Promise<IngestJob> {
    const job = mockJobs.find((j) => j.job_id === id);
    if (!job) throw new ApiError({ status: 404, detail: 'Job not found', path: `/ingest/jobs/${id}` });
    return delay(job, signal);
  },

  runAppsScript(source: IngestSource): Promise<IngestJob> {
    const received = source === 'pitch_master' ? 87 : 118;
    const skipped = Math.floor(received * 0.7);
    const job: IngestJob = {
      job_id: jobId(),
      source,
      origin: 'apps_script',
      status: 'success',
      dry_run: false,
      started_at: new Date().toISOString(),
      finished_at: new Date(Date.now() + 4200).toISOString(),
      started_by: 'admin@ripplelinks.com',
      counts: { received, inserted: received - skipped, updated: 0, skipped, failed: 0 },
      errors: [],
      message: `Ingested ${received - skipped} ${source} rows`,
    };
    mockJobs.push(job);
    return delay(job);
  },

  upload(source: IngestSource, rows: unknown[], dryRun: boolean): Promise<IngestJob> {
    const received = rows.length;
    // Pretend a third of the codes already exist, matching the backend's
    // skip-if-exists behaviour in services/ingest.py.
    const skipped = Math.floor(received / 3);
    const failed = 0;
    const inserted = received - skipped - failed;
    const job: IngestJob = {
      job_id: jobId(),
      source,
      origin: 'upload',
      status: skipped ? 'partial_success' : 'success',
      dry_run: dryRun,
      started_at: new Date().toISOString(),
      finished_at: new Date(Date.now() + 900).toISOString(),
      started_by: 'admin@ripplelinks.com',
      counts: { received, inserted, updated: 0, skipped, failed },
      errors: [],
      message: dryRun
        ? `Dry run: ${inserted} would be inserted, ${skipped} already exist`
        : `Ingested ${inserted} ${source} rows, skipped ${skipped} existing`,
    };
    mockJobs.push(job);
    return delay(job);
  },
};

// ─── taxonomy ────────────────────────────────────────────────────────────────
//
// Backed by a module-level array so adds, renames and deletes persist for the
// session -- a fixture that resets on every read would make the page look
// broken rather than mocked.

let nextTermId = 1000;

const TAXONOMY_STORE: Record<TaxonomyKind, TaxonomyTerm[]> = {
  categories: [...CATEGORIES].sort().map((name, i) => ({
    id: 100 + i,
    name,
    creator_count: MOCK_CREATORS.filter((c) => c.categories.includes(name)).length,
  })),
  languages: [...LANGUAGES].sort().map((name, i) => ({
    id: 200 + i,
    name,
    creator_count: MOCK_CREATORS.filter((c) => c.languages.includes(name)).length,
  })),
};

function taxonomyConflict(kind: TaxonomyKind, name: string, excludeId?: number): void {
  const clash = TAXONOMY_STORE[kind].some(
    (t) => t.id !== excludeId && t.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) {
    throw new ApiError({
      status: 409,
      detail: `A ${kind === 'categories' ? 'category' : 'language'} named "${name}" already exists`,
      path: `/taxonomy/${kind}`,
    });
  }
}

function taxonomyTerm(kind: TaxonomyKind, id: number): TaxonomyTerm {
  const term = TAXONOMY_STORE[kind].find((t) => t.id === id);
  if (!term) {
    throw new ApiError({ status: 404, detail: 'No such term', path: `/taxonomy/${kind}/${id}` });
  }
  return term;
}

export const mockTaxonomy = {
  list(kind: TaxonomyKind, signal?: AbortSignal): Promise<TaxonomyList> {
    const terms = [...TAXONOMY_STORE[kind]].sort(
      (a, b) => b.creator_count - a.creator_count || a.name.localeCompare(b.name),
    );
    return delay({ kind, terms }, signal);
  },

  create(kind: TaxonomyKind, name: string): Promise<TaxonomyTerm> {
    taxonomyConflict(kind, name);
    const term: TaxonomyTerm = { id: nextTermId++, name, creator_count: 0 };
    TAXONOMY_STORE[kind].push(term);
    return delay(term);
  },

  rename(kind: TaxonomyKind, id: number, name: string): Promise<TaxonomyTerm> {
    taxonomyConflict(kind, name, id);
    const term = taxonomyTerm(kind, id);
    term.name = name;
    return delay(term);
  },

  remove(kind: TaxonomyKind, id: number): Promise<void> {
    const term = taxonomyTerm(kind, id);
    if (term.creator_count) {
      throw new ApiError({
        status: 409,
        detail: `${term.creator_count} creators still use this term. Rename it instead.`,
        path: `/taxonomy/${kind}/${id}`,
      });
    }
    TAXONOMY_STORE[kind] = TAXONOMY_STORE[kind].filter((t) => t.id !== id);
    return delay(undefined as void);
  },
};

// ─── neutral request builders (also used by the real endpoints layer) ────────

export function emptyCreatorRequest(): CreatorSearchRequest {
  return {
    text: null,
    platforms: [],
    tiers: [],
    genders: [],
    categories: [],
    languages: [],
    cities: [],
    has_email: false,
    has_phone: false,
    // Neutral means "no filtering". The UI defaults this to true; a
    // global-search fan-out must not silently hide contactless creators.
    has_contact: false,
    campaign_involvement: null,
    min_followers: null,
    max_followers: null,
    min_avg_views: null,
    max_avg_views: null,
    sort: 'relevance',
    page: 1,
    page_size: 50,
  };
}

export function emptyBrandRequest(): BrandSearchRequest {
  return {
    text: null,
    org_types: [],
    platforms: [],
    has_company: false,
    has_gstin: false,
    min_campaigns: null,
    min_pitches: null,
    sort: 'relevance',
    page: 1,
    page_size: 50,
  };
}

export function emptyCampaignRequest(): CampaignSearchRequest {
  return {
    text: null,
    statuses: [],
    report_statuses: [],
    months: [],
    years: [],
    managers: [],
    brand_ids: [],
    start_date_from: null,
    start_date_to: null,
    sort: 'relevance',
    page: 1,
    page_size: 50,
  };
}

export function emptyPitchRequest(): PitchSearchRequest {
  return {
    text: null,
    org_types: [],
    requirements: [],
    platforms: [],
    sales_leads: [],
    list_leads: [],
    brand_ids: [],
    created_from: null,
    created_to: null,
    converted: null,
    sort: 'relevance',
    page: 1,
    page_size: 50,
  };
}
