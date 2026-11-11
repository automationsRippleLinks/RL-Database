import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Loader2, MailCheck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import { authApi } from '@/lib/endpoints';
import { AuthShell } from "@/features/auth/AuthShell";
import { PasswordFields, passwordsReady, type PasswordState } from '@/features/auth/PasswordFields';
import { ResendVerificationForm } from '@/features/auth/ResendVerificationForm';
import { ALLOWED_EMAIL_DOMAINS, validateWorkEmail } from '@/features/auth/domain';
import { useAuth } from '@/features/auth/useAuth';

/**
 * Password sign-up. The backend returns 201 + SessionUser but deliberately sets no
 * cookie, because the account starts unverified — so this lands on a "check your
 * inbox" state rather than trying to enter the app.
 */
export function SignUpPage() {
  const { status } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [passwords, setPasswords] = useState<PasswordState>({ password: '', confirm: '' });
  const [touched, setTouched] = useState(false);

  const signup = useMutation({
    mutationFn: () =>
      authApi.signup({ name: name.trim(), email: email.trim(), password: passwords.password }),
  });

  const emailError = useMemo(() => (touched ? validateWorkEmail(email) : null), [email, touched]);

  if (status === 'authenticated') return <Navigate to="/search" replace />;

  if (signup.isSuccess) {
    return (
      <AuthShell
        documentTitle="Check your inbox"
        title="Check your inbox"
        subtitle={
          <>
            We've sent a verification link to <span className="font-medium">{email.trim()}</span>.
            It expires in 24 hours.
          </>
        }
        footer={
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="mb-4 flex justify-center">
          <MailCheck className="size-8 text-success" />
        </div>
        <p className="mb-4 text-center text-xs text-muted-foreground">
          Didn't arrive? Check spam, or send it again.
        </p>
        <ResendVerificationForm defaultEmail={email.trim()} compact />
      </AuthShell>
    );
  }

  const error = signup.error instanceof ApiError ? signup.error : null;
  const errorMessage = error
    ? error.status === 409
      ? 'An account already exists for that email. Try signing in instead.'
      : error.code === 'domain_not_allowed'
        ? `Only ${ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' or ')} addresses can sign up.`
        : error.detail
    : null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!name.trim() || validateWorkEmail(email) || !passwordsReady(passwords)) return;
    signup.mutate();
  };

  return (
    <AuthShell
      documentTitle="Create account"
      title="Create your account"
      subtitle="Restricted to Ripple Links staff."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            autoComplete="name"
            autoFocus
            placeholder="Ananya Sharma"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder={`you@${ALLOWED_EMAIL_DOMAINS[0]}`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={Boolean(emailError)}
          />
          {emailError && <p className="text-[11px] text-destructive">{emailError}</p>}
        </div>

        <PasswordFields value={passwords} onChange={setPasswords} touched={touched} />

        {errorMessage && (
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={signup.isPending}>
          {signup.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
