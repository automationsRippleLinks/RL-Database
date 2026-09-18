import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, KeyRound, Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/UI/button';
import { Input } from '@/components/UI/input';
import { Label } from '@/components/UI/label';
import { ApiError } from '@/lib/api-client';
import { authApi } from '@/lib/endpoints';
import { useCooldown } from '@/hooks/useCooldown';
import { AuthShell } from "@/features/auth/AuthShell";
import {
  ALLOWED_EMAIL_DOMAINS,
  validateWorkEmail,
} from "@/features/auth/domain";

/**
 * Requests a password-reset link.
 *
 * The endpoint returns 204 whether or not the account exists, so the confirmation
 * below is deliberately identical either way — the whole point of that contract is
 * that this page can't be used to discover which addresses have accounts.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);

  const request = useMutation({
    mutationFn: (value: string) => authApi.forgotPassword(value),
  });

  const error = request.error instanceof ApiError ? request.error : null;
  const { remaining, isCoolingDown } = useCooldown(error?.retryAfterSeconds);

  const emailError = useMemo(() => (touched ? validateWorkEmail(email) : null), [email, touched]);

  if (request.isSuccess) {
    return (
      <AuthShell
        documentTitle="Reset password"
        title="Check your inbox"
        subtitle={
          <>
            If an account exists for <span className="font-medium">{email.trim()}</span>, a reset
            link is on its way.
          </>
        }
        footer={
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2">
          <MailCheck className="size-8 text-[var(--success)]" />
          <p className="text-center text-xs text-muted-foreground">
            The link is single-use. If it doesn't arrive, check spam before requesting another.
          </p>
        </div>
      </AuthShell>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (validateWorkEmail(email) || !email.trim() || isCoolingDown) return;
    request.mutate(email.trim());
  };

  return (
    <AuthShell
      documentTitle="Reset password"
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Link to="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
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
            aria-invalid={Boolean(emailError)}
          />
          {emailError && <p className="text-[11px] text-destructive">{emailError}</p>}
        </div>

        {error?.isRateLimited && (
          <div className="flex gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-2.5 text-xs text-[var(--warning)]">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>
              Too many requests.{' '}
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

        <Button type="submit" className="w-full" disabled={request.isPending || isCoolingDown}>
          {request.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {isCoolingDown ? `Try again in ${remaining}s` : 'Send reset link'}
        </Button>
      </form>
    </AuthShell>
  );
}
