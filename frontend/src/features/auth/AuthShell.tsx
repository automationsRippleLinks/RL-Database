import { useEffect, type ReactNode } from 'react';
import { Database } from 'lucide-react';


/**
 * Shared frame for every unauthenticated page (login, signup, verify, reset), so the
 * five of them stay visually identical instead of each re-deriving the layout.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  documentTitle,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  documentTitle: string;
}) {
  useEffect(() => {
    document.title = `${documentTitle} · Ripple Pulse`;
  }, [documentTitle]);

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Database className="size-5" />
          </div>
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-xs">{children}</div>

        {footer && <div className="mt-4 text-center text-xs text-muted-foreground">{footer}</div>}

       
      </div>
    </div>
  );
}
