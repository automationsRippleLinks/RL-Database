import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, PlugZap, ShieldOff } from 'lucide-react';
import { ApiError, USE_MOCKS } from '@/lib/api-client';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="text-muted-foreground/60">{icon ?? <Inbox className="size-7" />}</div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="max-w-md text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Distinguishes "this endpoint isn't built yet" from a real failure, so a
 * missing route doesn't read as a bug in the screen showing it.
 */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const isUnreachable = apiError?.status === 0;
  const isMissing = apiError?.isMissingEndpoint ?? false;
  const isForbidden = apiError?.status === 403;

  let icon = <AlertTriangle className="size-7" />;
  let title = 'Something went wrong';
  let description: ReactNode = apiError?.detail ?? String(error);

  if (isForbidden) {
    icon = <ShieldOff className="size-7" />;
    title = 'Not permitted';
    description = apiError?.detail ?? 'Your account does not have access to this.';
  } else if (isUnreachable) {
    icon = <PlugZap className="size-7" />;
    title = 'Cannot reach the API';
    description = USE_MOCKS ? (
      apiError?.detail
    ) : (
      <>
        The backend did not respond. Start it with <code className="font-mono">fastapi dev</code> in{' '}
        <code className="font-mono">backend/</code>, or set{' '}
        <code className="font-mono">VITE_USE_MOCKS=true</code> to work against fixtures.
      </>
    );
  } else if (isMissing) {
    icon = <PlugZap className="size-7" />;
    title = 'Endpoint not implemented yet';
    description = (
      <>
        The backend has no <code className="font-mono">{apiError?.path}</code> route. Check that it
        is running the same version as this frontend, or set{' '}
        <code className="font-mono">VITE_USE_MOCKS=true</code> to preview this screen with fixtures.
      </>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-14 text-center',
        className,
      )}
    >
      <div className="text-destructive/80">{icon}</div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-lg text-xs text-muted-foreground">{description}</p>
      </div>
      {onRetry && !isMissing && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}
