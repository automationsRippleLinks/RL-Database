import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, LinkIcon } from 'lucide-react';
import { Button } from '@/components/UI/button';
import { ApiError } from '@/lib/api-client';
import { authApi } from '@/lib/endpoints';
import { useCooldown } from '@/hooks/useCooldown';
import { AuthShell } from "@/features/auth/AuthShell";
import {
  PasswordFields,
  passwordsReady,
  type PasswordState,
} from "@/features/auth/PasswordFields";
import { useAuth } from "@/features/auth/useAuth";

/**
 * Landing page for the reset link ({FRONTEND_URL}/reset-password?token=…).
 *
 * Per the agreed contract, a successful reset sets the session cookies and revokes the
 * user's other sessions — so this signs them in here and warns that other devices were
 * logged out, which is otherwise a surprising side effect.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const token = searchParams.get('token');

  const [passwords, setPasswords] = useState<PasswordState>({ password: '', confirm: '' });
  const [touched, setTouched] = useState(false);

  const reset = useMutation({
    mutationFn: () => authApi.resetPassword(token!, passwords.password),
    // Cookies are set by the response; adopt the returned user directly.
    onSuccess: (user) => setSession(user),
  });

  const error = reset.error instanceof ApiError ? reset.error : null;
  const { remaining, isCoolingDown } = useCooldown(error?.retryAfterSeconds);

  useEffect(() => {
    if (!reset.isSuccess) return;
    const timer = setTimeout(() => navigate('/search', { replace: true }), 1600);
    return () => clearTimeout(timer);
  }, [reset.isSuccess, navigate]);

  // A missing token and a dead token lead to the same place: request a new link.
  const tokenRejected = error?.code === 'invalid_token' || error?.status === 400;
  if (!token || tokenRejected) {
    return (
      <AuthShell
        documentTitle="Reset password"
        title={token ? 'This link has expired' : 'Reset link incomplete'}
        subtitle={
          token
            ? 'Reset links are single-use. Request a fresh one to continue.'
            : "That link didn't include a token. Request a fresh one to continue."
        }
        footer={
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3">
          <LinkIcon className="size-8 text-[var(--warning)]" />
          <Button asChild size="sm" className="w-full">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthShell
        documentTitle="Password updated"
        title="Password updated"
        subtitle="You're signed in on this device. Taking you to the database…"
      >
        <div className="flex flex-col items-center gap-3 py-2">
          <CheckCircle2 className="size-8 text-[var(--success)]" />
          <p className="text-center text-[11px] text-muted-foreground">
            For safety, any other sessions you had open were signed out.
          </p>
          <Button asChild size="sm" className="w-full">
            <Link to="/search">Continue</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!passwordsReady(passwords) || isCoolingDown) return;
    reset.mutate();
  };

  return (
    <AuthShell
      documentTitle="Set a new password"
      title="Set a new password"
      subtitle="Choose something you haven't used here before."
      footer={
        <Link to="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <PasswordFields
          value={passwords}
          onChange={setPasswords}
          touched={touched}
          label="New password"
        />

        {error?.isRateLimited && (
          <div className="flex gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-2.5 text-xs text-[var(--warning)]">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>
              Too many attempts.{' '}
              {isCoolingDown ? `Try again in ${remaining}s.` : 'You can try again now.'}
            </span>
          </div>
        )}
        {error && !error.isRateLimited && (
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>{error.detail}</span>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={reset.isPending || isCoolingDown}>
          {reset.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {isCoolingDown ? `Try again in ${remaining}s` : 'Update password'}
        </Button>
      </form>
    </AuthShell>
  );
}
