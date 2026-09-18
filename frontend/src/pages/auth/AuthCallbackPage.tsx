import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LoadingState } from '@/components/states';
import { useAuth } from "@/features/auth/useAuth";

/**
 * Where the backend's Google callback sends the browser once it has set the
 * session cookie. There is no token to exchange here — the cookie is already in
 * place, so this just re-reads /auth/me and forwards to wherever the user was
 * heading. Failures come back as ?auth_error= on /login instead of landing here.
 */
export function AuthCallbackPage() {
  const { refresh, status } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const next = searchParams.get('next') || '/search';
  const authError = searchParams.get('auth_error');

  useEffect(() => {
    if (authError) {
      navigate(`/login?auth_error=${encodeURIComponent(authError)}`, { replace: true });
      return;
    }
    void refresh();
  }, [authError, navigate, refresh]);

  useEffect(() => {
    if (authError) return;
    if (status === 'authenticated') navigate(next, { replace: true });
    if (status === 'unauthenticated') {
      navigate(`/login?auth_error=unknown&next=${encodeURIComponent(next)}`, { replace: true });
    }
  }, [status, authError, navigate, next]);

  return <LoadingState label="Finishing sign-in…" />;
}
