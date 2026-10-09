import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Password + confirm pair, shared by signup and password reset.
 *
 * The length rule here is UX only — it catches a typo before a round trip, but the
 * backend currently has no password validation on SignUpRequest, so it is not a
 * control. A server-side minimum is listed in PROPOSED_BACKEND_CHANGES.md.
 */
export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordState {
  password: string;
  confirm: string;
}

/** Returns a message when the pair is unusable, or null when it's fine. */
export function validatePasswords({ password, confirm }: PasswordState): string | null {
  if (!password) return null;
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (confirm && password !== confirm) return 'Passwords do not match.';
  return null;
}

export function passwordsReady(state: PasswordState): boolean {
  return (
    state.password.length >= MIN_PASSWORD_LENGTH &&
    state.password === state.confirm
  );
}

export function PasswordFields({
  value,
  onChange,
  touched,
  label = 'Password',
  autoComplete = 'new-password',
}: {
  value: PasswordState;
  onChange: (next: PasswordState) => void;
  touched: boolean;
  label?: string;
  autoComplete?: string;
}) {
  const error = touched ? validatePasswords(value) : null;

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="password">{label}</Label>
        <Input
          id="password"
          type="password"
          autoComplete={autoComplete}
          placeholder="••••••••"
          value={value.password}
          onChange={(event) => onChange({ ...value, password: event.target.value })}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'password-error' : 'password-hint'}
        />
        {!error && (
          <p id="password-hint" className="text-[11px] text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete={autoComplete}
          placeholder="••••••••"
          value={value.confirm}
          onChange={(event) => onChange({ ...value, confirm: event.target.value })}
          aria-invalid={Boolean(error)}
        />
        {error && (
          <p id="password-error" className="text-[11px] text-destructive">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
