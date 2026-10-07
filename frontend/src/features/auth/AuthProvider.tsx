import { createContext, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ApiError, setUnauthorizedHandler } from '@/lib/api-client';
import { authApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/query-client';
import type { SessionUser } from '@/types/api';
import { setObservabilityUser } from '@/lib/observability';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  canIngest: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  /** Re-reads /auth/me — used after the Google redirect lands back here. */
  refresh: () => Promise<void>;
  /**
   * Adopts a session the caller already has. /auth/verify-email and
   * /auth/reset-password both set the cookies *and* return the SessionUser, so the
   * page can seed the cache directly instead of invalidating and refetching /auth/me.
   */
  setSession: (user: SessionUser) => void;
  loginError: unknown;
  isLoggingIn: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  /**
   * The session lives in an httpOnly cookie, so the only way to know who we are is
   * to ask. This single query is the app's auth state; guards wait on it rather
   * than assuming, which avoids a login-page flash on every reload.
   */
  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => authApi.me({ signal, suppressUnauthorizedRedirect: true }),
    retry: false,
    staleTime: 5 * 60_000,
    // A 401 here is the expected "not logged in" answer, not an error to surface.
    throwOnError: false,
  });
  const userId = sessionQuery.data?.id ?? null;
  useEffect(() => {
    setObservabilityUser(userId);
  }, [userId]);

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.session, user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      // Clear everything: cached search results were fetched under the old session.
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });

  /** Any 401 from anywhere means the session is gone — bounce to login once. */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.setQueryData(queryKeys.session, null);
      const { pathname, search } = window.location;
      if (pathname !== '/login') {
        const next = encodeURIComponent(`${pathname}${search}`);
        navigate(`/login?next=${next}`, { replace: true });
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, queryClient]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.session });
  }, [queryClient]);

  const setSession = useCallback(
    (user: SessionUser) => {
      queryClient.setQueryData(queryKeys.session, user);
    },
    [queryClient],
  );

  const status: AuthStatus = useMemo(() => {
    if (sessionQuery.isPending) return 'loading';
    if (sessionQuery.data) return 'authenticated';
    return 'unauthenticated';
  }, [sessionQuery.isPending, sessionQuery.data]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: sessionQuery.data ?? null,
      canIngest: sessionQuery.data?.permissions?.can_ingest ?? false,
      login: (email, password) => loginMutation.mutateAsync({ email, password }),
      logout: () => logoutMutation.mutateAsync(),
      refresh,
      setSession,
      loginError: loginMutation.error,
      isLoggingIn: loginMutation.isPending,
    }),
    [status, sessionQuery.data, loginMutation, logoutMutation, refresh, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Narrow an unknown login failure into something worth showing a person. */
export function describeAuthError(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    // Check the specific code before the status: 403 covers both "wrong domain" and
    // "not verified", and telling someone the wrong one sends them down a dead end.
    if (error.code === 'not_verified') {
      return 'This account has not been verified yet.';
    }
    if (error.code === 'invalid_token') {
      return 'That link is no longer valid. Request a new one.';
    }
    if (error.code === 'rate_limited' || error.status === 429) {
      return 'Too many attempts. Please wait a moment and try again.';
    }
    if (error.code === 'domain_not_allowed' || error.status === 403) {
      return 'Only @ripplelinks.com accounts can sign in.';
    }
    if (error.status === 401) return 'Incorrect email or password.';
    if (error.status === 0) return 'Could not reach the server. Is the backend running?';
    return error.detail;
  }
  return 'Sign in failed. Please try again.';
}
