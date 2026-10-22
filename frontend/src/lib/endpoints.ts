/**
 * The single place that knows an endpoint's path and shape. Components and
 * hooks call these functions and never construct a URL themselves.
 */
import { api } from "./api-client";
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
  CreatorSummary,
  CreatorSummaryRequest,
  CreatorUpdate,
  EditRecord,
  EditSession,
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
  }: Ctx & {
    suppressUnauthorizedRedirect?: boolean;
  } = {}): Promise<SessionUser> =>
    api.get<SessionUser>("/auth/me", {
      signal,
      suppressUnauthorizedRedirect,
    }),

  login: (email: string, password: string): Promise<SessionUser> =>
    api.post<SessionUser>("/auth/login", { email, password }),

  logout: (): Promise<void> => api.post<void>("/auth/logout"),

  /** 201 + SessionUser, but no session cookie — the account is unverified. */
  signup: (body: SignUpRequest): Promise<SessionUser> =>
    api.post<SessionUser>("/auth/signup", body),

  /** 200 + SessionUser AND sets the session cookies, so this logs the user in. */
  verifyEmail: (token: string): Promise<SessionUser> =>
    api.post<SessionUser>("/auth/verify-email", { token }),

  /** 204 whether or not the account exists — never surface a difference to the user. */
  resendVerification: (email: string): Promise<void> =>
    api.post<void>("/auth/resend-verification", { email }),

  /** 204 always, same non-enumerating contract as resendVerification. */
  forgotPassword: (email: string): Promise<void> =>
    api.post<void>("/auth/forgot-password", { email }),

  /** 200 + SessionUser + cookies, and revokes the user's other sessions. */
  resetPassword: (token: string, password: string): Promise<SessionUser> =>
    api.post<SessionUser>("/auth/reset-password", { token, password }),
};

// ─── search ──────────────────────────────────────────────────────────────────

export const searchApi = {
  global: (
    query: string,
    limit = 5,
    { signal }: Ctx = {},
  ): Promise<GlobalSearchResponse> =>
    api.get<GlobalSearchResponse>("/search", {
      signal,
      query: { q: query, limit },
    }),

  suggest: (
    query: string,
    limit = 8,
    { signal }: Ctx = {},
  ): Promise<SuggestResponse> =>
    api.get<SuggestResponse>("/search/suggest", {
      signal,
      query: { q: query, limit },
    }),

  creators: (
    req: CreatorSearchRequest,
    { signal }: Ctx = {},
  ): Promise<SearchResponse<CreatorRow>> =>
    api.post<SearchResponse<CreatorRow>>("/search/creators", req, {
      signal,
    }),

  brands: (
    req: BrandSearchRequest,
    { signal }: Ctx = {},
  ): Promise<SearchResponse<BrandRow>> =>
    api.post<SearchResponse<BrandRow>>("/search/brands", req, { signal }),

  campaigns: (
    req: CampaignSearchRequest,
    { signal }: Ctx = {},
  ): Promise<SearchResponse<CampaignRow>> =>
    api.post<SearchResponse<CampaignRow>>("/search/campaigns", req, {
      signal,
    }),

  pitches: (
    req: PitchSearchRequest,
    { signal }: Ctx = {},
  ): Promise<SearchResponse<PitchRow>> =>
    api.post<SearchResponse<PitchRow>>("/search/pitches", req, { signal }),
};

// ─── facets ──────────────────────────────────────────────────────────────────

export const facetsApi = {
  creators: ({ signal }: Ctx = {}): Promise<CreatorFacets> =>
    api.get<CreatorFacets>("/search/facets/creators", { signal }),
  brands: ({ signal }: Ctx = {}): Promise<BrandFacets> =>
    api.get<BrandFacets>("/search/facets/brands", { signal }),
  campaigns: ({ signal }: Ctx = {}): Promise<CampaignFacets> =>
    api.get<CampaignFacets>("/search/facets/campaigns", { signal }),
  pitches: ({ signal }: Ctx = {}): Promise<PitchFacets> =>
    api.get<PitchFacets>("/search/facets/pitches", { signal }),
};

// ─── taxonomy ────────────────────────────────────────────────────────────────
//
// Ingest rejects any category or language it doesn't already know, so these are
// how the vocabularies get maintained. Writes need the ingest permission.

export const taxonomyApi = {
  list: (kind: TaxonomyKind, { signal }: Ctx = {}): Promise<TaxonomyList> =>
    api.get<TaxonomyList>(`/taxonomy/${kind}`, { signal }),

  create: (kind: TaxonomyKind, name: string): Promise<TaxonomyTerm> =>
    api.post<TaxonomyTerm>(`/taxonomy/${kind}`, { name }),

  rename: (
    kind: TaxonomyKind,
    id: number,
    name: string,
  ): Promise<TaxonomyTerm> =>
    api.patch<TaxonomyTerm>(`/taxonomy/${kind}/${id}`, { name }),

  /** 409 when creators still reference the term — the detail names the count. */
  remove: (kind: TaxonomyKind, id: number): Promise<void> =>
    api.del(`/taxonomy/${kind}/${id}`),
};

// ─── detail ──────────────────────────────────────────────────────────────────

export const detailApi = {
  creator: (id: string, { signal }: Ctx = {}): Promise<CreatorDetail> =>
    api.get<CreatorDetail>(`/creators/${id}`, { signal }),

  brand: (id: number, { signal }: Ctx = {}): Promise<BrandDetail> =>
    api.get<BrandDetail>(`/brands/${id}`, { signal }),

  campaign: (id: string, { signal }: Ctx = {}): Promise<CampaignDetail> =>
    api.get<CampaignDetail>(`/campaigns/${id}`, { signal }),

  pitch: (id: string, { signal }: Ctx = {}): Promise<PitchDetail> =>
    api.get<PitchDetail>(`/pitches/${id}`, { signal }),
};

// ─── feedback ────────────────────────────────────────────────────────────────
//
// The redesign puts a "tell us what's not working" button in the header, next to
// the account avatar. There is no /feedback route on the backend yet, so the
// caller treats a missing-endpoint 404 as "fall back to the mail client" rather
// than as an error — see FeedbackDialog. Written here, with the rest of the
// paths, so wiring it up later is a one-line change in this file.

export interface FeedbackRequest {
  /** One of the three chips: what kind of report this is. */
  kind: string;
  message: string;
  /** Where the reporter was when they hit the button — the first thing anyone triaging asks. */
  page: string;
}

export const feedbackApi = {
  send: (body: FeedbackRequest): Promise<void> =>
    api.post<void>("/feedback", body),
};

// ─── ingestion ───────────────────────────────────────────────────────────────
// ─── ingestion ───────────────────────────────────────────────────────────────

/** What the backend sends for a job: the counts sit directly on it. */
interface RawIngestJob extends Omit<IngestJob, "counts" | "errors"> {
  received: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors_truncated: number;
  errors: IngestJob["errors"] | null;
}

/** The screens group the counts under `counts`; this is the one place that translates. */
function toJob(raw: RawIngestJob): IngestJob {
  const {
    received,
    inserted,
    updated,
    skipped,
    failed,
    errors_truncated,
    errors,
    ...rest
  } = raw;
  return {
    ...rest,
    counts: {
      received,
      inserted,
      updated,
      skipped,
      failed,
      errors_truncated: errors_truncated ?? 0,
    },
    errors: errors ?? [],
  };
}

export const ingestApi = {
  sources: async ({ signal }: Ctx = {}): Promise<{
    sources: IngestSourceInfo[];
  }> => {
    const raw = await api.get<
      (Omit<IngestSourceInfo, "last_job"> & { last_job: RawIngestJob | null })[]
    >("/ingest/sources", { signal });
    return {
      sources: raw.map((s) => ({
        ...s,
        last_job: s.last_job ? toJob(s.last_job) : null,
      })),
    };
  },

  jobs: async ({ signal }: Ctx = {}): Promise<{ jobs: IngestJob[] }> => {
    const raw = await api.get<{ jobs: RawIngestJob[] }>("/ingest/jobs", {
      signal,
      query: { limit: 20 },
    });
    return { jobs: raw.jobs.map(toJob) };
  },

  job: async (jobId: string, { signal }: Ctx = {}): Promise<IngestJob> =>
    toJob(await api.get<RawIngestJob>(`/ingest/jobs/${jobId}`, { signal })),

  /** Saves a checked file for real. Returns the new job, which the backend runs in the background. */
  commit: async (jobId: string): Promise<IngestJob> =>
    toJob(await api.post<RawIngestJob>(`/ingest/jobs/${jobId}/commit`)),

  upload: async (
    source: IngestSource,
    rows: unknown[],
    dryRun: boolean,
    fileName: string,
  ): Promise<IngestJob> => {
    // Sent as a file so large exports stream and the backend keeps the file name on the job.
    const formData = new FormData();
    formData.append(
      "file",
      new File([JSON.stringify(rows)], fileName, { type: "application/json" }),
    );
    formData.append("source", source);
    formData.append("dry_run", String(dryRun));
    return toJob(await api.upload<RawIngestJob>("/ingest/upload", formData));
  },
};

// ─── creator analytics and editing ──────────────────────────────────────────

export const analyticsApi = {
  /** Counts for the data-quality dashboard. The database does the counting. */
  creatorSummary: (
    req: CreatorSummaryRequest,
    { signal }: Ctx = {},
  ): Promise<CreatorSummary> =>
    api.post<CreatorSummary>("/analytics/creators/summary", req, { signal }),
};

export const creatorEditApi = {
  /** Claims the edit lock (call again every minute to renew) and returns the row with its version. */
  open: (id: string): Promise<EditSession> =>
    api.post<EditSession>(`/creators/${id}/lock`),

  /** Releases our lock (or, for an admin with force, someone else's). A failed release is harmless: it expires. */
  close: (id: string, force = false): Promise<void> =>
    api.del(`/creators/${id}/lock${force ? "?force=true" : ""}`),

  /** 409 = someone changed it since you opened it, 423 = someone else holds the lock. */
  save: (id: string, body: CreatorUpdate): Promise<EditRecord> =>
    api.patch<EditRecord>(`/creators/${id}`, body),
};
