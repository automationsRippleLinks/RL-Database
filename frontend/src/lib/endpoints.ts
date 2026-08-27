/**
 * The single place that knows an endpoint's path and shape.
 *
 * Every function routes to either the real backend or the in-memory mock, chosen
 * by VITE_USE_MOCKS. Components and hooks never branch on that flag themselves —
 * flipping to the real backend is one env var and no code change.
 */
import { USE_MOCKS, api } from "./api-client";
import {
  mockAuth,
  mockDetail,
  mockFacets,
  mockIngest,
  mockSearch,
  mockTaxonomy,
} from "./mocks/handlers";
import type {
  BrandDetail,
  BrandFacets,
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
  PitchDetail,
  PitchFacets,
  PitchRow,
  PitchSearchRequest,
  SearchResponse,
  SessionUser,
  SignUpRequest,
  SuggestResponse,
  TaxonomyKind,
  TaxonomyList,
  TaxonomyTerm,
} from "@/types/api";

interface Ctx {
  signal?: AbortSignal;
}

// ─── auth ────────────────────────────────────────────────────────────────────
//
// Paths are all in this one object deliberately: /auth/forgot-password and
// /auth/reset-password are an agreed contract the backend hasn't implemented yet, so
// if the final names differ, renaming them is a single-file edit.

export const authApi = {
  me: ({
    signal,
    suppressUnauthorizedRedirect,
  }: Ctx & { suppressUnauthorizedRedirect?: boolean } = {}): Promise<SessionUser> =>
    USE_MOCKS
      ? mockAuth.me(signal)
      : api.get<SessionUser>("/auth/me", {
          signal,
          suppressUnauthorizedRedirect,
        }),

  login: (email: string, password: string): Promise<SessionUser> =>
    USE_MOCKS
      ? mockAuth.login(email, password)
      : api.post<SessionUser>("/auth/login", { email, password }),

  logout: (): Promise<void> =>
    USE_MOCKS ? mockAuth.logout() : api.post<void>("/auth/logout"),

  /** 201 + SessionUser, but no session cookie — the account is unverified. */
  signup: (body: SignUpRequest): Promise<SessionUser> =>
    USE_MOCKS
      ? mockAuth.signup(body)
      : api.post<SessionUser>("/auth/signup", body),

  /** 200 + SessionUser AND sets the session cookies, so this logs the user in. */
  verifyEmail: (token: string): Promise<SessionUser> =>
    USE_MOCKS
      ? mockAuth.verifyEmail(token)
      : api.post<SessionUser>("/auth/verify-email", { token }),

  /** 204 whether or not the account exists — never surface a difference to the user. */
  resendVerification: (email: string): Promise<void> =>
    USE_MOCKS
      ? mockAuth.resendVerification(email)
      : api.post<void>("/auth/resend-verification", { email }),

  /** 204 always, same non-enumerating contract as resendVerification. */
  forgotPassword: (email: string): Promise<void> =>
    USE_MOCKS
      ? mockAuth.forgotPassword(email)
      : api.post<void>("/auth/forgot-password", { email }),

  /** 200 + SessionUser + cookies, and revokes the user's other sessions. */
  resetPassword: (token: string, password: string): Promise<SessionUser> =>
    USE_MOCKS
      ? mockAuth.resetPassword(token, password)
      : api.post<SessionUser>("/auth/reset-password", { token, password }),

  /**
   * Mock-mode stand-in for the backend's Google callback having already set the
   * session cookie. In real mode there is nothing to call — the browser arrives
   * at /auth/callback authenticated, and `me()` picks the session up.
   */
  completeGoogleMock: (): Promise<SessionUser> => mockAuth.completeGoogle(),
};

// ─── search ──────────────────────────────────────────────────────────────────

export const searchApi = {
  global: (
    query: string,
    limit = 5,
    { signal }: Ctx = {},
  ): Promise<GlobalSearchResponse> =>
    USE_MOCKS
      ? mockSearch.global(query, limit, signal)
      : api.get<GlobalSearchResponse>("/search", {
          signal,
          query: { q: query, limit },
        }),

  suggest: (
    query: string,
    limit = 8,
    { signal }: Ctx = {},
  ): Promise<SuggestResponse> =>
    USE_MOCKS
      ? mockSearch.suggest(query, limit, signal)
      : api.get<SuggestResponse>("/search/suggest", {
          signal,
          query: { q: query, limit },
        }),

  creators: (
    req: CreatorSearchRequest,
    { signal }: Ctx = {},
  ): Promise<SearchResponse<CreatorRow>> =>
    USE_MOCKS
      ? mockSearch.creators(req, signal)
      : api.post<SearchResponse<CreatorRow>>("/search/creators", req, {
          signal,
        }),

  brands: (
    req: BrandSearchRequest,
    { signal }: Ctx = {},
  ): Promise<SearchResponse<BrandRow>> =>
    USE_MOCKS
      ? mockSearch.brands(req, signal)
      : api.post<SearchResponse<BrandRow>>("/search/brands", req, { signal }),

  campaigns: (
    req: CampaignSearchRequest,
    { signal }: Ctx = {},
  ): Promise<SearchResponse<CampaignRow>> =>
    USE_MOCKS
      ? mockSearch.campaigns(req, signal)
      : api.post<SearchResponse<CampaignRow>>("/search/campaigns", req, {
          signal,
        }),

  pitches: (
    req: PitchSearchRequest,
    { signal }: Ctx = {},
  ): Promise<SearchResponse<PitchRow>> =>
    USE_MOCKS
      ? mockSearch.pitches(req, signal)
      : api.post<SearchResponse<PitchRow>>("/search/pitches", req, { signal }),
};

// ─── facets ──────────────────────────────────────────────────────────────────

export const facetsApi = {
  creators: ({ signal }: Ctx = {}): Promise<CreatorFacets> =>
    USE_MOCKS
      ? mockFacets.creators(signal)
      : api.get<CreatorFacets>("/search/facets/creators", { signal }),
  brands: ({ signal }: Ctx = {}): Promise<BrandFacets> =>
    USE_MOCKS
      ? mockFacets.brands(signal)
      : api.get<BrandFacets>("/search/facets/brands", { signal }),
  campaigns: ({ signal }: Ctx = {}): Promise<CampaignFacets> =>
    USE_MOCKS
      ? mockFacets.campaigns(signal)
      : api.get<CampaignFacets>("/search/facets/campaigns", { signal }),
  pitches: ({ signal }: Ctx = {}): Promise<PitchFacets> =>
    USE_MOCKS
      ? mockFacets.pitches(signal)
      : api.get<PitchFacets>("/search/facets/pitches", { signal }),
};

// ─── taxonomy ────────────────────────────────────────────────────────────────
//
// Ingest rejects any category or language it doesn't already know, so these are
// how the vocabularies get maintained. Writes need the ingest permission.

export const taxonomyApi = {
  list: (kind: TaxonomyKind, { signal }: Ctx = {}): Promise<TaxonomyList> =>
    USE_MOCKS
      ? mockTaxonomy.list(kind, signal)
      : api.get<TaxonomyList>(`/taxonomy/${kind}`, { signal }),

  create: (kind: TaxonomyKind, name: string): Promise<TaxonomyTerm> =>
    USE_MOCKS
      ? mockTaxonomy.create(kind, name)
      : api.post<TaxonomyTerm>(`/taxonomy/${kind}`, { name }),

  rename: (kind: TaxonomyKind, id: number, name: string): Promise<TaxonomyTerm> =>
    USE_MOCKS
      ? mockTaxonomy.rename(kind, id, name)
      : api.patch<TaxonomyTerm>(`/taxonomy/${kind}/${id}`, { name }),

  /** 409 when creators still reference the term — the detail names the count. */
  remove: (kind: TaxonomyKind, id: number): Promise<void> =>
    USE_MOCKS
      ? mockTaxonomy.remove(kind, id)
      : api.del(`/taxonomy/${kind}/${id}`),
};

// ─── detail ──────────────────────────────────────────────────────────────────

export const detailApi = {
  creator: (id: string, { signal }: Ctx = {}): Promise<CreatorDetail> =>
    USE_MOCKS
      ? mockDetail.creator(id, signal)
      : api.get<CreatorDetail>(`/creators/${id}`, { signal }),

  brand: (id: number, { signal }: Ctx = {}): Promise<BrandDetail> =>
    USE_MOCKS
      ? mockDetail.brand(id, signal)
      : api.get<BrandDetail>(`/brands/${id}`, { signal }),

  campaign: (id: string, { signal }: Ctx = {}): Promise<CampaignDetail> =>
    USE_MOCKS
      ? mockDetail.campaign(id, signal)
      : api.get<CampaignDetail>(`/campaigns/${id}`, { signal }),

  pitch: (id: string, { signal }: Ctx = {}): Promise<PitchDetail> =>
    USE_MOCKS
      ? mockDetail.pitch(id, signal)
      : api.get<PitchDetail>(`/pitches/${id}`, { signal }),
};

// ─── ingestion ───────────────────────────────────────────────────────────────

export const ingestApi = {
  sources: ({ signal }: Ctx = {}): Promise<{ sources: IngestSourceInfo[] }> =>
    USE_MOCKS
      ? mockIngest.sources(signal)
      : api.get<{ sources: IngestSourceInfo[] }>("/ingest/sources", { signal }),

  jobs: ({ signal }: Ctx = {}): Promise<{ jobs: IngestJob[] }> =>
    USE_MOCKS
      ? mockIngest.jobs(signal)
      : api.get<{ jobs: IngestJob[] }>("/ingest/jobs", {
          signal,
          query: { limit: 20 },
        }),

  job: (jobId: string, { signal }: Ctx = {}): Promise<IngestJob> =>
    USE_MOCKS
      ? mockIngest.job(jobId, signal)
      : api.get<IngestJob>(`/ingest/jobs/${jobId}`, { signal }),

  runAppsScript: (source: IngestSource): Promise<IngestJob> =>
    USE_MOCKS
      ? mockIngest.runAppsScript(source)
      : api.post<IngestJob>(`/ingest/apps-script/${source}`),

  upload: (
    source: IngestSource,
    rows: unknown[],
    dryRun: boolean,
    fileName: string,
  ): Promise<IngestJob> => {
    if (USE_MOCKS) return mockIngest.upload(source, rows, dryRun);
    // Sent as a file rather than a JSON body so large exports stream, and so the
    // backend can keep the original filename on the job record.
    const formData = new FormData();
    formData.append(
      "file",
      new File([JSON.stringify(rows)], fileName, { type: "application/json" }),
    );
    formData.append("source", source);
    formData.append("dry_run", String(dryRun));
    return api.upload<IngestJob>("/ingest/upload", formData);
  },
};
