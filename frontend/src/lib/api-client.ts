import type { AuthErrorCode } from '@/types/api';
import { logger } from './observability';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

// Error information used by the application.
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly code: AuthErrorCode | string | null;
  readonly path: string;
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

  get isMissingEndpoint(): boolean {
    return this.status === 404 && !/\/[0-9a-f-]{8,}$/i.test(this.path);
  }
}

// The authentication layer registers this handler.
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(
  handler: UnauthorizedHandler | null,
) {
  onUnauthorized = handler;
}

// Read the CSRF cookie for requests that change data.
function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;

  // Some authentication checks expect a 401 without redirecting.
  suppressUnauthorizedRedirect?: boolean;
}

// Build the request URL, including any query parameters.
function buildUrl(
  path: string,
  query?: RequestOptions['query'],
): string {
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

// Send failure metadata to Faro.
// Never include request bodies, response bodies or authentication headers.
function logApiFailure(
  path: string,
  method: string,
  status: number,
  startedAt: number,
): void {
  // Remove query parameters, fragments and numeric/UUID record IDs.
  const safePath = path
    .split(/[?#]/)[0]
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,
      '/:id',
    )
    .replace(/\/\d+(?=\/|$)/g, '/:id');

  logger.error('api_request_failed', {
    endpoint: safePath,
    method,
    // Status 0 means no HTTP response was received.
    status: String(status),
    duration_ms: String(Math.round(performance.now() - startedAt)),
  });
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, signal, formData, query } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // Preserve the application's existing CSRF protection.
  if (method !== 'GET') {
    const csrf = readCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  // Start a separate timer for each request.
  const startedAt = performance.now();

  let response: Response;

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      credentials: 'include',
      body:
        formData ??
        (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (error) {
    // Cancelled requests are not failures.
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    logApiFailure(path, method, 0, startedAt);

    throw new ApiError({
      status: 0,
      detail: 'Could not reach the API. Is the backend running?',
      path,
    });
  }

  // Preserve existing authentication handling.
  // These 401 responses are not logged by our failure helper.
  if (response.status === 401) {
    if (!options.suppressUnauthorizedRedirect) {
      onUnauthorized?.();
    }

    throw new ApiError({
      status: 401,
      detail: 'Your session has expired.',
      path,
    });
  }

  // Log unsuccessful HTTP responses.
  if (!response.ok) {
    logApiFailure(path, method, response.status, startedAt);

    throw new ApiError({
      status: response.status,
      detail: await extractDetail(response),
      code: response.headers.get('X-Error-Code'),
      path,
      retryAfterSeconds: parseRetryAfter(
        response.headers.get('Retry-After'),
      ),
    });
  }

  // Successful requests may have no response body.
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;

  return JSON.parse(text) as T;
}

// Convert Retry-After into seconds.
// The header may contain seconds or an HTTP date.
export function parseRetryAfter(raw: string | null): number | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  const seconds = Number(trimmed);

  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds));
  }

  const retryDate = Date.parse(trimmed);
  if (Number.isNaN(retryDate)) return null;

  return Math.max(0, Math.round((retryDate - Date.now()) / 1000));
}

// Read the backend error message for display in the application.
// Our Faro helper does not send this response content.
async function extractDetail(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();

    if (typeof data === 'string') return data;

    if (data && typeof data === 'object' && 'detail' in data) {
      const detail = (data as { detail: unknown }).detail;

      if (typeof detail === 'string') return detail;

      // FastAPI may return several validation messages.
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

    return (
      response.statusText ||
      `Request failed with status ${response.status}`
    );
  } catch {
    return (
      response.statusText ||
      `Request failed with status ${response.status}`
    );
  }
}

// Keep these exports because other application files use them.
export const api = {
  get: <T>(
    path: string,
    opts?: Omit<RequestOptions, 'method' | 'body'>,
  ) => apiRequest<T>(path, { ...opts, method: 'GET' }),

  post: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<RequestOptions, 'method' | 'body'>,
  ) => apiRequest<T>(path, { ...opts, method: 'POST', body }),

  patch: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<RequestOptions, 'method' | 'body'>,
  ) => apiRequest<T>(path, { ...opts, method: 'PATCH', body }),

  del: <T = void>(
    path: string,
    opts?: Omit<RequestOptions, 'method' | 'body'>,
  ) => apiRequest<T>(path, { ...opts, method: 'DELETE' }),

  upload: <T>(
    path: string,
    formData: FormData,
    opts?: Omit<RequestOptions, 'method'>,
  ) => apiRequest<T>(path, { ...opts, method: 'POST', formData }),
};

// Google login uses browser navigation instead of fetch.
export function googleLoginUrl(next: string): string {
  return `${API_BASE_URL}/auth/google/login?next=${encodeURIComponent(next)}`;
}