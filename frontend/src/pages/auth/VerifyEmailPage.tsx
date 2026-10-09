import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { authApi } from '@/lib/endpoints';
import { AuthShell } from "@/features/auth/AuthShell";
import { ResendVerificationForm } from "@/features/auth/ResendVerificationForm";
import { useAuth } from '@/features/auth/useAuth';

type State =
  | { phase: 'verifying' }
  | { phase: 'verified' }
  | { phase: 'failed'; expired: boolean; message: string };

/**
 * Landing page for the link in the verification email
 * ({FRONTEND_URL}/verify-email?token=…).
 *
 * The backend's /auth/verify-email sets the session cookies on success, so verifying
 * also logs the user in — this redirects into the app rather than bouncing them to a
 * login form for credentials they just proved they control.
 *
 * The request is deliberately driven by plain state rather than useMutation: it fires
 * exactly once on mount, and a mutation observer that StrictMode tears down and
 * re-subscribes mid-flight can miss the completion and sit on `pending` forever.
 * Three terminal states don't need an observer.
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const token = searchParams.get('token');

  const [state, setState] = useState<State>({ phase: 'verifying' });

  // The token is single-use server-side, so this must fire once even though
  // StrictMode runs effects twice in dev.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    void (async () => {
      try {
        const user = await authApi.verifyEmail(token);
        setSession(user);
        setState({ phase: 'verified' });
      } catch (error) {
        const apiError = error instanceof ApiError ? error : null;
        setState({
          phase: 'failed',
          expired: apiError?.code === 'invalid_token' || apiError?.status === 400,
          message: apiError?.detail ?? 'Something went wrong. Try requesting a new link.',
        });
      }
    })();
    // setSession is stable (useCallback over queryClient); token is the only real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (state.phase !== 'verified') return;
    const timer = setTimeout(() => navigate('/search', { replace: true }), 1200);
    return () => clearTimeout(timer);
  }, [state.phase, navigate]);

  if (!token) {
    return (
      <AuthShell
        documentTitle="Verify email"
        title="Verification link incomplete"
        subtitle="That link didn't include a token. Request a fresh one below."
      >
        <ResendVerificationForm />
        <BackToLogin />
      </AuthShell>
    );
  }

  if (state.phase === 'verifying') {
    return (
      <AuthShell documentTitle="Verify email" title="Verifying your email…">
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          One moment
        </div>
      </AuthShell>
    );
  }

  if (state.phase === 'verified') {
    return (
      <AuthShell
        documentTitle="Verify email"
        title="Email verified"
        subtitle="You're signed in. Taking you to the database…"
      >
        <div className="flex flex-col items-center gap-3 py-2">
          <CheckCircle2 className="size-8 text-success" />
          <Button asChild size="sm" className="w-full">
            <Link to="/search">Continue</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      documentTitle="Verify email"
      title={state.expired ? 'This link has expired' : "Couldn't verify that link"}
      subtitle={
        state.expired
          ? 'Verification links are single-use and valid for 24 hours. Request a new one below.'
          : state.message
      }
    >
      <div className="mb-4 flex justify-center">
        <MailWarning className="size-8 text-var(--warning)" />
      </div>
      <ResendVerificationForm />
      <BackToLogin />
    </AuthShell>
  );
}

function BackToLogin() {
  return (
    <p className="mt-4 text-center text-[11px] text-muted-foreground">
      <Link to="/login" className="text-primary hover:underline">
        Back to sign in
      </Link>
    </p>
  );
}
