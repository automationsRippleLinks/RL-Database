import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Database, Loader2, LogIn, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, googleLoginUrl } from '@/lib/api-client';
import { useAuth } from './useAuth'; 
import { describeAuthError } from './AuthProvider';
import { ResendVerificationForm } from './ResendVerificationForm';
import { ALLOWED_EMAIL_DOMAINS, validateWorkEmail } from './domain';
import type { AuthErrorCode } from '@/types/api';

/** Messages for the ?auth_error= the backend appends when the Google flow fails. */
const GOOGLE_ERRORS: Record<AuthErrorCode, string> = {
  domain_not_allowed: `That Google account isn't on the ${ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' / ')} domain.`,
  google_denied: 'Google sign-in was cancelled.',
  google_no_email: 'Google did not return a verified email address for that account.',
  state_mismatch: 'Sign-in expired before it completed. Please try again.',
  invalid_credentials: 'Incorrect email or password.',
  not_verified: 'This account has not been verified yet.',
  invalid_token: 'That link is no longer valid. Request a new one.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  unknown: 'Sign-in failed. Please try again.',
};

export function LoginPage() {
  const { status, login, loginError, isLoggingIn } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);

  const next = searchParams.get('next') || '/search';
  const authErrorParam = searchParams.get('auth_error') as AuthErrorCode | null;

  const domainError = useMemo(() => (touched ? validateWorkEmail(email) : null), [email, touched]);
  const serverError = describeAuthError(loginError);
  const googleError = authErrorParam ? (GOOGLE_ERRORS[authErrorParam] ?? GOOGLE_ERRORS.unknown) : null;

  // The backend answers an unverified account with 403 + X-Error-Code: not_verified.
  // Fall back to the ?auth_error= param too, since the Google callback can also land
  // here with not_verified, and the header isn't readable cross-origin without
  // `expose_headers` on the backend's CORS config.
  const needsVerification =
    (loginError instanceof ApiError && loginError.code === 'not_verified') ||
    authErrorParam === 'not_verified';

  useEffect(() => {
    document.title = 'Sign in · Ripple Pulse';
  }, []);

  if (status === 'authenticated') return <Navigate to={next} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (validateWorkEmail(email) || !password) return;
    try {
      await login(email, password);
    } catch {
      // Rendered from loginError below.
    }
  };

  const startGoogle = () => {
    // A full-page navigation, not a fetch: the browser has to follow the redirect
    // to Google and back for the backend to be able to set the session cookie.
    window.location.assign(googleLoginUrl(next));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Database className="size-5" />
          </div>
          <h1 className="text-lg font-semibold">Ripple Pulse</h1>
          <p className="text-xs text-muted-foreground">
            Internal creator, campaign and pitch directory.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
          {googleError && (
            <div className="mb-4 flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span>{googleError}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3.5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                placeholder={`you@${ALLOWED_EMAIL_DOMAINS[0]}`}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={Boolean(domainError)}
                aria-describedby={domainError ? 'email-error' : undefined}
              />
              {domainError && (
                <p id="email-error" className="text-[11px] text-destructive">
                  {domainError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-[11px] text-muted-foreground transition-colors hover:text-primary"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {serverError && !domainError && (
              <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoggingIn}>
              {isLoggingIn ? <Loader2 className="animate-spin" /> : <LogIn />}
              Sign in
            </Button>
          </form>

          {/*
            An unverified account is the one login failure with an obvious next
            action, so offer it right here instead of leaving a dead-end message.
          */}
          {needsVerification && (
            <div className="mt-4 space-y-2.5 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3">
              <p className="flex gap-2 text-xs text-[var(--warning)]">
                <MailWarning className="mt-px size-3.5 shrink-0" />
                <span>This account hasn't been verified yet. Send yourself a new link.</span>
              </p>
              <ResendVerificationForm defaultEmail={email.trim()} compact />
            </div>
          )}

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={startGoogle}
          >
            <GoogleMark />
            Continue with Google
          </Button>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Restricted to {ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(', ')} accounts.
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          No account yet?{' '}
          <Link to="/signup" className="text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
