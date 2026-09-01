import type { AuthErrorCode } from '@/types/api';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly code: AuthErrorCode | string | null;
  readonly path: string;
  /** Seconds to wait, from a 429's `Retry-After` header. Null when absent/unreadable. */
  readonly retryAfterSeconds: number | null;

  constructor(opts: {
    status: number;
    detail: string;
    code?: string | null;
    path: string;
    retryAfterSeconds?: number | null;
  }) {
    super(opts.detail);
    this.name = 'ApiError';
    this.status = opts.status;
    this.detail = opts.detail;
    this.code = opts.code ?? null;
    this.path = opts.path;
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** A 404 on a path that simply hasn't been built yet, vs a genuinely missing record. */
  get isMissingEndpoint(): boolean {
    return this.status === 404 && !/\/[0-9a-f-]{8,}$/i.test(this.path);
  }
}

/**
 * Called when any request comes back 401. Wired up by the auth layer so a lost
 * session redirects to login from anywhere, without every caller handling it.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

/**
 * Cookie sessions need CSRF protection. The backend sets a readable `csrf_token`
 * cookie alongside the httpOnly session cookie; we echo it in a header on every
 * mutating request (the double-submit pattern).
 */
function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Passed through from TanStack Query's queryFn so superseded requests abort. */
  signal?: AbortSignal;
  /** Multipart uploads set their own Content-Type via FormData. */
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip the global 401→login redirect; the caller treats 401 as a valid answer. */
  suppressUnauthorizedRedirect?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, formData, query } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (method !== 'GET') {
    const csrf = readCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      // The session is an httpOnly cookie, so every request must carry credentials.
      credentials: 'include',
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (error) {
    // Let genuine aborts propagate — TanStack Query treats them as cancellations
    // rather than failures, and surfacing them as errors would flash the UI.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({
      status: 0,
      detail: 'Could not reach the API. Is the backend running?',
      path,
    });
  }

  if (response.status === 401) {
    if (!options.suppressUnauthorizedRedirect) onUnauthorized?.();
    throw new ApiError({ status: 401, detail: 'Your session has expired.', path });
  }

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      detail: await extractDetail(response),
      code: response.headers.get('X-Error-Code'),
      path,
      retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
    });
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * RFC 9110 allows `Retry-After` in two forms: delta-seconds ("45") or an HTTP-date
 * ("Wed, 21 Oct 2026 07:28:00 GMT"). Accept both, and never return a negative wait —
 * a date already in the past means "retry now", not "retry in -3 seconds".
 */
export function parseRetryAfter(raw: string | null): number | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));

  const asDate = Date.parse(trimmed);
  if (Number.isNaN(asDate)) return null;
  return Math.max(0, Math.round((asDate - Date.now()) / 1000));
}

async function extractDetail(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as unknown;
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object' && 'detail' in data) {
      const { detail } = data as { detail: unknown };
      if (typeof detail === 'string') return detail;
      // FastAPI validation errors arrive as a list of {loc, msg, type}.
      if (Array.isArray(detail)) {
        return detail
          .map((item) =>
            item && typeof item === 'object' && 'msg' in item
              ? String((item as { msg: unknown }).msg)
              : JSON.stringify(item),
          )
          .join('; ');
      }
    }
    return response.statusText || `Request failed with status ${response.status}`;
  } catch {
    return response.statusText || `Request failed with status ${response.status}`;
  }
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'PATCH', body }),
  del: <T = void>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData, opts?: Omit<RequestOptions, 'method'>) =>
    apiRequest<T>(path, { ...opts, method: 'POST', formData }),
};

/**
 * The Google flow is a full-page navigation, not a fetch — the browser has to
 * follow the redirect to Google and back for the backend to set the cookie.
 */
export function googleLoginUrl(next: string): string {
  return `${API_BASE_URL}/auth/google/login?next=${encodeURIComponent(next)}`;
}
