import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import { authApi } from '@/lib/endpoints';
import { useCooldown } from '@/hooks/useCooldown';
import { ALLOWED_EMAIL_DOMAINS, validateWorkEmail } from './domain';

/**
 * Requests a fresh verification email.
 *
 * The backend returns 204 whether or not the account exists, so this always renders
 * the same neutral confirmation — showing "no such account" here would hand an
 * attacker an account-enumeration oracle that the endpoint deliberately avoids.
 */
export function ResendVerificationForm({
  defaultEmail = '',
  compact = false,
}: {
  defaultEmail?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [touched, setTouched] = useState(false);

  const resend = useMutation({
    mutationFn: (value: string) => authApi.resendVerification(value),
  });

  const rateLimit = resend.error instanceof ApiError ? resend.error : null;
  const { remaining, isCoolingDown } = useCooldown(rateLimit?.retryAfterSeconds);

  const localError = touched ? validateWorkEmail(email) : null;

  if (resend.isSuccess) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-[var(--success)]/40 bg-[var(--success)]/10 p-2.5 text-xs text-[var(--success)]">
        <CheckCircle2 className="mt-px size-3.5 shrink-0" />
        <span>
          If an unverified account exists for that address, a new verification link is on its way.
          It expires in 24 hours.
        </span>
      </p>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (validateWorkEmail(email) || !email.trim() || isCoolingDown) return;
    resend.mutate(email.trim());
  };

  return (
    <form onSubmit={submit} className="space-y-2.5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="resend-email">{compact ? 'Resend to' : 'Work email'}</Label>
        <Input
          id="resend-email"
          type="email"
          autoComplete="username"
          placeholder={`you@${ALLOWED_EMAIL_DOMAINS[0]}`}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={Boolean(localError)}
        />
        {localError && <p className="text-[11px] text-destructive">{localError}</p>}
      </div>

      {rateLimit?.isRateLimited && (
        <p className="text-[11px] text-[var(--warning)]">
          Too many requests.{' '}
          {isCoolingDown ? `Try again in ${remaining}s.` : 'You can try again now.'}
        </p>
      )}
      {rateLimit && !rateLimit.isRateLimited && (
        <p className="text-[11px] text-destructive">{rateLimit.detail}</p>
      )}

      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={resend.isPending || isCoolingDown}
      >
        {resend.isPending ? <Loader2 className="animate-spin" /> : <Send />}
        {isCoolingDown ? `Resend in ${remaining}s` : 'Resend verification email'}
      </Button>
    </form>
  );
}
