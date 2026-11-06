import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * "← Back to Fitness Q4": shown only when this page was reached from somewhere else
 * in the app (the link carried backState). It walks real browser history, so the
 * page you return to keeps its filters, sort and scroll, exactly like the Back key.
 */
export function BackLink({ className }: { className?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { from?: string; fromLabel?: string } | null;
  if (!state?.from || !state.fromLabel) return null;
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(state.from!))}
      className={cn(
        'inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-rp-border bg-rp-surface py-1 pr-3 pl-2 text-[12px] font-semibold text-rp-text hover:border-rp-primary hover:text-rp-primary',
        className,
      )}
    >
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      Back to {state.fromLabel}
    </button>
  );
}